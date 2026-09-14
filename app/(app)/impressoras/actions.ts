"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { calcularFatura, centavos, precoDaPagina, vencimentoDaFatura } from "@/lib/impressoras";
import type {
  DadosDoRelatorioImpressoes,
  Printer,
  PrinterBilling,
  PrinterContract,
  PrinterContractStatus,
  PrinterReading,
} from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// ALUGUEL DE IMPRESSORAS (migration 096)
// ─────────────────────────────────────────────────────────────────────────────
// Como o resto de Aluguéis, nada daqui vira lançamento no módulo Contas: é o
// controle do contrato, a leitura do contador e a fatura de cada mês.

function revalidate() {
  revalidatePath("/impressoras");
  // a aba do operador que lança a leitura (migration 097)
  revalidatePath("/operador/impressoras");
}

/** Texto de cadastro: CAIXA ALTA, vazio vira null. */
function clean(s?: string | null): string | null {
  const v = s?.trim();
  return v ? v.toUpperCase() : null;
}

function money(v?: number | null): number {
  const n = Math.abs(Number(v ?? 0));
  return isNaN(n) ? 0 : centavos(n);
}

function preco(v?: number | null): number {
  const n = Math.abs(Number(v ?? 0));
  return isNaN(n) ? 0 : Math.round(n * 10000) / 10000;
}

function contador(v?: number | null): number {
  const n = Math.round(Number(v ?? 0));
  return isNaN(n) || n < 0 ? 0 : n;
}

/** Tabela que ainda não existe → recado que diz o que fazer. */
function impressoraError(error: { code?: string; message: string }): string {
  if (error.code === "42P01" || error.code === "PGRST205")
    return "Rode a migration 096 no Supabase para usar o aluguel de impressoras";
  if (error.code === "23514" && error.message.includes("contador"))
    return "A leitura atual não pode ser menor que a anterior";
  return error.message;
}

// ── Contrato ────────────────────────────────────────────────────────────────

export interface PrinterContractInput {
  client_name: string;
  client_document?: string | null;
  contract_number?: string | null;
  issuer_name?: string | null;
  franchise_pages?: number | null;
  page_price?: number | null;
  due_day?: number | null;
  start_date?: string | null;
  notes?: string | null;
  initial_reading_date?: string | null;
  issuer_city?: string | null;
  signer_name?: string | null;
  signer_document?: string | null;
  signer_phone?: string | null;
}

function contratoRow(input: PrinterContractInput) {
  return {
    client_name: clean(input.client_name) ?? "",
    client_document: clean(input.client_document),
    contract_number: clean(input.contract_number),
    issuer_name: clean(input.issuer_name),
    franchise_pages: contador(input.franchise_pages),
    page_price: preco(input.page_price),
    due_day: Math.min(31, Math.max(1, Math.round(Number(input.due_day) || 10))),
    start_date: input.start_date?.trim() || undefined,
    notes: clean(input.notes),
    initial_reading_date: input.initial_reading_date?.trim() || null,
    issuer_city: clean(input.issuer_city),
    signer_name: clean(input.signer_name),
    signer_document: clean(input.signer_document),
    signer_phone: input.signer_phone?.trim() || null,
  };
}

export async function createPrinterContract(input: PrinterContractInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };
  if (!clean(input.client_name)) return { error: "Informe o cliente" };

  const { data, error } = await supabase
    .from("printer_contracts")
    .insert({ ...contratoRow(input), created_by: user.id })
    .select("id")
    .single();
  if (error) return { error: impressoraError(error) };
  revalidate();
  return { ok: true, id: data.id as string };
}

export async function updatePrinterContract(id: string, input: PrinterContractInput) {
  const supabase = createClient();
  if (!clean(input.client_name)) return { error: "Informe o cliente" };
  const { error } = await supabase.from("printer_contracts").update(contratoRow(input)).eq("id", id);
  if (error) return { error: impressoraError(error) };
  revalidate();
  return { ok: true };
}

export async function setPrinterContractStatus(id: string, status: PrinterContractStatus) {
  const supabase = createClient();
  const { error } = await supabase
    .from("printer_contracts")
    .update({ status: status === "encerrado" ? "encerrado" : "ativo" })
    .eq("id", id);
  if (error) return { error: impressoraError(error) };
  revalidate();
  return { ok: true };
}

// ── Impressora ──────────────────────────────────────────────────────────────

export interface PrinterInput {
  contract_id: string;
  unit: number;
  serial_number: string;
  model?: string | null;
  location?: string | null;
  monthly_fee?: number | null;
  /** Vazio = usa o do contrato. */
  page_price?: number | null;
  initial_reading?: number | null;
  active?: boolean;
  notes?: string | null;
}

function impressoraRow(input: PrinterInput) {
  return {
    contract_id: input.contract_id,
    unit: Math.max(0, Math.round(Number(input.unit) || 0)),
    serial_number: clean(input.serial_number) ?? "",
    model: clean(input.model),
    location: clean(input.location),
    monthly_fee: money(input.monthly_fee),
    page_price:
      input.page_price === null || input.page_price === undefined || String(input.page_price) === ""
        ? null
        : preco(input.page_price),
    initial_reading: contador(input.initial_reading),
    active: input.active !== false,
    notes: clean(input.notes),
  };
}

function impressoraInvalida(input: PrinterInput): string | null {
  if (!input.contract_id) return "Contrato não encontrado";
  if (!clean(input.serial_number)) return "Informe o número de série";
  if (!(Number(input.unit) > 0)) return "Informe a unidade (UNID)";
  return null;
}

export async function createPrinter(input: PrinterInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };
  const invalida = impressoraInvalida(input);
  if (invalida) return { error: invalida };

  const { error } = await supabase
    .from("printers")
    .insert({ ...impressoraRow(input), created_by: user.id });
  if (error) return { error: impressoraError(error) };
  revalidate();
  return { ok: true };
}

export async function updatePrinter(id: string, input: PrinterInput) {
  const supabase = createClient();
  const invalida = impressoraInvalida(input);
  if (invalida) return { error: invalida };
  const { error } = await supabase.from("printers").update(impressoraRow(input)).eq("id", id);
  if (error) return { error: impressoraError(error) };
  revalidate();
  return { ok: true };
}

/**
 * Apaga a impressora — só se ela nunca teve leitura. A que já entrou em fatura
 * não sai: apagá-la levaria junto as leituras e mudaria o total de faturas já
 * cobradas. Essa se DESATIVA, e some dos meses seguintes.
 */
export async function deletePrinter(id: string) {
  const supabase = createClient();
  const { count } = await supabase
    .from("printer_readings")
    .select("id", { count: "exact", head: true })
    .eq("printer_id", id);
  if ((count ?? 0) > 0)
    return {
      error:
        "Esta impressora já entrou em fatura — desative em vez de apagar, para não mudar o que já foi cobrado",
    };

  const { error } = await supabase.from("printers").delete().eq("id", id);
  if (error) return { error: impressoraError(error) };
  revalidate();
  return { ok: true };
}

// ── A fatura do mês ─────────────────────────────────────────────────────────

export interface LeiturasDoMesInput {
  contract_id: string;
  /** O mês de referência, "2026-08-01". */
  competencia: string;
  previous_date?: string | null;
  reading_date: string;
  due_date?: string | null;
  notes?: string | null;
  leituras: { printer_id: string; previous_reading: number; current_reading: number }[];
}

/**
 * Fecha (ou corrige) a fatura do mês com as leituras de cada impressora.
 *
 * A mensalidade e o preço da página vêm do CADASTRO, aqui no servidor — não da
 * tela — e ficam copiados na leitura: um reajuste amanhã não reescreve a fatura
 * de hoje. Os totais são refeitos com a mesma conta da tela (lib/impressoras).
 */
export async function salvarLeiturasDoMes(input: LeiturasDoMesInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!input.contract_id) return { error: "Contrato não encontrado" };
  if (!input.reading_date) return { error: "Informe a data da leitura" };
  if (input.leituras.length === 0) return { error: "Lance a leitura de pelo menos uma impressora" };

  for (const l of input.leituras) {
    if (contador(l.current_reading) < contador(l.previous_reading))
      return { error: "A leitura atual de uma impressora está menor que a anterior — confira" };
  }

  const [contratoRes, impressorasRes] = await Promise.all([
    supabase.from("printer_contracts").select("*").eq("id", input.contract_id).maybeSingle(),
    supabase
      .from("printers")
      .select("*")
      .in(
        "id",
        input.leituras.map((l) => l.printer_id)
      ),
  ]);
  if (contratoRes.error) return { error: impressoraError(contratoRes.error) };
  const contrato = contratoRes.data as PrinterContract | null;
  if (!contrato) return { error: "Contrato não encontrado" };
  const impressoras = new Map(((impressorasRes.data as Printer[]) ?? []).map((p) => [p.id, p]));

  const linhas = input.leituras
    .filter((l) => impressoras.has(l.printer_id))
    .map((l) => {
      const p = impressoras.get(l.printer_id)!;
      return {
        printer_id: l.printer_id,
        previous_reading: contador(l.previous_reading),
        current_reading: contador(l.current_reading),
        monthly_fee: money(p.monthly_fee),
        page_price: precoDaPagina(p, contrato),
      };
    });

  const franchisePrice = Number(contrato.page_price);
  const t = calcularFatura(linhas, Number(contrato.franchise_pages), franchisePrice);

  const competencia = `${input.competencia.slice(0, 7)}-01`;
  const { data: fatura, error: faturaErr } = await supabase
    .from("printer_billings")
    .upsert(
      {
        contract_id: contrato.id,
        competencia,
        previous_date: input.previous_date?.trim() || null,
        reading_date: input.reading_date,
        due_date: input.due_date?.trim() || vencimentoDaFatura(competencia, contrato.due_day),
        franchise_pages: Number(contrato.franchise_pages),
        franchise_price: franchisePrice,
        total_pages: t.total_pages,
        total_fees: t.total_fees,
        total_prints: t.total_prints,
        franchise_amount: t.franchise_amount,
        total_amount: t.total_amount,
        notes: clean(input.notes),
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "contract_id,competencia" }
    )
    .select("id")
    .single();
  if (faturaErr || !fatura) return { error: faturaErr ? impressoraError(faturaErr) : "Erro ao salvar a fatura" };
  const billingId = fatura.id as string;

  // As leituras do mês são as desta tela: o que saiu da lista sai da fatura.
  const ids = linhas.map((l) => l.printer_id);
  const { error: limpaErr } = await supabase
    .from("printer_readings")
    .delete()
    .eq("billing_id", billingId)
    .not("printer_id", "in", `(${ids.join(",")})`);
  if (limpaErr) return { error: impressoraError(limpaErr) };

  const { error: leiturasErr } = await supabase.from("printer_readings").upsert(
    linhas.map((l) => ({ billing_id: billingId, ...l })),
    { onConflict: "billing_id,printer_id" }
  );
  if (leiturasErr) return { error: impressoraError(leiturasErr) };

  revalidate();
  return { ok: true, id: billingId };
}

/**
 * Os dados de uma fatura para montar o relatório em PDF — a fatura, o contrato
 * (com a assinatura do rodapé), as leituras e as impressoras delas. Serve à
 * tela do dono e à aba do operador, que lê o contador e manda o PDF dali mesmo.
 */
export async function dadosDoRelatorio(
  billingId: string
): Promise<{ dados: DadosDoRelatorioImpressoes } | { error: string }> {
  const supabase = createClient();
  const { data: fatura, error } = await supabase
    .from("printer_billings")
    .select("*")
    .eq("id", billingId)
    .maybeSingle();
  if (error) return { error: impressoraError(error) };
  if (!fatura) return { error: "Fatura não encontrada" };
  const billing = fatura as PrinterBilling;

  const [contratoRes, leiturasRes] = await Promise.all([
    supabase.from("printer_contracts").select("*").eq("id", billing.contract_id).maybeSingle(),
    supabase.from("printer_readings").select("*").eq("billing_id", billing.id),
  ]);
  if (!contratoRes.data) return { error: "Contrato não encontrado" };
  const readings = (leiturasRes.data as PrinterReading[]) ?? [];

  let printers: Printer[] = [];
  if (readings.length > 0) {
    const { data } = await supabase
      .from("printers")
      .select("*")
      .in(
        "id",
        readings.map((r) => r.printer_id)
      );
    printers = (data as Printer[]) ?? [];
  }

  return {
    dados: {
      billing,
      contract: contratoRes.data as PrinterContract,
      readings,
      printers,
    },
  };
}

/** Apaga a fatura do mês e as leituras dela — o mês volta a ficar sem leitura. */
export async function excluirFaturaDoMes(billingId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("printer_billings").delete().eq("id", billingId);
  if (error) return { error: impressoraError(error) };
  revalidate();
  return { ok: true };
}

/** A baixa: quando o cliente pagou, quanto e como. */
export async function darBaixaFatura(
  billingId: string,
  input: { paid_at: string; paid_amount: number; method?: string | null }
) {
  const supabase = createClient();
  if (!input.paid_at) return { error: "Informe a data do pagamento" };
  if (money(input.paid_amount) <= 0) return { error: "Informe quanto o cliente pagou" };

  const { error } = await supabase
    .from("printer_billings")
    .update({
      paid_at: input.paid_at,
      paid_amount: money(input.paid_amount),
      method: clean(input.method),
    })
    .eq("id", billingId);
  if (error) return { error: impressoraError(error) };
  revalidate();
  return { ok: true };
}

export async function desfazerBaixaFatura(billingId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("printer_billings")
    .update({ paid_at: null, paid_amount: 0, method: null })
    .eq("id", billingId);
  if (error) return { error: impressoraError(error) };
  revalidate();
  return { ok: true };
}
