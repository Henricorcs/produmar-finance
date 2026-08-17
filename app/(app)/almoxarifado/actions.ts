"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupplyMovementType } from "@/lib/types";

function revalidate() {
  revalidatePath("/almoxarifado");
}

function clean(s?: string | null): string | null {
  const v = s?.trim();
  return v ? v.toUpperCase() : null;
}

/** Quantidade sempre positiva, com até 3 casas (0,5 m de cano é válido). */
function normQty(v?: number | null): number {
  const n = Math.abs(Number(v ?? 0));
  return Math.round(n * 1000) / 1000;
}

/**
 * A tabela vem da migration 049 — sem ela o erro cru do Postgres não ajuda
 * ninguém a entender o que falta fazer.
 */
function supplyError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Já existe um registro com esse nome";
  if (
    error.code === "42P01" ||
    error.message.includes("supply_items") ||
    error.message.includes("supply_movements") ||
    error.message.includes("supply_categories") ||
    error.message.includes("v_supply_stock")
  )
    return "Rode a migration 049 no Supabase para usar o Estoque";
  return error.message;
}

// ─────────────────────────────────────────────────────────────────────────────
// ITEM (CRUD)
// ─────────────────────────────────────────────────────────────────────────────

export interface SupplyItemInput {
  name: string;
  code?: string | null;
  category_id?: string | null;
  unit?: string | null;
  min_quantity?: number | null;
  location?: string | null;
  notes?: string | null;
}

function normUnit(v?: string | null): string {
  const u = v?.trim();
  return u ? u : "un";
}

/**
 * Cadastra o item. Quando vem `initial_quantity`, já registra a primeira
 * entrada ("saldo inicial") — o saldo do item sempre nasce de um movimento.
 */
export async function createSupplyItem(
  input: SupplyItemInput & { initial_quantity?: number | null; initial_unit_cost?: number | null }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const name = clean(input.name);
  if (!name) return { error: "Informe o nome do item" };

  const { data, error } = await supabase
    .from("supply_items")
    .insert({
      name,
      code: clean(input.code),
      category_id: input.category_id || null,
      unit: normUnit(input.unit),
      min_quantity: normQty(input.min_quantity),
      location: clean(input.location),
      notes: clean(input.notes),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error ? supplyError(error) : "Erro ao cadastrar" };

  const initial = normQty(input.initial_quantity);
  if (initial > 0) {
    const { error: movErr } = await supabase.from("supply_movements").insert({
      item_id: data.id,
      type: "entrada",
      quantity: initial,
      unit_cost: input.initial_unit_cost ? Math.max(0, input.initial_unit_cost) : null,
      notes: "SALDO INICIAL",
      created_by: user.id,
    });
    if (movErr) return { error: supplyError(movErr) };
  }

  revalidate();
  return { ok: true, itemId: data.id as string };
}

export async function updateSupplyItem(id: string, input: SupplyItemInput) {
  const supabase = createClient();

  const name = clean(input.name);
  if (!name) return { error: "Informe o nome do item" };

  const { error } = await supabase
    .from("supply_items")
    .update({
      name,
      code: clean(input.code),
      category_id: input.category_id || null,
      unit: normUnit(input.unit),
      min_quantity: normQty(input.min_quantity),
      location: clean(input.location),
      notes: clean(input.notes),
    })
    .eq("id", id);

  if (error) return { error: supplyError(error) };
  revalidate();
  return { ok: true };
}

/** Exclui o item e todo o histórico de movimentos (por cascade). */
export async function deleteSupplyItem(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("supply_items").delete().eq("id", id);
  if (error) return { error: supplyError(error) };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// MOVIMENTOS (entrada, saída e ajuste)
// ─────────────────────────────────────────────────────────────────────────────

export interface SupplyMovementInput {
  item_id: string;
  type: SupplyMovementType;
  quantity: number;
  unit_cost?: number | null;
  person?: string | null;
  destination?: string | null;
  movement_date?: string | null;
  notes?: string | null;
}

/**
 * Registra o movimento. A saída não deixa o saldo ficar negativo — quem
 * conferiu o estoque e achou diferença usa o AJUSTE, que aceita qualquer valor.
 */
export async function createSupplyMovement(input: SupplyMovementInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!input.item_id) return { error: "Selecione o item" };

  const qty = normQty(input.quantity);
  if (qty <= 0) return { error: "Informe a quantidade" };

  if (input.type === "saida") {
    const { data: stock } = await supabase
      .from("v_supply_stock")
      .select("current_quantity, unit")
      .eq("id", input.item_id)
      .maybeSingle();
    const available = Number(stock?.current_quantity ?? 0);
    if (qty > available)
      return {
        error: `Só tem ${available} ${stock?.unit ?? ""} em estoque`.trim(),
      };
  }

  const { error } = await supabase.from("supply_movements").insert({
    item_id: input.item_id,
    type: input.type,
    quantity: qty,
    unit_cost:
      input.type === "entrada" && input.unit_cost ? Math.max(0, input.unit_cost) : null,
    person: clean(input.person),
    destination: clean(input.destination),
    movement_date: input.movement_date || undefined,
    notes: clean(input.notes),
    created_by: user.id,
  });

  if (error) return { error: supplyError(error) };
  revalidate();
  return { ok: true };
}

/**
 * Acerta o saldo para o valor contado na prateleira. Grava a DIFERENÇA como
 * ajuste (positiva ou negativa) — o histórico continua contando a história toda.
 */
export async function adjustSupplyStock(input: {
  item_id: string;
  counted_quantity: number;
  notes?: string | null;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!input.item_id) return { error: "Selecione o item" };

  const { data: stock } = await supabase
    .from("v_supply_stock")
    .select("current_quantity")
    .eq("id", input.item_id)
    .maybeSingle();
  if (!stock) return { error: "Item não encontrado" };

  const counted = normQty(input.counted_quantity);
  const diff = Math.round((counted - Number(stock.current_quantity ?? 0)) * 1000) / 1000;
  if (diff === 0) return { error: "O saldo já é esse — nada a ajustar" };

  const { error } = await supabase.from("supply_movements").insert({
    item_id: input.item_id,
    type: "ajuste",
    quantity: diff,
    notes: clean(input.notes) ?? `CONTAGEM: ${counted}`,
    created_by: user.id,
  });

  if (error) return { error: supplyError(error) };
  revalidate();
  return { ok: true };
}

/** Apaga um movimento lançado errado — o saldo se acerta sozinho. */
export async function deleteSupplyMovement(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("supply_movements").delete().eq("id", id);
  if (error) return { error: supplyError(error) };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORIAS
// ─────────────────────────────────────────────────────────────────────────────

export async function createSupplyCategory(name: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const n = clean(name);
  if (!n) return { error: "Informe o nome da categoria" };

  const { error } = await supabase
    .from("supply_categories")
    .insert({ name: n, created_by: user.id });
  if (error) return { error: supplyError(error) };
  revalidate();
  return { ok: true };
}

export async function renameSupplyCategory(id: string, name: string) {
  const supabase = createClient();
  const n = clean(name);
  if (!n) return { error: "Informe o nome da categoria" };

  const { error } = await supabase.from("supply_categories").update({ name: n }).eq("id", id);
  if (error) return { error: supplyError(error) };
  revalidate();
  return { ok: true };
}

/** Remove a categoria. Os itens dela NÃO somem — ficam sem categoria. */
export async function deleteSupplyCategory(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("supply_categories").delete().eq("id", id);
  if (error) return { error: supplyError(error) };
  revalidate();
  return { ok: true };
}
