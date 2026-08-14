"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AnimalSex } from "@/lib/types";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Sobe a foto do bezerro e registra o nascimento pela função
 * register_calf_birth (migration 048) — ela confere a permissão e faz o
 * insert em animals/animal_births/animal_photos numa vez só. A tela do
 * vaqueiro nunca escreve direto nessas tabelas.
 */
export async function registerCalfBirth(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const motherId = String(formData.get("mother_id") ?? "");
  const birthDate = String(formData.get("birth_date") ?? "");
  const calfSex = String(formData.get("calf_sex") ?? "") as AnimalSex;
  const calfTag = String(formData.get("calf_tag") ?? "").trim();
  const photo = formData.get("photo");

  if (!motherId) return { error: "Selecione a mãe" };
  if (!birthDate) return { error: "Informe a data do nascimento" };
  if (calfSex !== "macho" && calfSex !== "femea") return { error: "Informe o sexo do bezerro" };
  if (!calfTag) return { error: "Informe o número do bezerro" };
  if (!(photo instanceof File) || photo.size === 0) return { error: "Tire uma foto do bezerro" };
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

  const { data: calfId, error } = await supabase.rpc("register_calf_birth", {
    p_mother_id: motherId,
    p_calf_tag: calfTag,
    p_calf_sex: calfSex,
    p_birth_date: birthDate,
    p_photo_path: photoPath,
  });

  if (error) {
    await supabase.storage.from("attachments").remove([photoPath]);
    if (error.code === "23505") return { error: "Já existe um animal com esse número" };
    return { error: error.message };
  }

  revalidatePath("/vaqueiro");
  return { ok: true, calfAnimalId: calfId as string };
}
