import type { ChangeEvent } from "react";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  FREIGHT_CATEGORIES,
  MACHINE_CATEGORIES,
  type Loan,
  type MachineCategory,
  type ServiceBillingMode,
  type ServiceOrderStatus,
  type ServiceOrderType,
} from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * CAIXA ALTA no que foi digitado, SEM jogar o cursor para o fim.
 *
 * O campo é controlado: se o texto que volta do estado for diferente do que
 * está no input (e "abc" → "ABC" é diferente), o React reescreve o value e o
 * navegador manda o cursor para o fim — quem tentava consertar o começo da
 * palavra via a letra sair lá na ponta. Como caixa alta não muda o tamanho do
 * texto, dá para devolver o cursor exatamente para onde ele estava, no quadro
 * seguinte (o rAF roda depois de o React ter escrito o texto novo).
 *
 * Use em todo `onChange` que sobe texto para caixa alta:
 *   onChange={(e) => setNome(upperKeepingCaret(e))}
 */
export function upperKeepingCaret(
  e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
): string {
  const el = e.target;
  const value = el.value.toUpperCase();
  const start = el.selectionStart;
  const end = el.selectionEnd;
  if (start !== null && typeof el.setSelectionRange === "function") {
    requestAnimationFrame(() => {
      // só mexe se o campo ainda estiver com o usuário
      if (document.activeElement !== el) return;
      try {
        el.setSelectionRange(start, end ?? start);
      } catch {
        /* alguns tipos de input (number, date) não aceitam seleção */
      }
    });
  }
  return value;
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

/**
 * Valor cheio em reais, sem abreviar com "k"/"M" e sem centavos
 * (ex.: 144917,64 → "R$ 144.918"). Usado nos cards de resumo e nos eixos
 * dos gráficos, onde o espaço é curto mas o número precisa ser lido por
 * inteiro. Listas, diálogos e tooltips continuam com `formatBRL` (com centavos).
 */
export function formatBRLFull(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Parse de valor em R$ digitado (1.234,56 → 1234.56). */
export function parseMoney(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

/**
 * Máscara de dinheiro com VÍRGULA AUTOMÁTICA — a de todo campo de R$ do app.
 * Quem digita só aperta números e os dois últimos viram os centavos
 * ("12345" → "123,45"), como na calculadora do mercado: ninguém precisa
 * caçar a vírgula no teclado do celular. Aceita também o valor já em número
 * (1234.5 → "1.234,50"), para preencher o campo na hora de editar.
 *
 * Sai com separador de milhar, então leia SEMPRE com `parseMoney` (que tira
 * os pontos) — nunca com um `.replace(",", ".")` solto.
 */
export function formatBRLInput(raw: string | number): string {
  const digits =
    typeof raw === "number" ? String(Math.round(raw * 100)) : raw.replace(/\D/g, "");
  if (!digits) return "";
  const cents = parseInt(digits, 10);
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Quantidade legível: sem casas sobrando e com separador brasileiro
 * (12 → "12", 0.5 → "0,5", 1234.25 → "1.234,25"). Estoque trabalha com até
 * 3 casas porque nem tudo é contado em peça inteira (metro de cano, kg).
 */
export function formatQty(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(value);
}

/**
 * Horímetro com vírgula automática: o usuário digita só os números e a última
 * casa vira o décimo (ex.: "12305" → "1230,5"). NÃO usa separador de milhar,
 * para o valor continuar sendo lido com `.replace(",", ".")`. Mesma ideia dos
 * campos de R$, mas com 1 casa decimal. Use só no horímetro — o km é inteiro.
 */
export function formatHourmeter(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const padded = digits.padStart(2, "0");
  const intPart = String(parseInt(padded.slice(0, -1), 10));
  const dec = padded.slice(-1);
  return `${intPart},${dec}`;
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
 * é prestação de serviço ou serviço rápido (não há nada sendo entregue).
 */
export function osStatusLabel(
  status: ServiceOrderStatus,
  type?: ServiceOrderType
): string {
  if (
    status === "entregue" &&
    (type === "prestacao_servico" || type === "servico_rapido")
  )
    return "Finalizado";
  const map: Record<ServiceOrderStatus, string> = {
    pendente:     "Pendente",
    em_andamento: "Em andamento",
    entregue:     "Entregue",
    cancelado:    "Cancelado",
  };
  return map[status];
}

/** Rótulo do tipo de OS (rótulo exibido em cards, impressão e relatórios). */
export function osTypeLabel(type?: ServiceOrderType | null): string {
  const map: Record<ServiceOrderType, string> = {
    entrega_material:  "Entrega de material",
    frete:             "Frete",
    prestacao_servico: "Prestação de serviço",
    servico_rapido:    "Serviço rápido",
  };
  return type ? map[type] : "";
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

/** Rótulo da categoria da máquina (ex.: "caminhao" → "Caminhão"). */
export function machineCategoryLabel(category?: string | null): string {
  if (!category) return "";
  return MACHINE_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

/** Esta categoria pode fazer frete / cobrança por km? (caminhão e caçamba) */
export function isFreightCategory(category?: string | null): boolean {
  return !!category && FREIGHT_CATEGORIES.includes(category as MachineCategory);
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

type LoanCalcInput = Pick<Loan, "principal" | "interest_rate" | "term_months" | "interest_amount">;

/** Juros do empréstimo: valor fixo (interest_amount) ou juros simples (rate × meses). */
export function loanInterestAmount(loan: LoanCalcInput): number {
  if (loan.interest_amount != null && loan.interest_amount > 0) return loan.interest_amount;
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
