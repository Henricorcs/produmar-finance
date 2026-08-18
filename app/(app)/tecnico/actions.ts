"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { removeSupplyPhotoIfUnused } from "@/lib/supply-photos";

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

/** Um material do envio: da lista (item_id) ou escrito na mão (item_text). */
interface UsageLine {
  item_id: string | null;
  item_text: string | null;
  quantity: number;
}

/**
 * Os materiais chegam como JSON porque agora são vários de uma vez: numa obra
 * o técnico gasta cano, emenda e cola na mesma ida, e obrigar um envio por
 * material é o tipo de coisa que faz ninguém avisar nada.
 */
function parseLines(raw: unknown): UsageLine[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw ?? "[]"));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const lines: UsageLine[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const itemId = String(row.item_id ?? "").trim();
    const itemText = clean(row.item_text);
    if (!itemId && !itemText) continue; // linha em branco: o técnico só não usou
    lines.push({
      item_id: itemId || null,
      item_text: itemId ? null : itemText,
      quantity: parseQty(row.quantity),
    });
  }
  return lines;
}

/**
 * O técnico avisa o material que usou. NÃO mexe no saldo: grava só as
 * solicitações em supply_requests (migration 052). Quem dá baixa de verdade é o
 * chefe, na aba "Pendentes" do Estoque.
 *
 * Cada material vira uma linha própria — é assim que o chefe consegue dar baixa
 * de um e segurar outro. O que é do envio inteiro (obra, lugar, foto,
 * observação) se repete em todas elas.
 */
export async function requestSupplyUsage(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const lines = parseLines(formData.get("items"));
  const obraId = String(formData.get("obra_id") ?? "").trim();
  const destination = clean(formData.get("destination"));
  const notes = clean(formData.get("notes"));
  const photo = formData.get("photo");

  if (lines.length === 0) return { error: "Diga qual material você usou" };
  if (lines.some((l) => l.quantity <= 0))
    return { error: "Informe a quantidade de cada material" };
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

  const sentBy = clean(profile?.full_name);
  const { error } = await supabase.from("supply_requests").insert(
    lines.map((l) => ({
      item_id: l.item_id,
      item_text: l.item_text,
      quantity: l.quantity,
      obra_id: obraId || null,
      destination,
      notes,
      photo_path: photoPath,
      sent_by_name: sentBy,
      created_by: user.id,
    }))
  );

  if (error) {
    if (photoPath) await supabase.storage.from("attachments").remove([photoPath]);
    return { error: requestError(error) };
  }

  revalidatePath("/tecnico");
  revalidatePath("/almoxarifado");
  return { ok: true, count: lines.length };
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

  // a foto pode ser dos outros materiais do mesmo envio — só apaga se sobrou só ela
  await removeSupplyPhotoIfUnused(supabase, req.photo_path as string | null);

  revalidatePath("/tecnico");
  revalidatePath("/almoxarifado");
  return { ok: true };
}
