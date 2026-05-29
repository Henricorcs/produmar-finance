"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LoanRepaymentType, LoanStatus } from "@/lib/types";
import { loanTotalDue } from "@/lib/utils";

function revalidate() {
  revalidatePath("/emprestimos");
  revalidatePath("/dashboard");
  revalidatePath("/contas");
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Soma N meses a uma data YYYY-MM-DD, devolvendo YYYY-MM-DD (sem fuso). */
function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = new Date(y, m - 1 + months, d);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(
    base.getDate()
  ).padStart(2, "0")}`;
}

/** Busca o id da categoria dedicada de empréstimo (criada na migration 006). */
async function loanCategoryId(
  supabase: SupabaseClient,
  type: "entrada" | "saida"
): Promise<string | null> {
  const name = type === "saida" ? "Empréstimo concedido" : "Recebimento de empréstimo";
  const { data } = await supabase
    .from("categories")
    .select("id")
    .eq("name", name)
    .eq("type", type)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Gera/recria o cronograma de parcelas de um empréstimo parcelado.
 * Apaga as parcelas existentes (FK em loan_payments cai para null) e recria.
 */
async function regenerateInstallments(
  supabase: SupabaseClient,
  loanId: string,
  total: number,
  count: number,
  firstDueDate: string
) {
  await supabase.from("loan_installments").delete().eq("loan_id", loanId);
  if (count < 1) return;

  const base = Math.floor((total / count) * 100) / 100;
  const rows = Array.from({ length: count }, (_, i) => {
    const isLast = i === count - 1;
    // última parcela absorve o arredondamento
    const amount = isLast ? Math.round((total - base * (count - 1)) * 100) / 100 : base;
    return {
      loan_id: loanId,
      number: i + 1,
      due_date: addMonths(firstDueDate, i),
      amount,
    };
  });
  await supabase.from("loan_installments").insert(rows);
}

/** Recalcula o status (quitado / em_aberto) com base nos pagamentos. Não mexe em 'cancelado'. */
async function recomputeStatus(supabase: SupabaseClient, loanId: string) {
  const { data: loan } = await supabase
    .from("loans")
    .select("principal, interest_rate, term_months, status")
    .eq("id", loanId)
    .single();
  if (!loan || loan.status === "cancelado") return;

  const { data: payments } = await supabase
    .from("loan_payments")
    .select("amount")
    .eq("loan_id", loanId);

  const totalPaid = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const total = loanTotalDue(loan);
  const newStatus: LoanStatus = totalPaid + 0.005 >= total ? "quitado" : "em_aberto";

  if (newStatus !== loan.status) {
    await supabase.from("loans").update({ status: newStatus }).eq("id", loanId);
  }
}

// ── Loan input ───────────────────────────────────────────────────────────────

export interface LoanInput {
  borrower_name: string;
  borrower_document?: string | null;
  borrower_phone?: string | null;
  principal: number;
  interest_rate?: number | null;
  term_months?: number | null;
  repayment_type: LoanRepaymentType;
  installments_count?: number | null;
  loan_date: string;
  due_date?: string | null;
  notes?: string | null;
}

function validate(input: LoanInput): string | null {
  if (!input.borrower_name?.trim()) return "Nome do devedor é obrigatório";
  if (!(input.principal > 0)) return "Valor emprestado inválido";
  if (!input.loan_date) return "Data do empréstimo é obrigatória";
  if (input.interest_rate != null && input.interest_rate < 0) return "Juros inválido";
  if (input.repayment_type === "parcelado") {
    if (!input.installments_count || input.installments_count < 1)
      return "Informe o número de parcelas";
  }
  return null;
}

function sanitize(input: LoanInput) {
  return {
    borrower_name: input.borrower_name.trim().toUpperCase(),
    borrower_document: input.borrower_document?.trim() || null,
    borrower_phone: input.borrower_phone?.trim() || null,
    principal: input.principal,
    interest_rate:
      input.interest_rate != null && !isNaN(input.interest_rate) && input.interest_rate > 0
        ? input.interest_rate
        : null,
    term_months:
      input.term_months != null && !isNaN(input.term_months) && input.term_months > 0
        ? input.term_months
        : null,
    repayment_type: input.repayment_type,
    installments_count:
      input.repayment_type === "parcelado" ? input.installments_count ?? null : null,
    loan_date: input.loan_date,
    due_date: input.due_date || null,
    notes: input.notes?.trim() ? input.notes.trim().toUpperCase() : null,
  };
}

// ── CRUD ───────────────────────────────────────────────────────────────────

export async function createLoan(input: LoanInput) {
  const err = validate(input);
  if (err) return { error: err };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const fields = sanitize(input);

  const { data: loan, error } = await supabase
    .from("loans")
    .insert({ ...fields, created_by: user.id })
    .select()
    .single();
  if (error || !loan) return { error: error?.message ?? "Erro ao criar empréstimo" };

  // Lançamento de SAÍDA — o dinheiro saiu do caixa
  const categoryId = await loanCategoryId(supabase, "saida");
  const { data: tx } = await supabase
    .from("transactions")
    .insert({
      type: "saida",
      description: `EMPRÉSTIMO #${loan.loan_number} - ${fields.borrower_name}`,
      amount: fields.principal,
      due_date: fields.loan_date,
      paid_date: fields.loan_date,
      status: "pago",
      category_id: categoryId,
      notes: fields.notes,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (tx) {
    await supabase.from("loans").update({ transaction_id: tx.id }).eq("id", loan.id);
  }

  // Cronograma de parcelas (se parcelado)
  if (fields.repayment_type === "parcelado" && fields.installments_count) {
    const total = loanTotalDue(fields);
    const firstDue = fields.due_date || addMonths(fields.loan_date, 1);
    await regenerateInstallments(
      supabase,
      loan.id,
      total,
      fields.installments_count,
      firstDue
    );
  }

  revalidate();
  return { ok: true, id: loan.id };
}

export async function updateLoan(id: string, input: LoanInput) {
  const err = validate(input);
  if (err) return { error: err };

  const supabase = createClient();
  const fields = sanitize(input);

  const { data: existing } = await supabase
    .from("loans")
    .select("transaction_id, loan_number")
    .eq("id", id)
    .single();

  const { error } = await supabase.from("loans").update(fields).eq("id", id);
  if (error) return { error: error.message };

  // Mantém o lançamento de saída em sincronia (valor / descrição / data)
  if (existing?.transaction_id) {
    await supabase
      .from("transactions")
      .update({
        amount: fields.principal,
        description: `EMPRÉSTIMO #${existing.loan_number} - ${fields.borrower_name}`,
        due_date: fields.loan_date,
        paid_date: fields.loan_date,
      })
      .eq("id", existing.transaction_id);
  }

  // Recria o cronograma
  if (fields.repayment_type === "parcelado" && fields.installments_count) {
    const total = loanTotalDue(fields);
    const firstDue = fields.due_date || addMonths(fields.loan_date, 1);
    await regenerateInstallments(supabase, id, total, fields.installments_count, firstDue);
  } else {
    await supabase.from("loan_installments").delete().eq("loan_id", id);
  }

  await recomputeStatus(supabase, id);
  revalidate();
  return { ok: true };
}

export async function deleteLoan(id: string) {
  const supabase = createClient();

  // Coleta lançamentos vinculados + comprovantes no storage
  const [{ data: loan }, { data: payments }, { data: attachments }] = await Promise.all([
    supabase.from("loans").select("transaction_id").eq("id", id).single(),
    supabase.from("loan_payments").select("transaction_id").eq("loan_id", id),
    supabase.from("loan_attachments").select("storage_path").eq("loan_id", id),
  ]);

  const txIds = [
    loan?.transaction_id,
    ...(payments ?? []).map((p) => p.transaction_id),
  ].filter((x): x is string => !!x);

  if (txIds.length > 0) {
    await supabase.from("transactions").delete().in("id", txIds);
  }

  // Remove os arquivos do storage (as linhas caem por cascade junto com o loan)
  if (attachments && attachments.length > 0) {
    await supabase.storage.from("attachments").remove(attachments.map((a) => a.storage_path));
  }

  // installments + payments + attachments caem por cascade
  const { error } = await supabase.from("loans").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidate();
  return { ok: true };
}

export async function setLoanStatus(id: string, status: LoanStatus) {
  const supabase = createClient();
  const { error } = await supabase.from("loans").update({ status }).eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ── Pagamentos ─────────────────────────────────────────────────────────────

export interface PaymentInput {
  amount: number;
  payment_date: string;
  installment_id?: string | null;
  notes?: string | null;
}

export async function addPayment(loanId: string, input: PaymentInput) {
  if (!(input.amount > 0)) return { error: "Valor do pagamento inválido" };
  if (!input.payment_date) return { error: "Data do pagamento é obrigatória" };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { data: loan } = await supabase
    .from("loans")
    .select("loan_number, borrower_name")
    .eq("id", loanId)
    .single();
  if (!loan) return { error: "Empréstimo não encontrado" };

  // Lançamento de ENTRADA — o dinheiro voltou ao caixa
  const categoryId = await loanCategoryId(supabase, "entrada");
  const { data: tx } = await supabase
    .from("transactions")
    .insert({
      type: "entrada",
      description: `RECEB. EMPRÉSTIMO #${loan.loan_number} - ${loan.borrower_name}`,
      amount: input.amount,
      due_date: input.payment_date,
      paid_date: input.payment_date,
      status: "recebido",
      category_id: categoryId,
      notes: input.notes?.trim() ? input.notes.trim().toUpperCase() : null,
      created_by: user.id,
    })
    .select("id")
    .single();

  const { error } = await supabase.from("loan_payments").insert({
    loan_id: loanId,
    installment_id: input.installment_id || null,
    amount: input.amount,
    payment_date: input.payment_date,
    transaction_id: tx?.id ?? null,
    notes: input.notes?.trim() ? input.notes.trim().toUpperCase() : null,
    created_by: user.id,
  });
  if (error) return { error: error.message };

  // Marca a parcela como paga, se vinculada
  if (input.installment_id) {
    await supabase
      .from("loan_installments")
      .update({ paid: true })
      .eq("id", input.installment_id);
  }

  await recomputeStatus(supabase, loanId);
  revalidate();
  return { ok: true };
}

export async function deletePayment(paymentId: string) {
  const supabase = createClient();

  const { data: payment } = await supabase
    .from("loan_payments")
    .select("loan_id, installment_id, transaction_id")
    .eq("id", paymentId)
    .single();
  if (!payment) return { error: "Pagamento não encontrado" };

  if (payment.transaction_id) {
    await supabase.from("transactions").delete().eq("id", payment.transaction_id);
  }
  if (payment.installment_id) {
    await supabase
      .from("loan_installments")
      .update({ paid: false })
      .eq("id", payment.installment_id);
  }

  const { error } = await supabase.from("loan_payments").delete().eq("id", paymentId);
  if (error) return { error: error.message };

  await recomputeStatus(supabase, payment.loan_id);
  revalidate();
  return { ok: true };
}

// ── Comprovantes (anexos) ────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/** Faz upload de um ou mais comprovantes para o bucket 'attachments' sob loans/<id>/. */
export async function uploadLoanAttachments(loanId: string, formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Nenhum arquivo selecionado" };

  const paymentId = (formData.get("payment_id") as string) || null;
  const rows: Record<string, unknown>[] = [];
  const errors: string[] = [];

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      errors.push(`${file.name}: maior que 10 MB`);
      continue;
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `loans/${loanId}/${randomUUID()}_${safeName}`;

    const { error: uploadErr } = await supabase.storage
      .from("attachments")
      .upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadErr) {
      errors.push(`${file.name}: ${uploadErr.message}`);
      continue;
    }

    rows.push({
      loan_id: loanId,
      payment_id: paymentId,
      storage_path: path,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || null,
      created_by: user.id,
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("loan_attachments").insert(rows);
    if (error) return { error: error.message };
  }

  revalidate();
  if (errors.length > 0) return { ok: true as const, warning: errors.join("; ") };
  return { ok: true as const };
}

/** Gera uma URL assinada (1h) para abrir/baixar um comprovante. */
export async function getLoanAttachmentSignedUrl(storagePath: string) {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(storagePath, 60 * 60);
  if (error) return { error: error.message };
  return { url: data.signedUrl };
}

export async function deleteLoanAttachment(id: string) {
  const supabase = createClient();

  const { data: att } = await supabase
    .from("loan_attachments")
    .select("storage_path")
    .eq("id", id)
    .single();
  if (!att) return { error: "Comprovante não encontrado" };

  await supabase.storage.from("attachments").remove([att.storage_path]);

  const { error } = await supabase.from("loan_attachments").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidate();
  return { ok: true };
}
