"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MaterialPurchase } from "@/lib/types";

function revalidate() {
  revalidatePath("/estoque");
  revalidatePath("/contas");
  revalidatePath("/dashboard");
}

// ── Helpers ────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPRA DE MATERIAL
// ─────────────────────────────────────────────────────────────────────────────

export interface MaterialPurchaseItemInput {
  product_id: string | null;
  quantity: number;
  unit?: string | null;
  unit_price: number;
}

export interface MaterialPurchaseInput {
  location_id?: string | null;
  purchase_date?: string | null;
  amount_paid?: number | null;
  /** Vencimento do saldo devedor (conta a pagar). */
  due_date?: string | null;
  notes?: string | null;
  items: MaterialPurchaseItemInput[];
}

export async function createMaterialPurchase(input: MaterialPurchaseInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  // Apenas itens com produto e quantidade válida entram no estoque
  const items = (input.items ?? []).filter(
    (it) => it.product_id && it.quantity > 0
  );
  if (items.length === 0)
    return { error: "Adicione ao menos um material com quantidade" };
  for (const it of items) {
    if (it.unit_price < 0) return { error: "Valor unitário inválido" };
  }

  const total = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
  const amountPaid = Math.max(0, input.amount_paid ?? 0);
  const purchaseDate = input.purchase_date || todayStr();

  // 1) cabeçalho da compra
  const { data: purchase, error: pErr } = await supabase
    .from("material_purchases")
    .insert({
      location_id: input.location_id || null,
      purchase_date: purchaseDate,
      total_amount: total,
      amount_paid: amountPaid,
      notes: input.notes?.trim() ? input.notes.trim().toUpperCase() : null,
      created_by: user.id,
    })
    .select()
    .single<MaterialPurchase>();

  if (pErr || !purchase)
    return { error: pErr?.message ?? "Erro ao criar compra" };

  // 2) itens
  const { error: iErr } = await supabase.from("material_purchase_items").insert(
    items.map((it) => ({
      purchase_id: purchase.id,
      product_id: it.product_id,
      quantity: it.quantity,
      unit: it.unit?.trim() || null,
      unit_price: it.unit_price,
    }))
  );
  if (iErr) {
    // desfaz o cabeçalho para não deixar compra órfã
    await supabase.from("material_purchases").delete().eq("id", purchase.id);
    return { error: iErr.message };
  }

  // 3) entradas no estoque (uma por item)
  const { error: mErr } = await supabase.from("stock_movements").insert(
    items.map((it) => ({
      product_id: it.product_id,
      location_id: input.location_id || null,
      type: "entrada" as const,
      quantity: it.quantity,
      unit: it.unit?.trim() || null,
      unit_cost: it.unit_price,
      movement_date: purchaseDate,
      purchase_id: purchase.id,
      notes: `Compra #${purchase.purchase_number}`,
      created_by: user.id,
    }))
  );
  if (mErr) {
    await supabase.from("material_purchases").delete().eq("id", purchase.id);
    return { error: mErr.message };
  }

  // 4) saldo devedor → conta a pagar no módulo Contas
  const owed = Math.round((total - amountPaid) * 100) / 100;
  if (owed > 0) {
    let jazidaName = "Jazida";
    if (input.location_id) {
      const { data: loc } = await supabase
        .from("pickup_locations")
        .select("name")
        .eq("id", input.location_id)
        .maybeSingle();
      if (loc?.name) jazidaName = loc.name;
    }

    const { data: cat } = await supabase
      .from("categories")
      .select("id")
      .eq("name", "Compra de material")
      .eq("type", "saida")
      .maybeSingle();

    const { data: tx, error: txErr } = await supabase
      .from("transactions")
      .insert({
        type: "saida",
        description:
          `Compra de material #${purchase.purchase_number} - ${jazidaName}`.toUpperCase(),
        amount: owed,
        due_date: input.due_date || purchaseDate,
        status: "pendente",
        category_id: cat?.id ?? null,
        notes: input.notes?.trim() ? input.notes.trim().toUpperCase() : null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (!txErr && tx) {
      await supabase
        .from("material_purchases")
        .update({ transaction_id: tx.id })
        .eq("id", purchase.id);
    }
  }

  revalidate();
  return { ok: true, purchaseId: purchase.id };
}

export async function payMaterialPurchase(purchaseId: string, amount: number) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!(amount > 0)) return { error: "Informe um valor maior que zero" };

  const { data: p } = await supabase
    .from("material_purchases")
    .select("total_amount, amount_paid, transaction_id")
    .eq("id", purchaseId)
    .maybeSingle();
  if (!p) return { error: "Compra não encontrada" };

  const total = Number(p.total_amount);
  const remainingBefore = Math.round((total - Number(p.amount_paid)) * 100) / 100;
  if (remainingBefore <= 0) return { error: "Esta compra já está quitada" };

  const pay = Math.min(remainingBefore, amount);
  const newPaid = Math.round((Number(p.amount_paid) + pay) * 100) / 100;
  const remainingAfter = Math.round((total - newPaid) * 100) / 100;

  const { error: upErr } = await supabase
    .from("material_purchases")
    .update({ amount_paid: newPaid })
    .eq("id", purchaseId);
  if (upErr) return { error: upErr.message };

  // Mantém a conta a pagar em sincronia: reduz o saldo, quita quando zera.
  if (p.transaction_id) {
    const today = new Date().toISOString().split("T")[0];
    if (remainingAfter > 0) {
      await supabase
        .from("transactions")
        .update({ amount: remainingAfter, status: "pendente", paid_date: null })
        .eq("id", p.transaction_id);
    } else {
      await supabase
        .from("transactions")
        .update({ status: "pago", paid_date: today })
        .eq("id", p.transaction_id);
    }
  }

  revalidate();
  return { ok: true };
}

export async function deleteMaterialPurchase(id: string) {
  const supabase = createClient();

  // remove a conta a pagar vinculada (se houver)
  const { data: purchase } = await supabase
    .from("material_purchases")
    .select("transaction_id")
    .eq("id", id)
    .maybeSingle();

  if (purchase?.transaction_id) {
    await supabase.from("transactions").delete().eq("id", purchase.transaction_id);
  }

  // a exclusão da compra remove itens e entradas de estoque por cascade
  const { error } = await supabase.from("material_purchases").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// AJUSTE MANUAL DE ESTOQUE (saldo inicial / correções / perdas)
// ─────────────────────────────────────────────────────────────────────────────

export async function createStockAdjustment(input: {
  product_id: string;
  /** Quantidade assinada: positiva entra, negativa sai. */
  quantity: number;
  unit?: string | null;
  notes?: string | null;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!input.product_id) return { error: "Selecione um material" };
  if (!input.quantity || input.quantity === 0)
    return { error: "Informe uma quantidade diferente de zero" };

  const { error } = await supabase.from("stock_movements").insert({
    product_id: input.product_id,
    type: "ajuste" as const,
    quantity: input.quantity,
    unit: input.unit?.trim() || null,
    movement_date: todayStr(),
    notes: input.notes?.trim() ? input.notes.trim().toUpperCase() : "Ajuste manual",
    created_by: user.id,
  });

  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function deleteStockMovement(id: string) {
  const supabase = createClient();

  // só permite excluir ajustes manuais (entradas/saídas seguem suas origens)
  const { data: mov } = await supabase
    .from("stock_movements")
    .select("type")
    .eq("id", id)
    .maybeSingle();

  if (!mov) return { error: "Movimentação não encontrada" };
  if (mov.type !== "ajuste")
    return {
      error:
        "Só é possível remover ajustes manuais. Entradas e saídas seguem a compra ou a OS de origem.",
    };

  const { error } = await supabase.from("stock_movements").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}
