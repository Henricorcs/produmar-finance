"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ObraStatus } from "@/lib/types";

function revalidate() {
  revalidatePath("/obras");
  revalidatePath("/operacoes");
  revalidatePath("/ferramentas");
  revalidatePath("/contas");
  revalidatePath("/cadastros-operacionais");
}

function clean(s?: string | null): string | null {
  const v = s?.trim();
  return v ? v.toUpperCase() : null;
}

export interface ObraInput {
  name: string;
  contact_id?: string | null;
  location?: string | null;
  status?: ObraStatus | null;
  start_date?: string | null;
  planned_end_date?: string | null;
  actual_end_date?: string | null;
  budget?: number | null;
  notes?: string | null;
}

export async function createObra(input: ObraInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const name = clean(input.name);
  if (!name) return { error: "Informe o nome da obra" };

  const { data, error } = await supabase
    .from("obras")
    .insert({
      name,
      contact_id: input.contact_id || null,
      location: clean(input.location),
      status: input.status ?? "planejamento",
      start_date: input.start_date || null,
      planned_end_date: input.planned_end_date || null,
      actual_end_date: input.actual_end_date || null,
      budget: input.budget ?? null,
      notes: clean(input.notes),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Erro ao cadastrar obra" };
  revalidate();
  return { ok: true, obraId: data.id as string };
}

export async function updateObra(id: string, input: ObraInput) {
  const supabase = createClient();

  const name = clean(input.name);
  if (!name) return { error: "Informe o nome da obra" };

  const { error } = await supabase
    .from("obras")
    .update({
      name,
      contact_id: input.contact_id || null,
      location: clean(input.location),
      status: input.status ?? "planejamento",
      start_date: input.start_date || null,
      planned_end_date: input.planned_end_date || null,
      actual_end_date: input.actual_end_date || null,
      budget: input.budget ?? null,
      notes: clean(input.notes),
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

/** Desativa (ou reativa) a obra — histórico e vínculos existentes permanecem. */
export async function setObraActive(id: string, active: boolean) {
  const supabase = createClient();
  const { error } = await supabase.from("obras").update({ active }).eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// ITENS DA OBRA (materiais / mão de obra — lista estilo planilha)
// ─────────────────────────────────────────────────────────────────────────────

export interface ObraItemInput {
  item_date: string;
  product: string;
  quantity: number;
  unit: string;
  unit_price: number;
  market_unit_price?: number | null;
  notes?: string | null;
}

export async function createObraItem(obraId: string, input: ObraItemInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const product = clean(input.product);
  if (!product) return { error: "Informe o produto/descrição" };
  if (!input.quantity || input.quantity <= 0) return { error: "Informe a quantidade" };

  const { error } = await supabase.from("obra_items").insert({
    obra_id: obraId,
    item_date: input.item_date || new Date().toISOString().split("T")[0],
    product,
    quantity: input.quantity,
    unit: clean(input.unit) ?? "UNIDADE",
    unit_price: input.unit_price ?? 0,
    market_unit_price: input.market_unit_price ?? null,
    notes: clean(input.notes),
    created_by: user.id,
  });

  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function updateObraItem(id: string, input: ObraItemInput) {
  const supabase = createClient();

  const product = clean(input.product);
  if (!product) return { error: "Informe o produto/descrição" };
  if (!input.quantity || input.quantity <= 0) return { error: "Informe a quantidade" };

  const { error } = await supabase
    .from("obra_items")
    .update({
      item_date: input.item_date || new Date().toISOString().split("T")[0],
      product,
      quantity: input.quantity,
      unit: clean(input.unit) ?? "UNIDADE",
      unit_price: input.unit_price ?? 0,
      market_unit_price: input.market_unit_price ?? null,
      notes: clean(input.notes),
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function deleteObraItem(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("obra_items").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENTE (cadastro rápido a partir do diálogo de obra)
// ─────────────────────────────────────────────────────────────────────────────

export interface ContactInput {
  name: string;
  document?: string | null;
  phone?: string | null;
}

export async function createContact(input: ContactInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const name = clean(input.name);
  if (!name) return { error: "Informe o nome do cliente" };

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      name,
      document: clean(input.document),
      phone: clean(input.phone),
      is_customer: true,
    })
    .select("*")
    .single();

  if (error || !data) return { error: error?.message ?? "Erro ao cadastrar cliente" };
  revalidate();
  return { ok: true, contact: data };
}

export async function updateContact(id: string, input: ContactInput) {
  const supabase = createClient();

  const name = clean(input.name);
  if (!name) return { error: "Informe o nome do cliente" };

  const { error } = await supabase
    .from("contacts")
    .update({
      name,
      document: clean(input.document),
      phone: clean(input.phone),
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

/** Remove o cliente. Obras que apontam pra ele ficam sem cliente (contact_id vira null). */
export async function deleteContact(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("contacts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}
