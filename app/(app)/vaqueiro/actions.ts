"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AnimalSex } from "@/lib/types";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Sobe a foto do bezerro e grava a SOLICITAÇÃO em animal_birth_requests
 * (migration 048). O vaqueiro só digita o número da mãe — não escolhe da
 * lista — e nada entra no rebanho ainda: quem confere e lança de verdade é o
 * patrão, na aba "Nascimentos" de Animais.
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
  const calfTag = String(formData.get("calf_tag") ?? "").trim().toUpperCase();
  const photo = formData.get("photo");

  if (!motherTag) return { error: "Informe o número da mãe" };
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

  const { error } = await supabase.from("animal_birth_requests").insert({
    mother_tag: motherTag,
    calf_tag: calfTag,
    calf_sex: calfSex,
    birth_date: birthDate,
    photo_path: photoPath,
    created_by: user.id,
  });

  if (error) {
    await supabase.storage.from("attachments").remove([photoPath]);
    if (error.code === "42P01" || error.message.includes("animal_birth_requests"))
      return { error: "Rode a migration 048 no Supabase para habilitar o envio" };
    return { error: error.message };
  }

  revalidatePath("/vaqueiro");
  revalidatePath("/animais");
  return { ok: true };
}
