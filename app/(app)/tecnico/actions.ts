"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function clean(s: unknown): string | null {
  const v = String(s ?? "").trim();
  return v ? v.toUpperCase() : null;
}

/** "12,5" → 12.5, sempre positivo e com até 3 casas. */
function parseQty(raw: unknown): number {
  const n = parseFloat(String(raw ?? "").replace(",", "."));
  if (isNaN(n)) return 0;
  return Math.round(Math.abs(n) * 1000) / 1000;
}

function requestError(error: { code?: string; message: string }): string {
  if (error.code === "42P01" || error.message.includes("supply_requests"))
    return "Rode a migration 052 no Supabase para habilitar o envio";
  if (error.message.includes("supply_requests_tem_material"))
    return "Diga qual material você usou";
  if (error.message.includes("supply_requests_tem_lugar"))
    return "Diga a obra ou onde você aplicou";
  return error.message;
}

/**
 * O técnico avisa o material que usou. NÃO mexe no saldo: grava só a
 * solicitação em supply_requests (migration 052). Quem dá baixa de verdade é o
 * chefe, na aba "Pendentes" do Estoque.
 */
export async function requestSupplyUsage(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const itemId = String(formData.get("item_id") ?? "").trim();
  const itemText = clean(formData.get("item_text"));
  const quantity = parseQty(formData.get("quantity"));
  const obraId = String(formData.get("obra_id") ?? "").trim();
  const destination = clean(formData.get("destination"));
  const notes = clean(formData.get("notes"));
  const photo = formData.get("photo");

  if (!itemId && !itemText) return { error: "Diga qual material você usou" };
  if (quantity <= 0) return { error: "Informe a quantidade que você usou" };
  if (!obraId && !destination) return { error: "Diga a obra ou onde você aplicou" };

  // o nome de quem enviou vai gravado: o chefe precisa saber quem pegou
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  // a foto é opcional — sobe antes, para não gravar o recado sem ela
  let photoPath: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    if (photo.size > MAX_FILE_SIZE) return { error: "A foto deve ter no máximo 10 MB" };
    const safeName = photo.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "foto.jpg";
    photoPath = `supply-requests/${randomUUID()}_${safeName}`;
    const { error: upErr } = await supabase.storage
      .from("attachments")
      .upload(photoPath, photo, {
        contentType: photo.type || "application/octet-stream",
        upsert: false,
      });
    if (upErr) return { error: upErr.message };
  }

  const { error } = await supabase.from("supply_requests").insert({
    item_id: itemId || null,
    item_text: itemId ? null : itemText,
    quantity,
    obra_id: obraId || null,
    destination,
    notes,
    photo_path: photoPath,
    sent_by_name: clean(profile?.full_name),
    created_by: user.id,
  });

  if (error) {
    if (photoPath) await supabase.storage.from("attachments").remove([photoPath]);
    return { error: requestError(error) };
  }

  revalidatePath("/tecnico");
  revalidatePath("/almoxarifado");
  return { ok: true };
}

/**
 * Mandou errado? O técnico apaga o próprio recado enquanto o chefe não deu
 * baixa. A policy da 052 só deixa apagar o que ele mesmo enviou.
 */
export async function cancelSupplyUsageRequest(id: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { data: req } = await supabase
    .from("supply_requests")
    .select("photo_path, created_by")
    .eq("id", id)
    .maybeSingle();
  if (!req) return { error: "Envio não encontrado" };
  if (req.created_by !== user.id) return { error: "Você só pode cancelar o que você enviou" };

  const { error } = await supabase.from("supply_requests").delete().eq("id", id);
  if (error) return { error: requestError(error) };

  if (req.photo_path) {
    await supabase.storage.from("attachments").remove([req.photo_path as string]);
  }

  revalidatePath("/tecnico");
  revalidatePath("/almoxarifado");
  return { ok: true };
}
