import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Loan, ServiceBillingMode, ServiceOrderStatus, ServiceOrderType } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

export function formatBRLCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toFixed(1).replace(".", ",")}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `R$ ${(value / 1_000).toFixed(1).replace(".", ",")}k`;
  }
  return formatBRL(value);
}

/**
 * Converte qualquer entrada em Date no fuso local. Strings no formato
 * YYYY-MM-DD são interpretadas como data local (não UTC) para evitar
 * o bug clássico de -1 dia em fusos negativos como BRT (UTC-3).
 */
function parseLocalDate(date: string | Date): Date {
  if (date instanceof Date) return new Date(date);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (match) {
    return new Date(
      parseInt(match[1], 10),
      parseInt(match[2], 10) - 1,
      parseInt(match[3], 10)
    );
  }
  return new Date(date);
}

/**
 * Data de hoje em YYYY-MM-DD no fuso LOCAL (do dispositivo). Evita o bug de
 * `new Date().toISOString()`, que devolve UTC — depois das 21h (BRT) o ISO já
 * está no dia seguinte. Use sempre que a data precisar bater com o relógio de
 * quem está usando o app (celular do técnico, navegador do escritório).
 */
export function localDateISO(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("pt-BR").format(parseLocalDate(date));
}

export function daysUntil(date: string | Date): number {
  const d = parseLocalDate(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Rótulo de status de OS — "Entregue" vira "Finalizado" quando a OS
 * é prestação de serviço (não há nada sendo entregue).
 */
export function osStatusLabel(
  status: ServiceOrderStatus,
  type?: ServiceOrderType
): string {
  if (status === "entregue" && type === "prestacao_servico") return "Finalizado";
  const map: Record<ServiceOrderStatus, string> = {
    pendente:     "Pendente",
    em_andamento: "Em andamento",
    entregue:     "Entregue",
    cancelado:    "Cancelado",
  };
  return map[status];
}

/** Rótulo do modo de cobrança do frete (entrega de material). */
export function osBillingLabel(mode?: ServiceBillingMode | null): string {
  if (!mode) return "";
  const map: Record<ServiceBillingMode, string> = {
    viagem: "Por viagem",
    km:     "Por km",
    diaria: "Por diária",
  };
  return map[mode];
}

export function formatDueLabel(date: string | Date): {
  label: string;
  variant: "danger" | "warning" | "muted";
} {
  const days = daysUntil(date);
  if (days < 0) return { label: `Vencido há ${Math.abs(days)} dia(s)`, variant: "danger" };
  if (days === 0) return { label: "Vence hoje", variant: "danger" };
  if (days === 1) return { label: "Vence amanhã", variant: "danger" };
  if (days <= 3) return { label: `Em ${days} dias`, variant: "warning" };
  if (days <= 15) return { label: `Em ${days} dias`, variant: "muted" };
  return { label: formatDate(date), variant: "muted" };
}

// ── Empréstimos ───────────────────────────────────────────────────────────────

type LoanCalcInput = Pick<Loan, "principal" | "interest_rate" | "term_months">;

/** Juros simples: principal × (taxa%/100) × prazo_meses. 0 se faltar taxa ou prazo. */
export function loanInterestAmount(loan: LoanCalcInput): number {
  const rate = loan.interest_rate ?? 0;
  const months = loan.term_months ?? 0;
  if (rate <= 0 || months <= 0) return 0;
  return loan.principal * (rate / 100) * months;
}

/** Total a receber = principal + juros simples. */
export function loanTotalDue(loan: LoanCalcInput): number {
  return loan.principal + loanInterestAmount(loan);
}

/** Saldo devedor = total a receber − soma dos pagamentos (nunca negativo). */
export function loanBalance(loan: LoanCalcInput, totalPaid: number): number {
  return Math.max(0, loanTotalDue(loan) - totalPaid);
}

export function getInitials(name?: string | null): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
