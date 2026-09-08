"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/auth";

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO DE NOTAS — o papelzinho de cada um
// ─────────────────────────────────────────────────────────────────────────────
// Esta pasta não tem tela: o bloco mora no topo de TODAS as telas (a Topbar).
// Aqui fica só a gravação. A leitura sai junto com o resto do layout, para não
// custar uma ida a mais ao banco em cada página aberta.
//
// Não tem revalidatePath de propósito: o texto já está na tela de quem digitou,
// e recarregar a página no meio da escrita seria pior que não salvar.

/** Papel de rascunho, não relatório: o que passar disso está sobrando. */
const LIMITE = 20000;

export async function salvarNota(content: string): Promise<{ error?: string }> {
  const userId = await getCurrentUserId();
  if (!userId) return { error: "Entre de novo no sistema para salvar o bloco de notas" };

  const supabase = createClient();
  const { error } = await supabase.from("user_notes").upsert(
    {
      user_id: userId,
      content: (content ?? "").slice(0, LIMITE),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) {
    if (error.code === "42P01")
      return { error: "Rode a migration 090 no Supabase para usar o bloco de notas" };
    return { error: error.message };
  }

  return {};
}
