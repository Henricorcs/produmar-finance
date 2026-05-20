"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ParsedNFe } from "@/lib/nfe-parser";
import type { TransactionType } from "@/lib/types";

function revalidate() {
  revalidatePath("/notas-fiscais");
  revalidatePath("/contas");
  revalidatePath("/dashboard");
}

/** Save a parsed NF-e to the invoices table. */
export async function saveInvoice(parsed: ParsedNFe) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!parsed.total_amount || parsed.total_amount <= 0) {
    return { error: "Valor total da NF-e inválido ou zero." };
  }

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      source: "xml",
      access_key: parsed.access_key,
      number: parsed.number,
      series: parsed.series,
      issue_date: parsed.issue_date,
      emitter_document: parsed.emitter_document,
      emitter_name: parsed.emitter_name,
      receiver_document: parsed.receiver_document,
      receiver_name: parsed.receiver_name,
      total_amount: parsed.total_amount,
      direction: parsed.direction,
      processed: false,
      raw_data: parsed,
    })
    .select()
    .single();

  if (error) {
    // Unique constraint on access_key = duplicate NF-e
    if (error.code === "23505") {
      return { error: "Essa NF-e já foi importada (chave de acesso duplicada)." };
    }
    return { error: error.message };
  }

  revalidate();
  return { ok: true, invoice: data };
}

/** Create a financial transaction linked to an invoice. */
export async function createTransactionFromInvoice(
  invoiceId: string,
  categoryId: string | null,
  costCenterId: string | null
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  // Fetch the invoice
  const { data: inv, error: fetchErr } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  if (fetchErr || !inv) return { error: "Nota fiscal não encontrada." };
  if (inv.processed) return { error: "Já existe um lançamento para esta nota." };

  // Build description from emitter or receiver depending on direction
  const counterpart =
    inv.direction === "saida"
      ? (inv.emitter_name ?? "Fornecedor")
      : (inv.receiver_name ?? "Cliente");
  const description = `NF ${inv.number ?? "s/n"} — ${counterpart}`;

  const type: TransactionType = inv.direction ?? "saida";
  const today = new Date().toISOString().split("T")[0];

  // Insert transaction
  const { data: tx, error: txErr } = await supabase
    .from("transactions")
    .insert({
      type,
      description,
      amount: inv.total_amount,
      due_date: inv.issue_date ?? today,
      status: "pendente",
      category_id: categoryId || null,
      cost_center_id: costCenterId || null,
      invoice_id: invoiceId,
      created_by: user.id,
    })
    .select()
    .single();

  if (txErr) return { error: txErr.message };

  // Mark invoice as processed
  await supabase
    .from("invoices")
    .update({ processed: true, transaction_id: tx.id })
    .eq("id", invoiceId);

  revalidate();
  return { ok: true, transactionId: tx.id };
}

/** Delete an invoice (only if not yet linked to a transaction). */
export async function deleteInvoice(invoiceId: string) {
  const supabase = createClient();

  const { data: inv } = await supabase
    .from("invoices")
    .select("processed, transaction_id")
    .eq("id", invoiceId)
    .single();

  if (inv?.processed && inv.transaction_id) {
    return {
      error:
        "Esta NF-e já tem um lançamento associado. Exclua o lançamento primeiro.",
    };
  }

  const { error } = await supabase.from("invoices").delete().eq("id", invoiceId);
  if (error) return { error: error.message };

  revalidate();
  return { ok: true };
}
