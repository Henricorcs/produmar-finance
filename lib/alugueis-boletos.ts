import { localDateISO } from "./utils";
import { vencimentoDoMes } from "./alugueis";
import type { RentalBoleto, RentalBoletoStatus, RentalContract } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// OS BOLETOS DO CONTRATO DE ALUGUEL
// ─────────────────────────────────────────────────────────────────────────────
// Um boleto por mês do contrato. O mês entra quando o VENCIMENTO dele cai
// dentro do prazo: do início (inclusive) até o término (exclusive). Assim um
// contrato de 12 meses tem 12 boletos, não 13 — começando em 04/11 com
// vencimento dia 5, o primeiro vence 05/11 e o último 05/10 do ano seguinte.

/** A multa e os juros que o contrato de vocês já escreve (cláusula quarta). */
export const MULTA_PADRAO = 10;
export const JUROS_PADRAO = 2;

/** Teto de boletos por vez — um prazo digitado errado não vira 300 boletos. */
export const MAXIMO_DE_BOLETOS = 36;

/** A Cora não emite boleto abaixo disso. */
export const VALOR_MINIMO_BOLETO = 5;

export interface MesDoBoleto {
  /** AAAA-MM-01 */
  competencia: string;
  /** AAAA-MM-DD */
  due_date: string;
}

/** "2026-11-04" + 12 meses → "2027-11-04" (dia 31 num mês curto cai no último dia). */
export function somarMeses(iso: string, meses: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(y, m - 1 + meses, 1);
  const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  base.setDate(Math.min(d, ultimo));
  return localDateISO(base);
}

/** O fim do prazo: o término cadastrado, ou o início + o prazo, ou 12 meses. */
export function fimDoPrazo(c: Pick<RentalContract, "start_date" | "end_date" | "months">): string {
  if (c.end_date) return c.end_date;
  return somarMeses(c.start_date, c.months && c.months > 0 ? c.months : 12);
}

/** Todos os meses do contrato que têm aluguel, na ordem. */
export function mesesDoContrato(
  c: Pick<RentalContract, "start_date" | "end_date" | "months" | "due_day">
): MesDoBoleto[] {
  const fim = fimDoPrazo(c);
  const [y, m] = c.start_date.split("-").map(Number);
  const meses: MesDoBoleto[] = [];
  for (let i = 0; i < 240; i++) {
    const ano = y + Math.floor((m - 1 + i) / 12);
    const mes = (m - 1 + i) % 12;
    const due = vencimentoDoMes(c.due_day, ano, mes);
    if (due >= fim) break;
    if (due < c.start_date) continue;
    meses.push({ competencia: localDateISO(new Date(ano, mes, 1)), due_date: due });
  }
  return meses;
}

/** O boleto que vale para o mês (o cancelado não vale). */
export function boletoValendo(b: Pick<RentalBoleto, "cora_status">): boolean {
  return b.cora_status !== "CANCELLED";
}

/** Ainda dá para pagar (e para cancelar) na Cora. */
export function boletoEmAberto(b: Pick<RentalBoleto, "cora_status">): boolean {
  return b.cora_status === "OPEN" || b.cora_status === "LATE" || b.cora_status === "DRAFT";
}

/** O rótulo do boleto, do jeito que se fala. */
export function situacaoDoBoleto(
  b: Pick<RentalBoleto, "cora_status" | "due_date">,
  hoje: string = localDateISO()
): { label: string; chip: string } {
  const s: RentalBoletoStatus = b.cora_status;
  if (s === "PAID")
    return { label: "Pago", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" };
  if (s === "CANCELLED")
    return { label: "Cancelado", chip: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" };
  if (s === "IN_PAYMENT")
    return { label: "Pagando", chip: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400" };
  if (s === "LATE" || b.due_date < hoje)
    return { label: "Vencido", chip: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" };
  return { label: "Em aberto", chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" };
}

/** "2026-11-01" → "novembro de 2026". */
export function nomeDoMes(competencia: string): string {
  const [y, m] = competencia.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

// ─────────────────────────────────────────────────────────────────────────────
// O CÓDIGO DE BARRAS DO BOLETO (Intercalado 2 de 5, 44 dígitos)
// ─────────────────────────────────────────────────────────────────────────────
// É o padrão da FEBRABAN que o leitor do banco e a câmera do aplicativo leem.
// Cada par de dígitos vira 5 barras (o primeiro dígito) intercaladas com 5
// espaços (o segundo). N = estreito, L = largo.

const ITF: Record<string, string> = {
  "0": "NNLLN",
  "1": "LNNNL",
  "2": "NLNNL",
  "3": "LLNNN",
  "4": "NNLNL",
  "5": "LNLNN",
  "6": "NLLNN",
  "7": "NNNLL",
  "8": "LNNLN",
  "9": "NLNLN",
};

/**
 * As barras do código, como larguras alternadas (barra, espaço, barra...),
 * em módulos. Começa e termina com barra. Vazio se o código não for válido.
 */
export function barrasDoBoleto(codigo: string, largo = 3): number[] {
  const d = (codigo ?? "").replace(/\D/g, "");
  if (d.length === 0 || d.length % 2 !== 0) return [];
  const w = (c: string) => (c === "L" ? largo : 1);
  const larguras: number[] = [1, 1, 1, 1]; // início: barra, espaço, barra, espaço estreitos
  for (let i = 0; i < d.length; i += 2) {
    const barras = ITF[d[i]];
    const espacos = ITF[d[i + 1]];
    for (let k = 0; k < 5; k++) larguras.push(w(barras[k]), w(espacos[k]));
  }
  larguras.push(largo, 1, 1); // fim: barra larga, espaço, barra estreita
  return larguras;
}

/** A linha digitável em blocos, como sai impressa no boleto. */
export function linhaDigitavelFormatada(linha: string | null): string {
  const d = (linha ?? "").replace(/\D/g, "");
  if (d.length !== 47) return linha ?? "";
  return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d.slice(32, 33)} ${d.slice(33)}`;
}
