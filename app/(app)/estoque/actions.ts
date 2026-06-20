"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MaterialPurchase } from "@/lib/types";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

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

// ─────────────────────────────────────────────────────────────────────────────
// NOTA FISCAL (anexo da compra)
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadPurchaseAttachment(
  purchaseId: string,
  formData: FormData
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { error: "Arquivo inválido" };
  if (file.size > MAX_FILE_SIZE) return { error: "Arquivo maior que 10 MB" };

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `purchases/${purchaseId}/${randomUUID()}_${safeName}`;

  const { error: upErr } = await supabase.storage
    .from("attachments")
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (upErr) return { error: upErr.message };

  const { error } = await supabase
    .from("material_purchases")
    .update({ attachment_path: path, attachment_name: file.name })
    .eq("id", purchaseId);
  if (error) return { error: error.message };

  revalidate();
  return { ok: true };
}

/** Gera uma URL assinada (1h) para abrir a nota fiscal anexada. */
export async function getPurchaseAttachmentUrl(storagePath: string) {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(storagePath, 60 * 60);
  if (error || !data) return { error: error?.message ?? "Erro ao abrir anexo" };
  return { url: data.signedUrl };
}

export async function deleteMaterialPurchase(id: string) {
  const supabase = createClient();

  // remove a conta a pagar vinculada (se houver) e o anexo do storage
  const { data: purchase } = await supabase
    .from("material_purchases")
    .select("transaction_id, attachment_path")
    .eq("id", id)
    .maybeSingle();

  if (purchase?.transaction_id) {
    await supabase.from("transactions").delete().eq("id", purchase.transaction_id);
  }
  if (purchase?.attachment_path) {
    await supabase.storage.from("attachments").remove([purchase.attachment_path]);
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

// ── Relatório da jazida ──────────────────────────────────────────────────────

export interface JazidaDeliveryRow {
  id: string;
  order_number: number;
  type: string;
  freight_type: string;
  status: string;
  client_name: string | null;
  delivery_address: string | null;
  service_description: string | null;
  delivery_date: string | null;
  issue_date: string;
  total_amount: number;
  items: { quantity: number; unit: string | null; name: string }[];
}

/**
 * Ordens de serviço que retiraram material desta jazida (pickup_location_id):
 * onde foi entregue, quando e qual OS. Usado no relatório da jazida (estoque).
 */
export async function getJazidaDeliveries(
  locationId: string
): Promise<{ deliveries: JazidaDeliveryRow[] }> {
  const supabase = createClient();
  const { data } = await supabase
    .from("service_orders")
    .select(
      "id, order_number, type, freight_type, status, client_name, delivery_address, service_description, delivery_date, issue_date, total_amount, service_order_items(quantity, unit, description, is_freight, products(name))"
    )
    .eq("pickup_location_id", locationId)
    .order("delivery_date", { ascending: false, nullsFirst: false })
    .order("order_number", { ascending: false });

  type Raw = {
    id: string;
    order_number: number;
    type: string;
    freight_type: string;
    status: string;
    client_name: string | null;
    delivery_address: string | null;
    service_description: string | null;
    delivery_date: string | null;
    issue_date: string;
    total_amount: number;
    service_order_items: {
      quantity: number;
      unit: string | null;
      description: string | null;
      is_freight: boolean;
      products: { name: string } | null;
    }[];
  };

  const deliveries: JazidaDeliveryRow[] = ((data as Raw[] | null) ?? []).map((o) => ({
    id: o.id,
    order_number: o.order_number,
    type: o.type,
    freight_type: o.freight_type,
    status: o.status,
    client_name: o.client_name,
    delivery_address: o.delivery_address,
    service_description: o.service_description,
    delivery_date: o.delivery_date,
    issue_date: o.issue_date,
    total_amount: Number(o.total_amount ?? 0),
    items: (o.service_order_items ?? [])
      .filter((it) => !it.is_freight && (it.products?.name || it.description))
      .map((it) => ({
        quantity: Number(it.quantity),
        unit: it.unit,
        name: it.products?.name ?? it.description ?? "",
      })),
  }));

  return { deliveries };
}
