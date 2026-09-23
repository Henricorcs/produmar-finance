"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TransactionStatus, TransactionType } from "@/lib/types";
import { removerArquivos, uploadArquivo, urlDoArquivo } from "@/lib/storage";
import { criarBoleto, cancelarBoleto } from "@/lib/cora/client";
import { validarCpfCnpj, tipoDocumento } from "@/lib/cpf-cnpj";

interface TransactionPayload {
  type: TransactionType;
  description: string;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: TransactionStatus;
  category_id: string | null;
  cost_center_id: string | null;
  contact_id: string | null;
  obra_id: string | null;
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
  const contact_id = String(formData.get("contact_id") ?? "") || null;
  const obra_id = String(formData.get("obra_id") ?? "") || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!type || !["entrada", "saida"].includes(type)) return { error: "Tipo inválido" };
  if (!description) return { error: "Descrição é obrigatória" };
  if (isNaN(amount) || amount <= 0) return { error: "Valor inválido" };
  if (!due_date) return { error: "Data de vencimento é obrigatória" };

  return {
    type,
    description,
    amount,
    due_date,
    paid_date,
    status,
    category_id,
    cost_center_id,
    contact_id,
    obra_id,
    notes,
  };
}

/** OPEN/LATE são os únicos status em que ainda faz sentido cancelar na Cora. */
const CORA_STATUS_CANCELAVEL = ["OPEN", "LATE"];

/** Best-effort: cancela o boleto na Cora se a transação tiver um em aberto. Não bloqueia a ação do usuário se a Cora falhar. */
async function cancelarBoletoSeExistir(
  supabase: SupabaseClient,
  id: string
): Promise<string | null> {
  const { data } = await supabase
    .from("transactions")
    .select("cora_invoice_id, cora_status")
    .eq("id", id)
    .single();

  if (!data?.cora_invoice_id || !CORA_STATUS_CANCELAVEL.includes(data.cora_status ?? "")) {
    return null;
  }

  try {
    await cancelarBoleto(data.cora_invoice_id);
  } catch (e) {
    return `Não foi possível cancelar o boleto na Cora: ${(e as Error).message}`;
  }
  return null;
}

function revalidate() {
  revalidatePath("/contas");
  revalidatePath("/dashboard");
  revalidatePath("/estoque");
}

// ── Attachment helpers ───────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

async function uploadAttachments(
  supabase: SupabaseClient,
  transactionId: string,
  files: File[],
  userId: string
): Promise<{ uploaded: number; errors: string[] }> {
  const rows: Record<string, unknown>[] = [];
  const errors: string[] = [];

  for (const file of files) {
    if (!file || typeof file !== "object" || file.size === 0) continue;
    if (file.size > MAX_FILE_SIZE) {
      errors.push(`${file.name}: arquivo maior que 10 MB`);
      continue;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${transactionId}/${randomUUID()}_${safeName}`;

    const { error: uploadErr } = await uploadArquivo(path, file);

    if (uploadErr) {
      errors.push(`${file.name}: ${uploadErr.message}`);
      continue;
    }

    rows.push({
      transaction_id: transactionId,
      storage_path: path,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || null,
      created_by: userId,
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("transaction_attachments").insert(rows);
    if (error) errors.push(`Erro ao registrar anexos: ${error.message}`);
  }

  return { uploaded: rows.length, errors };
}

// ── Transaction CRUD ─────────────────────────────────────────────────────────

export async function createTransaction(formData: FormData) {
  const payload = parsePayload(formData);
  if ("error" in payload) return payload;

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { data: created, error } = await supabase
    .from("transactions")
    .insert({ ...payload, created_by: user.id })
    .select()
    .single();

  if (error) return { error: error.message };

  // Upload attachments if any
  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File);
  if (files.length > 0) {
    const { errors } = await uploadAttachments(supabase, created.id, files, user.id);
    if (errors.length > 0) {
      // Transaction was created; report partial failure but don't block
      revalidate();
      return { ok: true, warning: errors.join("; ") };
    }
  }

  revalidate();
  return { ok: true };
}

export async function updateTransaction(id: string, formData: FormData) {
  const payload = parsePayload(formData);
  if ("error" in payload) return payload;

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  // Cancela o boleto na Cora ANTES de gravar — se o usuário está cancelando o
  // lançamento, o boleto não pode continuar em aberto no banco.
  const warning =
    payload.status === "cancelado" ? await cancelarBoletoSeExistir(supabase, id) : null;

  const { error } = await supabase.from("transactions").update(payload).eq("id", id);

  if (error) return { error: error.message };

  // Upload any new attachments
  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File);
  if (files.length > 0) {
    const { errors } = await uploadAttachments(supabase, id, files, user.id);
    if (errors.length > 0) {
      revalidate();
      return { ok: true, warning: [warning, ...errors].filter(Boolean).join("; ") };
    }
  }

  revalidate();
  return warning ? { ok: true, warning } : { ok: true };
}

export async function deleteTransaction(id: string) {
  const supabase = createClient();

  const warning = await cancelarBoletoSeExistir(supabase, id);

  // Clean up storage files first (the DB rows cascade-delete, but storage doesn't)
  const { data: attachments } = await supabase
    .from("transaction_attachments")
    .select("storage_path")
    .eq("transaction_id", id);

  if (attachments && attachments.length > 0) {
    await removerArquivos(attachments.map((a) => a.storage_path));
  }

  const { error } = await supabase.from("transactions").delete().eq("id", id);

  if (error) return { error: error.message };

  revalidate();
  return warning ? { ok: true, warning } : { ok: true };
}

/** Emite um boleto registrado na Cora para o lançamento e grava os dados na transação. */
export async function gerarBoletoCora(id: string) {
  const supabase = createClient();

  const { data: transaction, error: fetchError } = await supabase
    .from("transactions")
    .select("*, contacts(name, document, email)")
    .eq("id", id)
    .single();

  if (fetchError || !transaction) return { error: "Lançamento não encontrado" };
  if (transaction.type !== "entrada") return { error: "Só é possível gerar boleto para receita" };
  if (transaction.cora_invoice_id) return { error: "Este lançamento já tem um boleto gerado" };
  if (transaction.amount < 5) return { error: "A Cora exige valor mínimo de R$ 5,00 no boleto" };

  const contact = transaction.contacts as { name: string; document: string | null; email: string | null } | null;
  if (!contact) return { error: "Selecione um cliente no lançamento antes de gerar o boleto" };

  const tipo = contact.document ? tipoDocumento(contact.document) : null;
  if (!contact.document || !tipo || !validarCpfCnpj(contact.document)) {
    return { error: "O cliente precisa de um CPF ou CNPJ válido cadastrado" };
  }

  let resposta;
  try {
    resposta = await criarBoleto({
      code: transaction.id,
      customer: {
        name: contact.name,
        email: contact.email ?? undefined,
        document: { identity: contact.document.replace(/\D/g, ""), type: tipo },
      },
      services: [
        {
          name: transaction.description.slice(0, 60),
          description: transaction.description.slice(0, 100),
          amount: Math.round(transaction.amount * 100),
        },
      ],
      payment_terms: { due_date: transaction.due_date },
      payment_forms: ["BANK_SLIP", "PIX"],
    });
  } catch (e) {
    return { error: `Falha ao emitir boleto na Cora: ${(e as Error).message}` };
  }

  const { error } = await supabase
    .from("transactions")
    .update({
      cora_invoice_id: resposta.id,
      cora_status: resposta.status,
      boleto_digitable_line: resposta.payment_options?.bank_slip?.digitable ?? null,
      boleto_barcode: resposta.payment_options?.bank_slip?.barcode ?? null,
      boleto_url: resposta.payment_options?.bank_slip?.url ?? null,
      boleto_our_number: resposta.payment_options?.bank_slip?.our_number ?? null,
      pix_emv: resposta.pix?.emv ?? null,
    })
    .eq("id", id);

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

// ── Attachment-specific server actions ───────────────────────────────────────

/** Generates a fresh signed URL (1h) to open/download an attachment. */
export async function getAttachmentSignedUrl(storagePath: string) {
  return { url: urlDoArquivo(storagePath) };
}

export async function deleteAttachment(id: string) {
  const supabase = createClient();

  const { data: att } = await supabase
    .from("transaction_attachments")
    .select("storage_path")
    .eq("id", id)
    .single();

  if (!att) return { error: "Anexo não encontrado" };

  await removerArquivos([att.storage_path]);

  const { error } = await supabase
    .from("transaction_attachments")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidate();
  return { ok: true };
}
