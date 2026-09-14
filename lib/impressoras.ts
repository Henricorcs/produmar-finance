import type { Printer, PrinterBilling, PrinterContract, PrinterReading } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// A CONTA DA FATURA DE IMPRESSORAS
// ─────────────────────────────────────────────────────────────────────────────
// É a mesma conta do "Relatório mensal de impressões" que era feito na
// planilha, e mora aqui para a tela e o servidor fazerem EXATAMENTE a mesma:
//
//   páginas            = leitura atual − leitura anterior
//   valor da impressão = páginas × preço da página
//   franquia           = páginas da franquia × preço (DESCONTADA)
//   total da fatura    = mensalidades + impressões − franquia
//
// Conferido na planilha de 24/08/2026: 6.850,00 + 2.695,60 − 202,50 = 9.343,10.
//
// A franquia nunca desconta mais páginas do que foram impressas: num mês fraco,
// abaixo da franquia, as impressões zeram — a fatura não fica menor que as
// mensalidades.

/** Dinheiro com 2 casas, sem o ruído do ponto flutuante (699 × 0,05 = 34,95). */
export function centavos(v: number): number {
  return Math.round((Number(v) || 0) * 100) / 100;
}

/** O preço da página que vale para esta impressora. */
export function precoDaPagina(
  printer: Pick<Printer, "page_price">,
  contract: Pick<PrinterContract, "page_price">
): number {
  return printer.page_price != null ? Number(printer.page_price) : Number(contract.page_price);
}

export interface LinhaDaFatura {
  previous_reading: number;
  current_reading: number;
  monthly_fee: number;
  page_price: number;
}

export interface LinhaCalculada extends LinhaDaFatura {
  pages: number;
  prints_amount: number;
}

export interface TotaisDaFatura {
  linhas: LinhaCalculada[];
  total_pages: number;
  total_fees: number;
  total_prints: number;
  /** As páginas da franquia que de fato entraram no desconto. */
  franchise_pages_applied: number;
  franchise_amount: number;
  total_amount: number;
}

export function calcularFatura(
  linhas: LinhaDaFatura[],
  franchisePages: number,
  franchisePrice: number
): TotaisDaFatura {
  const calculadas = linhas.map((l) => {
    const pages = Math.max(0, Math.round(Number(l.current_reading) - Number(l.previous_reading)));
    return {
      ...l,
      pages,
      prints_amount: centavos(pages * Number(l.page_price)),
    };
  });

  const total_pages = calculadas.reduce((s, l) => s + l.pages, 0);
  const total_fees = centavos(calculadas.reduce((s, l) => s + Number(l.monthly_fee), 0));
  const total_prints = centavos(calculadas.reduce((s, l) => s + l.prints_amount, 0));
  const franchise_pages_applied = Math.min(Math.max(0, franchisePages), total_pages);
  const franchise_amount = centavos(franchise_pages_applied * Number(franchisePrice));

  return {
    linhas: calculadas,
    total_pages,
    total_fees,
    total_prints,
    franchise_pages_applied,
    franchise_amount,
    total_amount: centavos(total_fees + total_prints - franchise_amount),
  };
}

// ── O mês ───────────────────────────────────────────────────────────────────

/** "2026-08" → "2026-08-01", que é como o mês de referência é gravado. */
export function competenciaDe(mes: string): string {
  return `${mes.slice(0, 7)}-01`;
}

/** O vencimento no mês seguinte ao da leitura: dia 31 em mês curto cai no último. */
export function vencimentoDaFatura(competencia: string, dueDay: number): string {
  const [y, m] = competencia.split("-").map(Number);
  // a fatura de agosto vence em setembro
  const ano = m === 12 ? y + 1 : y;
  const mes = m === 12 ? 1 : m + 1;
  const ultimo = new Date(ano, mes, 0).getDate();
  const dia = Math.min(Math.max(Math.floor(dueDay) || 1, 1), ultimo);
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export type SituacaoDaFatura = "recebida" | "parcial" | "a_receber" | "vencida";

export function situacaoDaFatura(
  b: Pick<PrinterBilling, "paid_at" | "paid_amount" | "total_amount" | "due_date">,
  hoje: string
): SituacaoDaFatura {
  if (b.paid_at) {
    return Number(b.paid_amount) + 0.009 < Number(b.total_amount) ? "parcial" : "recebida";
  }
  return b.due_date && b.due_date < hoje ? "vencida" : "a_receber";
}

export const SITUACAO_FATURA: Record<SituacaoDaFatura, { label: string; cls: string }> = {
  recebida: {
    label: "Recebida",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  },
  parcial: {
    label: "Recebida em parte",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  },
  a_receber: {
    label: "A receber",
    cls: "bg-produmar-100 text-produmar-700 dark:bg-produmar-900/40 dark:text-produmar-400",
  },
  vencida: {
    label: "Vencida",
    cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  },
};

// ── A leitura anterior ──────────────────────────────────────────────────────

/**
 * O contador de onde este mês parte, para cada impressora: a leitura ATUAL da
 * fatura mais recente ANTES deste mês. Impressora nova, sem leitura nenhuma,
 * parte do contador de quando foi instalada. É o que tira da mão de quem lança
 * a digitação que mais erra a fatura.
 */
export function leiturasAnteriores(
  printers: Printer[],
  billings: PrinterBilling[],
  readings: PrinterReading[],
  competencia: string
): Map<string, number> {
  const anteriores = billings
    .filter((b) => b.competencia < competencia)
    .sort((a, b) => b.competencia.localeCompare(a.competencia));
  const ordemDaFatura = new Map(anteriores.map((b, i) => [b.id, i]));

  const melhor = new Map<string, { ordem: number; leitura: number }>();
  for (const r of readings) {
    const ordem = ordemDaFatura.get(r.billing_id);
    if (ordem === undefined) continue;
    const atual = melhor.get(r.printer_id);
    if (!atual || ordem < atual.ordem) {
      melhor.set(r.printer_id, { ordem, leitura: Number(r.current_reading) });
    }
  }

  return new Map(
    printers.map((p) => [p.id, melhor.get(p.id)?.leitura ?? Number(p.initial_reading)])
  );
}

/** A data da leitura anterior: a da fatura mais recente antes deste mês. */
export function dataDaLeituraAnterior(
  billings: PrinterBilling[],
  competencia: string
): string | null {
  const anterior = billings
    .filter((b) => b.competencia < competencia)
    .sort((a, b) => b.competencia.localeCompare(a.competencia))[0];
  return anterior?.reading_date ?? null;
}

/** "2026-08-01" → "agosto de 2026". */
export function nomeDoMes(competencia: string): string {
  const [y, m] = competencia.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/** Número inteiro com ponto de milhar: 53912 → "53.912". */
export function formatPaginas(n: number): string {
  return Math.round(Number(n) || 0).toLocaleString("pt-BR");
}

/** Preço da página: 0,05 — até 4 casas quando precisar (0,035). */
export function formatPreco(n: number): string {
  return (Number(n) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}
