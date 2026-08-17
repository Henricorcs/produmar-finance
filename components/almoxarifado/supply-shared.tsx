"use client";

import type { SupplyMovementType, SupplyStatus } from "@/lib/types";

/** Unidades sugeridas no cadastro — o campo aceita qualquer texto. */
export const UNIT_SUGGESTIONS = [
  "un",
  "pç",
  "m",
  "cm",
  "kg",
  "g",
  "L",
  "mL",
  "cx",
  "rolo",
  "barra",
  "saco",
  "par",
  "jogo",
  "lata",
  "tubo",
];

export const STATUS_META: Record<SupplyStatus, { label: string; chip: string; dot: string }> = {
  ok: {
    label: "Em estoque",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  baixo: {
    label: "Acabando",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  zerado: {
    label: "Zerado",
    chip: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
    dot: "bg-red-500",
  },
};

export const MOVEMENT_META: Record<
  SupplyMovementType,
  { label: string; sign: string; text: string; bg: string }
> = {
  entrada: {
    label: "Entrada",
    sign: "+",
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
  },
  saida: {
    label: "Saída",
    sign: "−",
    text: "text-red-600 dark:text-red-400",
    bg: "bg-red-50 dark:bg-red-900/30",
  },
  ajuste: {
    label: "Ajuste",
    sign: "",
    text: "text-slate-500 dark:text-slate-400",
    bg: "bg-slate-100 dark:bg-slate-800",
  },
};

/**
 * Máscara de quantidade: dígitos e UMA vírgula com até 3 casas. Não usa
 * separador de milhar para o valor continuar sendo lido com `parseQty`.
 */
export function formatQtyInput(raw: string): string {
  const cleaned = raw.replace(/[^\d,]/g, "");
  const parts = cleaned.split(",");
  if (parts.length > 2) return parts[0] + "," + parts.slice(1).join("");
  if (parts[1]?.length > 3) return parts[0] + "," + parts[1].slice(0, 3);
  return cleaned;
}

/** Lê a quantidade digitada (12,5 → 12.5). */
export function parseQty(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? 0 : n;
}

/** Valor de um numeric do Postgres — vem como string em alguns joins. */
export function num(v: unknown): number {
  const n = Number(v ?? 0);
  return isNaN(n) ? 0 : n;
}

/** Data + hora curtas (a lista de movimentos usa o timestamp de criação). */
export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
