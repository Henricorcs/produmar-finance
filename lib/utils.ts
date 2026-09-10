import type { ChangeEvent } from "react";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  FREIGHT_CATEGORIES,
  MACHINE_CATEGORIES,
  type ContractMode,
  type Loan,
  type MachineCategory,
  type ServiceBillingMode,
  type ServiceOrderStatus,
  type ServiceOrderType,
} from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Digitar sem o sistema atrapalhar o teclado ───────────────────────────────
//
// Quase todo campo de texto do app grava em CAIXA ALTA. O jeito óbvio de fazer
// isso — devolver o texto já convertido no onChange — não funciona no celular.
// O campo é controlado pelo React: se o estado volta diferente do que está
// escrito ("abc" → "ABC" é diferente), o React reescreve o texto do campo. E
// reescrever o texto por baixo do teclado quebra duas coisas:
//
//   1. A DICA DO CORRETOR. Enquanto o corretor sugere, o teclado mantém a
//      palavra "em composição" e é dela que sai a dica. Trocar o texto (ou o
//      cursor) nessa hora cancela a composição: a dica aparece, mas tocar
//      nela não preenche nada.
//   2. MEXER NO MEIO DO TEXTO. Inserir ou apagar uma letra no começo/meio de
//      uma palavra já escrita: o texto é reescrito, o cursor vai para o fim e
//      a letra sai no lugar errado — ou nem entra.
//
// A regra agora é simples: ENQUANTO O CAMPO ESTÁ EM USO, o sistema não toca
// nele. Nada de reescrever texto, nada de mexer no cursor. O campo se comporta
// como um campo comum de navegador, e o teclado faz o que sabe fazer.
//
// A caixa alta continua garantida, só que na hora certa:
//   • na tela, quem mostra em caixa alta enquanto se digita é o CSS
//     (text-transform) — quem digita não vê diferença nenhuma;
//   • no dado, a conversão de verdade acontece ao SAIR do campo (ou ao apertar
//     Enter, que envia o formulário sem sair) — ninguém está digitando nesse
//     momento, então reescrever ali não atrapalha ninguém.

type CampoTexto = HTMLInputElement | HTMLTextAreaElement;

/**
 * Converte o texto do campo de verdade e avisa o React.
 *
 * O React guarda por conta própria o último texto de cada campo; um
 * `el.value = ...` normal atualiza esse registro junto e o onChange nem
 * dispara. Passando pelo setter original do elemento, o registro fica para
 * trás e o `input` que disparamos chega ao onChange como digitação de verdade.
 */
function converterDeVez(el: CampoTexto, converter: (texto: string) => string): void {
  const alvo = converter(el.value);
  if (alvo === el.value) return;

  const proto =
    typeof HTMLTextAreaElement !== "undefined" && el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, alvo);
  else el.value = alvo;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

// Campos que já estão com a conversão agendada (uma vez por passagem no campo).
const campoAgendado = new WeakSet<CampoTexto>();

function agendarConversao(el: CampoTexto, converter: (texto: string) => string): void {
  if (campoAgendado.has(el)) return;
  campoAgendado.add(el);

  // Enter envia o formulário sem tirar o foco do campo — converte antes que o
  // envio leia o texto.
  const aoTeclar = (ev: Event) => {
    if ((ev as KeyboardEvent).key === "Enter") converterDeVez(el, converter);
  };
  el.addEventListener("keydown", aoTeclar);
  el.addEventListener(
    "blur",
    () => {
      el.removeEventListener("keydown", aoTeclar);
      // Converte ANTES de desagendar: a conversão dispara um onChange, e o
      // campo precisa continuar marcado como agendado para esse onChange não
      // pendurar um novo par de listeners num campo que já perdeu o foco.
      converterDeVez(el, converter);
      campoAgendado.delete(el);
    },
    { once: true }
  );
}

function digitarSemAtrapalhar(
  e: ChangeEvent<CampoTexto>,
  converter: (texto: string) => string,
  caixaCss: "uppercase" | "lowercase"
): string {
  const el = e.target;
  // Só a aparência muda enquanto se digita — o texto continua exatamente como
  // o teclado escreveu. Quem pinta a caixa é o CSS de globals.css, pelo
  // data-caixa (que também sai do caminho quando o campo está vazio, para não
  // virar o placeholder junto).
  if (el.dataset.caixa !== caixaCss) el.dataset.caixa = caixaCss;
  agendarConversao(el, converter);
  return el.value;
}

/**
 * CAIXA ALTA no que foi digitado, sem atrapalhar quem está digitando.
 *
 * Use em todo `onChange` que sobe texto para caixa alta:
 *   onChange={(e) => setNome(upperKeepingCaret(e))}
 */
export function upperKeepingCaret(e: ChangeEvent<CampoTexto>): string {
  return digitarSemAtrapalhar(e, (texto) => texto.toUpperCase(), "uppercase");
}

/** Igual ao [upperKeepingCaret], mas para os campos que gravam em minúsculas. */
export function lowerKeepingCaret(e: ChangeEvent<CampoTexto>): string {
  return digitarSemAtrapalhar(e, (texto) => texto.toLowerCase(), "lowercase");
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

/**
 * Valor cheio em reais, sem abreviar com "k"/"M" e sem centavos
 * (ex.: 144917,64 → "R$ 144.918"). É só para os EIXOS DOS GRÁFICOS, onde o
 * centavo não diz nada e ainda embola a régua de números.
 *
 * Em qualquer lugar que mostre dinheiro para conferência — card, total, lista,
 * diálogo — o centavo aparece: use `formatBRL`, ou o `<Money>` quando o
 * número for grande e precisar caber (ele escreve o centavo menorzinho).
 */
export function formatBRLFull(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Quebra o valor em reais e centavos já formatados
 * (44587.38 → { reais: "R$ 44.587", centavos: "38" }), para o `<Money>`
 * escrever o centavo em corpo menor. Sai do próprio `formatBRL`, então
 * acompanha o formato brasileiro em vez de repetir a conta na mão.
 */
export function splitBRL(value: number): { reais: string; centavos: string } {
  const texto = formatBRL(value);
  const virgula = texto.lastIndexOf(",");
  if (virgula < 0) return { reais: texto, centavos: "" };
  return { reais: texto.slice(0, virgula), centavos: texto.slice(virgula + 1) };
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
 * A CONTA DO SERVIÇO escrita do jeito que se fala: "10 M × R$ 2,00 = R$ 20,00".
 *
 * É o que tira a dúvida na hora de pagar. Sem isso a tela mostrava só o total,
 * e quem conferia não sabia se os 20 reais vieram de 10 metros a 2,00 ou de
 * 2 metros a 10,00.
 *
 * Na empreita não há conta a fazer — o preço é fechado —, então a fórmula vem
 * vazia e só o total tem o que dizer.
 */
export function servicoConta(s: {
  contract_mode: ContractMode;
  quantity?: number | null;
  unit?: string | null;
  rate_per_unit?: number | null;
  contract_amount?: number | null;
  total_value?: number | null;
}): { formula: string; total: string; completo: string } {
  const total = Number(s.total_value ?? 0);
  const totalTexto = formatBRL(total);

  if (s.contract_mode !== "metro") {
    return { formula: "", total: totalTexto, completo: `Empreita = ${totalTexto}` };
  }

  const qtd = Number(s.quantity ?? 0);
  const preco = Number(s.rate_per_unit ?? 0);
  const formula = `${formatQty(qtd)} ${(s.unit ?? "M").trim() || "M"} × ${formatBRL(preco)}`;
  return { formula, total: totalTexto, completo: `${formula} = ${totalTexto}` };
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

// ── Número e data por extenso (contrato de locação) ──────────────────────────
// Contrato se escreve com o valor nos dois jeitos: "R$ 1.000,00 (um mil reais)".
// Quem digita não deve ter que escrever o extenso na mão — é onde nasce o erro
// que só aparece na hora de cobrar.

const EXTENSO_UNIDADES = [
  "", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
  "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete",
  "dezoito", "dezenove",
];
const EXTENSO_DEZENAS = [
  "", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta",
  "oitenta", "noventa",
];
const EXTENSO_CENTENAS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
  "seiscentos", "setecentos", "oitocentos", "novecentos",
];

function extensoAte999(n: number): string {
  if (n <= 0) return "";
  if (n === 100) return "cem";
  const centena = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (centena) partes.push(EXTENSO_CENTENAS[centena]);
  if (resto) {
    if (resto < 20) partes.push(EXTENSO_UNIDADES[resto]);
    else {
      const dezena = Math.floor(resto / 10);
      const unidade = resto % 10;
      partes.push(
        unidade
          ? `${EXTENSO_DEZENAS[dezena]} e ${EXTENSO_UNIDADES[unidade]}`
          : EXTENSO_DEZENAS[dezena]
      );
    }
  }
  return partes.join(" e ");
}

/**
 * Número inteiro por extenso ("doze", "um mil", "mil e quinhentos").
 *
 * O mil vem como "um mil" de propósito: é assim que o contrato de vocês
 * escreve ("Um mil reais"). Serve para os valores do dia a dia (até milhões).
 */
export function numeroPorExtenso(valor: number): string {
  const n = Math.floor(Math.abs(Number(valor) || 0));
  if (n === 0) return "zero";

  const milhoes = Math.floor(n / 1_000_000);
  const milhares = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;

  const partes: string[] = [];
  if (milhoes) partes.push(milhoes === 1 ? "um milhão" : `${extensoAte999(milhoes)} milhões`);
  if (milhares) partes.push(`${extensoAte999(milhares)} mil`);
  if (resto) partes.push(extensoAte999(resto));

  return partes.join(" e ");
}

/** "12 (doze)" — o número do jeito que contrato pede. */
export function numeroComExtenso(valor: number): string {
  const n = Math.floor(Math.abs(Number(valor) || 0));
  return `${n} (${numeroPorExtenso(n)})`;
}

/** Valor em reais por extenso ("um mil reais", "mil e quinhentos reais e cinquenta centavos"). */
export function valorPorExtenso(valor: number): string {
  const v = Math.abs(Number(valor) || 0);
  const inteiro = Math.floor(v);
  const centavos = Math.round((v - inteiro) * 100);

  const partes: string[] = [];
  if (inteiro) partes.push(`${numeroPorExtenso(inteiro)} ${inteiro === 1 ? "real" : "reais"}`);
  if (centavos)
    partes.push(`${numeroPorExtenso(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);

  if (partes.length === 0) return "zero reais";
  return partes.join(" e ");
}

/** "2026-08-24" → "24 de agosto de 2026" (a data de assinatura do contrato). */
export function dataPorExtenso(date: string | Date): string {
  const d = parseLocalDate(date);
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

/** Primeira letra maiúscula, sem mexer no resto ("um mil reais" → "Um mil reais"). */
export function primeiraMaiuscula(texto: string): string {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}
