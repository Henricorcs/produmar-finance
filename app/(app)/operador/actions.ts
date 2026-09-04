"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * A INSCRIÇÃO DO APARELHO PARA RECEBER AVISO DE OS.
 *
 * Quem se inscreve é o navegador do funcionário, no aparelho dele: ele toca em
 * "Ativar alertas", o navegador pede a permissão e devolve um endereço só
 * daquele aparelho, com duas chaves. É isso que é guardado (migration 085) —
 * nenhum dado de OS passa por aqui.
 */

interface Inscricao {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string | null;
}

export async function salvarInscricaoDeAviso(inscricao: Inscricao) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!inscricao?.endpoint || !inscricao.p256dh || !inscricao.auth)
    return { error: "Inscrição incompleta — tente ativar de novo" };

  // O navegador troca a inscrição de tempos em tempos e reenvia a mesma do
  // mesmo aparelho. Por endpoint: atualiza em vez de encher a tabela de linhas
  // repetidas do mesmo celular.
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: inscricao.endpoint,
      p256dh: inscricao.p256dh,
      auth: inscricao.auth,
      user_agent: inscricao.user_agent ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    if (error.message.includes("push_subscriptions"))
      return { error: "Rode a migration 085 no Supabase para ligar os alertas" };
    return { error: error.message };
  }

  return { ok: true };
}

/** "Não quero mais ser avisado neste aparelho." */
export async function apagarInscricaoDeAviso(endpoint: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { ok: true };
}
