import { formatDate } from "@/lib/utils";
import type { ChacaraFormaPagamento, ChacaraReserva, ChacaraSituacao } from "@/lib/types";

// ============================================================================
// AGENDA DAS CHÁCARAS — as contas de dia que a tela e o servidor repetem
// ============================================================================
// As datas andam como texto "AAAA-MM-DD" do começo ao fim: comparar duas delas
// como texto já dá a ordem certa, e nada passa por fuso horário (o dia 20 não
// vira 19 depois das 21h).
// ============================================================================

export const FORMAS_PAGAMENTO: { valor: ChacaraFormaPagamento; label: string }[] = [
  { valor: "pix", label: "PIX" },
  { valor: "dinheiro", label: "Dinheiro" },
  { valor: "cartao", label: "Cartão" },
  { valor: "boleto", label: "Boleto" },
  { valor: "transferencia", label: "Transferência" },
  { valor: "outro", label: "Outro" },
];

export function formaLabel(f: string): string {
  return FORMAS_PAGAMENTO.find((x) => x.valor === f)?.label ?? f;
}

export const SITUACAO_LABEL: Record<ChacaraSituacao, string> = {
  reservado: "Reservado",
  sinal: "Sinal pago",
  pago: "Pago",
};

/** A mesma conta da coluna gerada do banco — para a tela não esperar o servidor. */
export function situacaoDe(valor: number, pago: number): ChacaraSituacao {
  if (pago <= 0) return "reservado";
  if (pago < valor) return "sinal";
  return "pago";
}

/** O que falta o cliente pagar. */
export function faltaPagar(r: Pick<ChacaraReserva, "valor" | "valor_pago">): number {
  return Math.max(0, Number(r.valor) - Number(r.valor_pago));
}

/** "AAAA-MM-DD" a partir de ano, mês (1–12) e dia. */
export function isoDia(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Quantos dias há no mês (mês 1–12). */
export function diasNoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

/** Dia da semana do dia 1 do mês (0 = domingo). */
export function semanaDoDia1(ano: number, mes: number): number {
  return new Date(ano, mes - 1, 1).getDay();
}

/** Quantos dias a reserva ocupa, contando o primeiro e o último. */
export function totalDeDias(inicio: string, fim: string): number {
  const [a1, m1, d1] = inicio.split("-").map(Number);
  const [a2, m2, d2] = fim.split("-").map(Number);
  const ms = Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1);
  return Math.round(ms / 86_400_000) + 1;
}

/** O dia cai dentro da reserva? */
export function ocupaDia(r: Pick<ChacaraReserva, "data_inicio" | "data_fim">, dia: string): boolean {
  return r.data_inicio <= dia && dia <= r.data_fim;
}

/** Os dois intervalos têm algum dia em comum? */
export function cruzam(inicioA: string, fimA: string, inicioB: string, fimB: string): boolean {
  return inicioA <= fimB && inicioB <= fimA;
}

/** "20/12/2026" ou "20/12 a 21/12/2026". */
export function periodoLabel(inicio: string, fim: string): string {
  if (inicio === fim) return formatDate(inicio);
  const [a1, m1, d1] = inicio.split("-");
  const [a2] = fim.split("-");
  const primeiro = a1 === a2 ? `${d1}/${m1}` : formatDate(inicio);
  return `${primeiro} a ${formatDate(fim)}`;
}

const SEMANA_CURTA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "sáb 20/12". */
export function diaComSemana(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number);
  const semana = SEMANA_CURTA[new Date(a, m - 1, d).getDay()];
  return `${semana} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** Nome do mês com o ano: "dezembro de 2026". */
export function mesLabel(ano: number, mes: number): string {
  return new Date(ano, mes - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

/** "2026-12" → mês seguinte / anterior. */
export function somarMes(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** O primeiro nome, para caber no quadradinho do calendário. */
export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}
