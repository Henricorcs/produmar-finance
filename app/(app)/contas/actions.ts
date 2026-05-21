"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { TransactionStatus, TransactionType } from "@/lib/types";

interface TransactionPayload {
  type: TransactionType;
  description: string;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: TransactionStatus;
  category_id: string | null;
  cost_center_id: string | null;
  notes: string | null;
}

function parsePayload(formData: FormData): TransactionPayload | { error: string } {
  const type = formData.get("type") as TransactionType;
  const description = String(formData.get("description") ?? "").trim();
  // Accept BR format "1.234,56" or bare "1234.56"
  const amountRaw = String(formData.get("amount") ?? "")
    .replace(/\./g, "")
    .replace(",", ".");
  const amount = parseFloat(amountRaw);
  const due_date = String(formData.get("due_date") ?? "");
  const paid_date = String(formData.get("paid_date") ?? "") || null;
  const status = (formData.get("status") as TransactionStatus) || "pendente";
  const category_id = String(formData.get("category_id") ?? "") || null;
  const cost_center_id = String(formData.get("cost_center_id") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!type || !["entrada", "saida"].includes(type)) return { error: "Tipo inválido" };
  if (!description) return { error: "Descrição é obrigatória" };
  if (isNaN(amount) || amount <= 0) return { error: "Valor inválido" };
  if (!due_date) return { error: "Data de vencimento é obrigatória" };

  return { type, description, amount, due_date, paid_date, status, category_id, cost_center_id, notes };
}

function revalidate() {
  revalidatePath("/contas");
  revalidatePath("/dashboard");
}

export async function createTransaction(formData: FormData) {
  const payload = parsePayload(formData);
  if ("error" in payload) return payload;

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { error } = await supabase
    .from("transactions")
    .insert({ ...payload, created_by: user.id });

  if (error) return { error: error.message };

  revalidate();
  return { ok: true };
}

export async function updateTransaction(id: string, formData: FormData) {
  const payload = parsePayload(formData);
  if ("error" in payload) return payload;

  const supabase = createClient();
  const { error } = await supabase.from("transactions").update(payload).eq("id", id);

  if (error) return { error: error.message };

  revalidate();
  return { ok: true };
}

export async function deleteTransaction(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("transactions").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidate();
  return { ok: true };
}

export async function markTransactionPaid(id: string, type: TransactionType) {
  const supabase = createClient();
  const today = new Date().toISOString().split("T")[0];
  const status: TransactionStatus = type === "entrada" ? "recebido" : "pago";

  const { error } = await supabase
    .from("transactions")
    .update({ status, paid_date: today })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidate();
  return { ok: true };
}
