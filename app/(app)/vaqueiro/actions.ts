"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AnimalSex } from "@/lib/types";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Traduz o erro do Postgres em um recado que diz O QUE FALTA rodar. Cada caso
 * é reconhecido pelo código do erro, nunca pelo nome da tabela: quase toda
 * falha aqui cita "animal_birth_requests" na mensagem, então checar por nome
 * fazia o calf_tag ainda NOT NULL (053 pendente) ser anunciado como "rode a
 * 048" — mandando rodar de novo o que já tinha rodado.
 */
function birthRequestError(error: { code?: string; message: string }): string {
  // tabela não existe: a 048 não rodou — ou a PARTE 2 dela caiu junto com a
  // PARTE 1, que é o que acontece quando o arquivo inteiro é rodado de uma vez
  if (error.code === "42P01")
    return "Rode a migration 048 no Supabase — a PARTE 1 e a PARTE 2 em execuções separadas";

  // a tabela existe, mas o PostgREST ainda não a enxerga (cache velho)
  if (error.code === "PGRST205" || error.message.includes("schema cache"))
    return "Tabela ainda não visível: recarregue o schema no Supabase (NOTIFY pgrst, 'reload schema')";

  // calf_tag ainda NOT NULL: a 053 é que solta o número do bezerro
  if (error.code === "23502" && error.message.includes("calf_tag"))
    return "Rode a migration 053 no Supabase para enviar sem o número do bezerro";

  // RLS barrou o INSERT: perfil não é vaqueiro/admin, ou as policies da 048 não subiram
  if (error.code === "42501")
    return "Sem permissão para enviar: confirme que seu perfil é vaqueiro e que a PARTE 2 da 048 rodou";

  // qualquer outra coisa vai crua, com o código — chutar migration cega o diagnóstico
  return error.code ? `${error.message} (${error.code})` : error.message;
}

/**
 * Sobe a foto do bezerro e grava a SOLICITAÇÃO em animal_birth_requests
 * (migrations 048 e 053). O vaqueiro só digita o número da MÃE — não escolhe da
 * lista, e não numera o bezerro: o número é do patrão, que confere e lança de
 * verdade na aba "Nascimentos" de Animais. Nada entra no rebanho aqui.
 */
export async function requestCalfBirth(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const motherTag = String(formData.get("mother_tag") ?? "").trim().toUpperCase();
  const birthDate = String(formData.get("birth_date") ?? "");
  const calfSex = String(formData.get("calf_sex") ?? "") as AnimalSex;
  const photo = formData.get("photo");

  if (!motherTag) return { error: "Informe o número da mãe" };
  if (!birthDate) return { error: "Informe a data do nascimento" };
  if (calfSex !== "macho" && calfSex !== "femea") return { error: "Informe o sexo do bezerro" };
  if (!(photo instanceof File) || photo.size === 0)
    return { error: "Coloque uma foto do bezerro" };
  if (photo.size > MAX_FILE_SIZE) return { error: "A foto deve ter no máximo 10 MB" };

  const safeName = photo.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "foto.jpg";
  const photoPath = `animals/vaqueiro/${randomUUID()}_${safeName}`;

  const { error: upErr } = await supabase.storage
    .from("attachments")
    .upload(photoPath, photo, {
      contentType: photo.type || "application/octet-stream",
      upsert: false,
    });
  if (upErr) return { error: upErr.message };

  const { error } = await supabase.from("animal_birth_requests").insert({
    mother_tag: motherTag,
    // o número do bezerro nasce na conferência do patrão (migration 053)
    calf_tag: null,
    calf_sex: calfSex,
    birth_date: birthDate,
    photo_path: photoPath,
    created_by: user.id,
  });

  if (error) {
    await supabase.storage.from("attachments").remove([photoPath]);
    return { error: birthRequestError(error) };
  }

  revalidatePath("/vaqueiro");
  revalidatePath("/animais");
  return { ok: true };
}
