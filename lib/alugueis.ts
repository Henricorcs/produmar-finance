import { localDateISO } from "./utils";
import type { RentalContractView, RentalPayment } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// O ALUGUEL DE CADA MÊS
// ─────────────────────────────────────────────────────────────────────────────
// A cobrança do mês não fica gravada no banco: ela é a conta do contrato — o
// dia do vencimento mais o valor combinado. O que se grava é a BAIXA.
//
// Assim não existe cobrança fantasma: contrato que terminou no meio do mês, que
// mudou de valor ou que foi cadastrado depois não deixa lixo para apagar.

/** O primeiro dia do mês, que é como o mês de referência é guardado. */
export function competenciaDoMes(year: number, month: number): string {
  return localDateISO(new Date(year, month, 1));
}

/**
 * O vencimento daquele mês. Dia 31 num mês curto cai no último dia — ninguém
 * vence em 31 de fevereiro.
 */
export function vencimentoDoMes(dueDay: number, year: number, month: number): string {
  const ultimoDia = new Date(year, month + 1, 0).getDate();
  const dia = Math.min(Math.max(Math.floor(dueDay) || 1, 1), ultimoDia);
  return localDateISO(new Date(year, month, dia));
}

/** O contrato estava valendo em algum dia deste mês? */
export function contratoValeNoMes(
  c: Pick<RentalContractView, "start_date" | "end_date" | "status">,
  year: number,
  month: number
): boolean {
  if (c.status !== "ativo") return false;
  const primeiro = competenciaDoMes(year, month);
  const ultimo = localDateISO(new Date(year, month + 1, 0));
  if (c.start_date > ultimo) return false;
  if (c.end_date && c.end_date < primeiro) return false;
  return true;
}

export type CobrancaStatus = "pago" | "parcial" | "pendente" | "vencido";

/** O aluguel de um contrato num mês, com a baixa quando ela existe. */
export interface CobrancaDoMes {
  contract: RentalContractView;
  competencia: string;
  due_date: string;
  /** O quanto é devido no mês (o do contrato, ou o que foi gravado na baixa). */
  amount: number;
  payment: RentalPayment | null;
  status: CobrancaStatus;
  /** O que ainda falta receber deste mês. */
  emAberto: number;
}

function statusDaCobranca(
  amount: number,
  payment: RentalPayment | null,
  dueDate: string,
  hoje: string
): CobrancaStatus {
  if (payment?.paid_at) {
    return Number(payment.paid_amount) + 0.009 < amount ? "parcial" : "pago";
  }
  return dueDate < hoje ? "vencido" : "pendente";
}

/**
 * As cobranças de um mês: um contrato ativo que valia no mês vira uma linha,
 * com a baixa junto quando já foi paga.
 */
export function cobrancasDoMes(
  contracts: RentalContractView[],
  payments: RentalPayment[],
  year: number,
  month: number,
  hoje: string = localDateISO()
): CobrancaDoMes[] {
  const competencia = competenciaDoMes(year, month);

  const baixaPorContrato = new Map<string, RentalPayment>();
  for (const p of payments) {
    if (p.competencia !== competencia) continue;
    baixaPorContrato.set(p.contract_id, p);
  }

  const linhas: CobrancaDoMes[] = [];
  for (const c of contracts) {
    if (!contratoValeNoMes(c, year, month)) continue;

    const payment = baixaPorContrato.get(c.id) ?? null;
    const due_date = payment?.due_date ?? vencimentoDoMes(c.due_day, year, month);
    // o valor da baixa manda: reajuste de hoje não muda o mês que já passou
    const amount = payment ? Number(payment.amount) : Number(c.monthly_amount);
    const pago = payment?.paid_at ? Number(payment.paid_amount) : 0;

    linhas.push({
      contract: c,
      competencia,
      due_date,
      amount,
      payment,
      status: statusDaCobranca(amount, payment, due_date, hoje),
      emAberto: Math.max(0, Math.round((amount - pago) * 100) / 100),
    });
  }

  return linhas.sort(
    (a, b) => a.due_date.localeCompare(b.due_date) || a.contract.property_code - b.contract.property_code
  );
}

/** O rótulo de cada situação, do jeito que se fala. */
export const COBRANCA_META: Record<
  CobrancaStatus,
  { label: string; chip: string; ordem: number }
> = {
  vencido: {
    label: "Vencido",
    chip: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
    ordem: 0,
  },
  pendente: {
    label: "A vencer",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
    ordem: 1,
  },
  parcial: {
    label: "Pago em parte",
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400",
    ordem: 2,
  },
  pago: {
    label: "Pago",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
    ordem: 3,
  },
};
