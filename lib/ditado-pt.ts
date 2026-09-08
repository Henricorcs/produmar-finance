// ─────────────────────────────────────────────────────────────────────────────
// O QUE FOI FALADO VIRA NÚMERO, DINHEIRO, DATA E HORA
// ─────────────────────────────────────────────────────────────────────────────
// Em campo de escrever, o ditado é fácil: entra o texto e pronto. Em campo de
// VALOR e de DATA não dá: o campo espera "1.500,00" e "2026-09-18", e o que
// chega do reconhecimento é "mil e quinhentos reais" ou "dezoito de setembro".
//
// Este arquivo é o tradutor. Ele aceita das duas formas, porque o aparelho
// devolve tanto uma quanto a outra dependendo do dia:
//   • em número:  "1500", "1.500,00", "18/09/2026", "8:30"
//   • falado:     "mil e quinhentos reais", "dezoito de setembro", "oito e meia"
//
// Quando não dá para entender, devolve null — e quem chamou avisa a pessoa em
// vez de escrever besteira no campo.

const UNIDADES: Record<string, number> = {
  zero: 0, um: 1, uma: 1, primeiro: 1, dois: 2, duas: 2, tres: 3, quatro: 4,
  cinco: 5, seis: 6, meia: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11,
  doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16,
  dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20, trinta: 30,
  quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80,
  noventa: 90, cem: 100, cento: 100, duzentos: 200, duzentas: 200,
  trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400,
  quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600,
  setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800,
  novecentos: 900, novecentas: 900,
};

const MULTIPLOS: Record<string, number> = {
  mil: 1000, milhao: 1e6, milhoes: 1e6, bilhao: 1e9, bilhoes: 1e9,
};

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7,
  agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

/** Palavras que só enfeitam a fala e não dizem quanto nem quando. */
const ENFEITE = /\b(reais?|real|r\$|de|do|da|dia|no|na|em|pra|para|por favor|reai)\b/g;

/** Minúsculas e sem acento: "Três Vírgulas" e "tres virgulas" viram a mesma coisa. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Soma palavra por palavra, do jeito que se fala: "dois mil e quinhentos" é
 * dois × mil, guarda, e mais quinhentos. Palavra que não é número derruba a
 * conta (devolve null) — melhor não escrever nada do que escrever errado.
 */
function somarPalavras(tokens: string[]): number | null {
  let total = 0;
  let atual = 0;
  let achou = false;

  for (const t of tokens) {
    if (!t || t === "e") continue;
    if (/^\d+$/.test(t)) {
      atual += Number(t);
      achou = true;
    } else if (t in UNIDADES) {
      atual += UNIDADES[t];
      achou = true;
    } else if (t in MULTIPLOS) {
      atual = (atual || 1) * MULTIPLOS[t];
      total += atual;
      atual = 0;
      achou = true;
    } else {
      return null;
    }
  }

  return achou ? total + atual : null;
}

/** Já veio escrito em número? ("1500", "1.500,00", "12,5") */
function comoNumeroEscrito(texto: string): number | null {
  const s = texto.replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, "").replace(",", "."));
  if (/^\d+(,\d+)?$/.test(s)) return Number(s.replace(",", "."));
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  return null;
}

/** Só a parte dos centavos: "cinco" é 0,05? Não — é 0,50. "zero cinco" é 0,05. */
function comoDecimal(tokens: string[]): string | null {
  if (tokens.every((t) => /^\d+$/.test(t) || (t in UNIDADES && UNIDADES[t] < 10))) {
    const digitos = tokens
      .map((t) => (/^\d+$/.test(t) ? t : String(UNIDADES[t])))
      .join("");
    return digitos || null;
  }
  const n = somarPalavras(tokens);
  return n === null ? null : String(n);
}

/**
 * O número que foi falado. Entende "mil e quinhentos", "1.500,00",
 * "cento e vinte reais e cinquenta centavos" e "dez vírgula cinco".
 */
export function numeroPorFala(texto: string): number | null {
  const limpo = normalizar(texto).replace(/r\$/g, " ").replace(/\s+/g, " ").trim();
  if (!limpo) return null;

  const escrito = comoNumeroEscrito(limpo);
  if (escrito !== null) return escrito;

  // "cento e vinte reais e cinquenta centavos"
  const comCentavos = limpo.match(/^(.*?)\s*centavos?\b/);
  if (comCentavos) {
    const parte = comCentavos[1];
    const separado = parte.match(/^(.*?)\b(?:reais|real)\b\s*(?:e\s+)?(.*)$/);
    const textoReais = separado ? separado[1] : "";
    const textoCentavos = separado ? separado[2] : parte;
    const reais = textoReais.trim() ? numeroPorFala(textoReais) : 0;
    const centavos = comoDecimal(palavras(textoCentavos));
    if (reais === null || centavos === null) return null;
    return reais + Number(`0.${centavos.padStart(2, "0").slice(0, 2)}`);
  }

  // "dez vírgula cinco"
  const partes = limpo.split(/\bvirgula\b|\bponto\b/);
  if (partes.length === 2) {
    const inteiro = somarPalavras(palavras(partes[0]));
    const decimal = comoDecimal(palavras(partes[1]));
    if (inteiro === null || decimal === null) return null;
    return Number(`${inteiro}.${decimal}`);
  }

  return somarPalavras(palavras(limpo));
}

/** Tira os enfeites e devolve as palavras que contam. */
function palavras(texto: string): string[] {
  return normalizar(texto)
    .replace(ENFEITE, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Valor para campo de dinheiro/quantidade: sempre com as duas casas, no jeito
 * brasileiro ("1.500,00").
 *
 * As duas famílias de máscara do sistema aceitam esse formato: a de centavos
 * (que só olha os dígitos) chega em 1.500,00, e a de vírgula (que joga fora o
 * ponto) também.
 */
export function valorPorFala(texto: string): string | null {
  const n = numeroPorFala(texto);
  if (n === null || !isFinite(n)) return null;
  return Math.abs(n).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Campo de número puro (telefone, contagem): só os algarismos. */
export function digitosPorFala(texto: string): string | null {
  const n = numeroPorFala(texto);
  if (n !== null) return String(Math.abs(Math.round(n)));
  const digitos = normalizar(texto).replace(/\D/g, "");
  return digitos || null;
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
}

function somarDias(d: Date, dias: number): Date {
  const nova = new Date(d);
  nova.setDate(nova.getDate() + dias);
  return nova;
}

/**
 * Monta a data conferindo se ela existe (31 de fevereiro não passa).
 *
 * Sem ano dito, vale o ano corrente — mas se isso jogar a data mais de meio ano
 * para trás, é porque a pessoa falou do ano que vem: quem diz "dez de janeiro"
 * em setembro está marcando o próximo janeiro, não o que já passou.
 */
function montarData(dia: number, mes: number, ano: number | null, hoje: Date): string | null {
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  let usarAno = ano ?? hoje.getFullYear();
  if (usarAno < 100) usarAno += 2000;

  const tentar = (a: number) => {
    const d = new Date(a, mes - 1, dia);
    return d.getFullYear() === a && d.getMonth() === mes - 1 && d.getDate() === dia ? d : null;
  };

  let data = tentar(usarAno);
  if (!data) return null;

  if (ano === null) {
    const meioAno = 180 * 24 * 60 * 60 * 1000;
    if (hoje.getTime() - data.getTime() > meioAno) data = tentar(usarAno + 1) ?? data;
  }
  return iso(data);
}

/**
 * A data que foi falada. Entende "hoje", "amanhã", "18/09", "dezoito de
 * setembro", "primeiro de outubro de 2027" e "dia 20".
 */
export function dataPorFala(texto: string, hoje: Date = new Date()): string | null {
  const t = normalizar(texto);
  if (!t) return null;

  if (/\bdepois de amanha\b/.test(t)) return iso(somarDias(hoje, 2));
  if (/\banteontem\b/.test(t)) return iso(somarDias(hoje, -2));
  if (/\bhoje\b/.test(t)) return iso(hoje);
  if (/\bamanha\b/.test(t)) return iso(somarDias(hoje, 1));
  if (/\bontem\b/.test(t)) return iso(somarDias(hoje, -1));

  // Já veio em número: 18/09/2026, 18-09, 18.09.26
  const emNumero = t.match(/\b(\d{1,2})\s*[\/\-.]\s*(\d{1,2})(?:\s*[\/\-.]\s*(\d{2,4}))?\b/);
  if (emNumero) {
    return montarData(+emNumero[1], +emNumero[2], emNumero[3] ? +emNumero[3] : null, hoje);
  }

  // "dezoito de setembro de 2026"
  const nomeDoMes = Object.keys(MESES).find((m) => t.includes(m));
  if (nomeDoMes) {
    const corte = t.indexOf(nomeDoMes);
    const dia = somarPalavras(palavras(t.slice(0, corte)));
    const depois = t.slice(corte + nomeDoMes.length);
    const ano = depois.match(/\b(\d{2,4})\b/);
    if (dia !== null) return montarData(dia, MESES[nomeDoMes], ano ? +ano[1] : null, hoje);
    return null;
  }

  // "dia 20" — o 20 deste mês
  const soDia = somarPalavras(palavras(t));
  if (soDia !== null && soDia >= 1 && soDia <= 31) {
    return montarData(soDia, hoje.getMonth() + 1, hoje.getFullYear(), hoje);
  }

  return null;
}

/** A hora falada: "8:30", "oito e meia", "meio dia", "vinte horas". */
export function horaPorFala(texto: string): string | null {
  const t = normalizar(texto);
  if (!t) return null;
  if (/\bmeio dia\b/.test(t)) return "12:00";
  if (/\bmeia noite\b/.test(t)) return "00:00";

  const tarde = /\b(tarde|noite)\b/.test(t);

  const emNumero = t.match(/\b(\d{1,2})\s*(?::|h|horas?|e)\s*(\d{1,2})?\b/);
  let hora: number | null = null;
  let minuto = 0;

  if (emNumero) {
    hora = +emNumero[1];
    if (emNumero[2]) minuto = +emNumero[2];
  } else {
    // "vinte horas", "oito da noite": tira o que só marca o período do dia e a
    // palavra "horas", senão sobra palavra que não é número e a conta cai fora.
    const limpo = t.replace(/\b(horas?|hrs?|hs|manha|tarde|noite|madrugada|em ponto)\b/g, " ");
    const partes = limpo.split(/\be\b/);
    hora = somarPalavras(palavras(partes[0]));
    if (partes[1]) {
      const m = /\bmeia\b/.test(partes[1]) ? 30 : somarPalavras(palavras(partes[1]));
      if (m !== null) minuto = m;
    }
  }

  if (hora === null || hora < 0 || hora > 23 || minuto < 0 || minuto > 59) return null;
  if (tarde && hora < 12) hora += 12;
  return `${doisDigitos(hora)}:${doisDigitos(minuto)}`;
}
