"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOAN_PAYMENT_METHODS } from "@/lib/types";
import type { LoanPaymentMethod, LoanRepaymentType, LoanStatus } from "@/lib/types";
import { loanTotalDue } from "@/lib/utils";
import { removerArquivos, uploadArquivo, urlDoArquivo } from "@/lib/storage";
import { descartarAssinatura } from "@/lib/documentos-assinados";
import {
  cancelarBoletoDaDivida,
  conferirBoletosDasDividasNaCora,
  criarBoletosDaDividaNoSistema,
  registrarBoletosDaDividaNoBanco,
} from "@/lib/devedores-boletos-banco";

/**
 * ESTE MÓDULO NÃO ENCOSTA NO CAIXA. NUNCA.
 *
 * Ele nasceu como "Empréstimos" e lançava tudo sozinho: a saída quando o
 * dinheiro era emprestado, um recebível por parcela e a entrada a cada
 * pagamento. O dono pediu para parar — quem lança no caixa é ele, na mão, no
 * dia em que o dinheiro de fato se move. Aqui é CONTROLE DE DEVEDORES: quem
 * deve, quanto, quando vence e quanto já pagou.
 *
 * A regra é uma só, sem exceção: NENHUMA operação daqui escreve, atualiza ou
 * APAGA linha em `transactions`. Nem criar dívida, nem editar, nem excluir,
 * nem registrar ou remover pagamento.
 *
 * Por que nem apagar: as dívidas lançadas antes desta mudança deixaram
 * lançamentos no caixa, e eles são passado do dono — dinheiro que ele já
 * conferiu. Excluir uma dívida aqui e ver o caixa encolher sozinho é
 * exatamente o susto que este módulo existe para não dar. Se um "A RECEBER"
 * ficar sobrando lá depois de a dívida sumir daqui, quem apaga é ele, em
 * Finanças, olhando o que está apagando.
 *
 * As colunas `transaction_id` / `receivable_transaction_id` continuam na
 * tabela por causa dessas dívidas antigas — ninguém mais as lê nem as
 * escreve. Em dívida nova elas ficam nulas.
 */
function revalidate() {
  // Só a tela do módulo: nada do que se faz aqui muda o caixa.
  revalidatePath("/devedores");
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

/**
 * Gera/recria o cronograma de parcelas de uma dívida parcelada.
 *
 * O cronograma é do MÓDULO, não do caixa: aqui nascem só as linhas de
 * `loan_installments` — a parcela, o valor e o vencimento, que é o que a
 * cobrança precisa. Nenhum lançamento é criado (ver a nota no topo do arquivo).
 *
 * O recebível que as parcelas antigas deixaram no caixa NÃO é tocado — ver a
 * regra no topo do arquivo.
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
  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    // última parcela absorve o arredondamento
    const amount = isLast ? Math.round((total - base * (count - 1)) * 100) / 100 : base;

    await supabase.from("loan_installments").insert({
      loan_id: loanId,
      number: i + 1,
      due_date: addMonths(firstDueDate, i),
      amount,
    });
  }
}

/**
 * O cronograma que está gravado já é este? Comparar antes de refazer importa:
 * `regenerateInstallments` apaga e recria as parcelas, e com elas vai embora a
 * marca de PAGA de cada uma (o pagamento em si sobrevive, mas a parcela volta
 * a aparecer em aberto). Sem esta conferência, corrigir o telefone do devedor
 * ressuscitava parcela que já tinha sido paga.
 */
async function cronogramaMudou(
  supabase: SupabaseClient,
  loanId: string,
  total: number,
  count: number,
  firstDueDate: string
): Promise<boolean> {
  const { data } = await supabase
    .from("loan_installments")
    .select("amount, due_date")
    .eq("loan_id", loanId)
    .order("due_date", { ascending: true });

  const atuais = data ?? [];
  if (atuais.length !== count) return true;
  if (atuais[0]?.due_date !== firstDueDate) return true;

  const somaAtual = atuais.reduce((s, i) => s + Number(i.amount), 0);
  return Math.abs(somaAtual - total) >= 0.005;
}

/** Recalcula o status (quitado / em_aberto) com base nos pagamentos. Não mexe em 'cancelado'. */
async function recomputeStatus(supabase: SupabaseClient, loanId: string) {
  const { data: loan } = await supabase
    .from("loans")
    .select("principal, interest_rate, term_months, interest_amount, status")
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
  /** A qualificação para a confissão de dívida (141) — undefined = não mexe. */
  borrower_nationality?: string | null;
  borrower_marital_status?: string | null;
  borrower_profession?: string | null;
  borrower_rg?: string | null;
  borrower_address?: string | null;
  borrower_rep_name?: string | null;
  borrower_rep_document?: string | null;
  principal: number;
  interest_rate?: number | null;
  term_months?: number | null;
  interest_amount?: number | null;
  repayment_type: LoanRepaymentType;
  installments_count?: number | null;
  /** Boleto, pix, cartão ou dinheiro (093) — em branco quando não informado. */
  payment_method?: LoanPaymentMethod | null;
  loan_date: string;
  due_date?: string | null;
  notes?: string | null;
}

/** Só os quatro meios que a tela oferece entram no banco. */
function normPaymentMethod(v?: LoanPaymentMethod | null): LoanPaymentMethod | null {
  return v && LOAN_PAYMENT_METHODS.includes(v) ? v : null;
}

/**
 * Erro do banco em recado que diz o que fazer. O caso que importa é a coluna
 * da forma de pagamento faltando: sem separar, o dono via o erro cru do
 * Postgres e não tinha como saber que o que faltava era rodar a 093.
 */
function loanError(error: { code?: string; message: string }, padrao: string): string {
  if (
    (error.code === "42703" || error.code === "PGRST204") &&
    error.message.includes("payment_method")
  )
    return "Rode a migration 093 no Supabase para guardar a forma de pagamento";
  return error.message || padrao;
}

function validate(input: LoanInput): string | null {
  if (!input.borrower_name?.trim()) return "Nome do devedor é obrigatório";
  if (!(input.principal > 0)) return "Valor devido inválido";
  if (!input.loan_date) return "Data da dívida é obrigatória";
  if (input.interest_rate != null && input.interest_rate < 0) return "Juros inválido";
  if (input.repayment_type === "parcelado") {
    if (!input.installments_count || input.installments_count < 1)
      return "Informe o número de parcelas";
  }
  return null;
}

/**
 * Os campos da qualificação (migration 141), em caixa alta. Só entram os que
 * a tela mandou: sem eles (undefined), a dívida salva como antes.
 */
function qualificacao(input: LoanInput) {
  const campos = [
    "borrower_nationality",
    "borrower_marital_status",
    "borrower_profession",
    "borrower_rg",
    "borrower_address",
    "borrower_rep_name",
    "borrower_rep_document",
  ] as const;
  const out: Partial<Record<(typeof campos)[number], string | null>> = {};
  for (const c of campos) {
    if (input[c] === undefined) continue;
    const v = input[c]?.trim();
    out[c] = v ? v.toUpperCase() : null;
  }
  return out;
}

function sanitize(input: LoanInput) {
  return {
    borrower_name: input.borrower_name.trim().toUpperCase(),
    borrower_document: input.borrower_document?.trim() || null,
    borrower_phone: input.borrower_phone?.trim() || null,
    ...qualificacao(input),
    principal: input.principal,
    interest_rate:
      input.interest_rate != null && !isNaN(input.interest_rate) && input.interest_rate > 0
        ? input.interest_rate
        : null,
    term_months:
      input.term_months != null && !isNaN(input.term_months) && input.term_months > 0
        ? input.term_months
        : null,
    interest_amount:
      input.interest_amount != null && !isNaN(Number(input.interest_amount)) && Number(input.interest_amount) > 0
        ? input.interest_amount
        : null,
    repayment_type: input.repayment_type,
    installments_count:
      input.repayment_type === "parcelado" ? input.installments_count ?? null : null,
    payment_method: normPaymentMethod(input.payment_method),
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
  if (error || !loan)
    return { error: error ? loanError(error, "Erro ao criar a dívida") : "Erro ao criar a dívida" };

  // Parcelado: nasce o cronograma. Nada vai para o caixa — quem lança lá é o
  // dono, na mão, no dia em que o dinheiro de fato entrar ou sair.
  if (fields.repayment_type === "parcelado" && fields.installments_count) {
    await regenerateInstallments(
      supabase,
      loan.id,
      loanTotalDue(fields),
      fields.installments_count,
      fields.due_date || addMonths(fields.loan_date, 1)
    );
  }

  revalidate();
  return { ok: true, id: loan.id };
}

export async function updateLoan(id: string, input: LoanInput) {
  const err = validate(input);
  if (err) return { error: err };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };
  const fields = sanitize(input);

  const { error } = await supabase.from("loans").update(fields).eq("id", id);
  if (error) return { error: loanError(error, "Erro ao salvar a dívida") };

  // O lançamento que uma dívida ANTIGA deixou no caixa não é mexido aqui de
  // propósito: o caixa é da mão do dono agora, e a tela corrigindo valor por
  // baixo do dedo é justamente o que ele pediu para acabar.
  if (fields.repayment_type === "parcelado" && fields.installments_count) {
    const total = loanTotalDue(fields);
    const firstDue = fields.due_date || addMonths(fields.loan_date, 1);
    // Só refaz o cronograma quando ele REALMENTE mudou — refazer à toa apaga
    // a marca das parcelas já pagas.
    if (await cronogramaMudou(supabase, id, total, fields.installments_count, firstDue)) {
      await regenerateInstallments(supabase, id, total, fields.installments_count, firstDue);
    }
  } else {
    // Virou avulso: o cronograma não vale mais. O recebível que as parcelas
    // antigas deixaram no caixa fica onde está — ver a regra no topo.
    await supabase.from("loan_installments").delete().eq("loan_id", id);
  }

  await recomputeStatus(supabase, id);
  // A confissão de dívida assinada com certificado tem o texto de antes: com a
  // dívida mudada ela não vale mais — como no contrato de aluguel editado.
  await descartarAssinatura("confissao_divida", id);
  revalidate();
  return { ok: true };
}

export async function deleteLoan(id: string) {
  const supabase = createClient();

  // O que esta dívida deixou no caixa quando o módulo ainda lançava sozinho
  // NÃO é tocado: é passado do dono, e ver o caixa encolher por causa de uma
  // exclusão feita aqui é o susto que este módulo existe para não dar. Sobrou
  // um "A RECEBER" lá? Quem apaga é ele, em Finanças.
  const { data: attachments } = await supabase
    .from("loan_attachments")
    .select("storage_path")
    .eq("loan_id", id);

  // Os comprovantes, sim: são arquivos DESTE módulo, e sem a dívida eles
  // viram lixo pago no storage.
  if (attachments && attachments.length > 0) {
    await removerArquivos(attachments.map((a) => a.storage_path));
  }

  // installments + payments + attachments caem por cascade
  const { error } = await supabase.from("loans").delete().eq("id", id);
  if (error) return { error: error.message };
  // a confissão assinada desta dívida vira lixo sem ela
  await descartarAssinatura("confissao_divida", id);

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

  // O pagamento fica SÓ aqui: abate o saldo do devedor e marca a parcela.
  // A entrada no caixa é lançada à mão pelo dono, no dia em que o dinheiro
  // entrou de verdade — foi para isso que a integração automática saiu.
  const { error } = await supabase.from("loan_payments").insert({
    loan_id: loanId,
    installment_id: input.installment_id || null,
    amount: input.amount,
    payment_date: input.payment_date,
    notes: input.notes?.trim() ? input.notes.trim().toUpperCase() : null,
    created_by: user.id,
  });
  if (error) return { error: error.message };

  if (input.installment_id) {
    await supabase.from("loan_installments").update({ paid: true }).eq("id", input.installment_id);
  }

  await recomputeStatus(supabase, loanId);
  revalidate();
  return { ok: true };
}

export async function deletePayment(paymentId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { data: payment } = await supabase
    .from("loan_payments")
    .select("loan_id, installment_id")
    .eq("id", paymentId)
    .single();
  if (!payment) return { error: "Pagamento não encontrado" };

  // A entrada que um pagamento ANTIGO deixou no caixa fica lá: é dinheiro que
  // o dono já conferiu, e quem decide tirar é ele, em Finanças.
  await supabase.from("loan_payments").delete().eq("id", paymentId);

  if (payment.installment_id) {
    await supabase
      .from("loan_installments")
      .update({ paid: false })
      .eq("id", payment.installment_id);
  }

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

    const { error: uploadErr } = await uploadArquivo(path, file);

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
  return { url: urlDoArquivo(storagePath) };
}

export async function deleteLoanAttachment(id: string) {
  const supabase = createClient();

  const { data: att } = await supabase
    .from("loan_attachments")
    .select("storage_path")
    .eq("id", id)
    .single();
  if (!att) return { error: "Comprovante não encontrado" };

  await removerArquivos([att.storage_path]);

  const { error } = await supabase.from("loan_attachments").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidate();
  return { ok: true };
}

// ── Boletos da dívida (migration 139) ─────────────────────────────────────────
// Do mesmo jeito dos boletos do aluguel: "Gerar no sistema" cria os boletos
// (um por parcela, ou um com o saldo); depois de confirmar, "Gerar no banco"
// registra na Cora. Pago no banco, a baixa entra sozinha — ver
// lib/devedores-boletos-banco. Nada disso encosta no caixa.

/** "Gerar no sistema": os boletos que faltam, só aqui (sem banco). */
export async function gerarBoletosDaDivida(loanId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };
  const r = await criarBoletosDaDividaNoSistema(supabase, loanId, user.id);
  revalidate();
  if (r.gerados === 0 && r.aviso) return { error: r.aviso };
  return { ok: true as const, ...r };
}

/** "Gerar no banco": um boleto (id) ou todos os da dívida que estão só no sistema. */
export async function gerarBoletoDaDividaNoBanco(loanId: string, boletoId: string | null) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };
  const r = await registrarBoletosDaDividaNoBanco(supabase, loanId, boletoId ? [boletoId] : null);
  revalidate();
  if (r.gerados === 0 && r.aviso) return { error: r.aviso };
  return { ok: true as const, ...r };
}

/** Cancela um boleto da dívida (pagou de outro jeito, valor errado...). */
export async function cancelarBoletoDivida(id: string) {
  const supabase = createClient();
  const r = await cancelarBoletoDaDivida(supabase, id);
  revalidate();
  return r;
}

// a última conferência automática (por processo): abrir a tela várias vezes
// seguidas não pergunta à Cora toda vez
let ultimaConferenciaDividas = 0;

/**
 * Confere na Cora os boletos de dívida em aberto no banco e dá a baixa dos
 * pagos. A tela de Devedores chama sozinha ao abrir (no máximo a cada 5 min).
 */
export async function conferirPagamentosDasDividas(agora = false) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };
  if (!agora && Date.now() - ultimaConferenciaDividas < 5 * 60 * 1000)
    return { ok: true as const, conferidos: 0, baixados: 0 };
  ultimaConferenciaDividas = Date.now();
  const r = await conferirBoletosDasDividasNaCora(supabase);
  if (r.baixados > 0) revalidate();
  if (agora && r.erros.length > 0 && r.baixados === 0)
    return { error: `Não consegui conferir no banco: ${r.erros[0]}` };
  return { ok: true as const, conferidos: r.conferidos, baixados: r.baixados };
}
