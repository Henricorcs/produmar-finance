"use client";

import type { AnimalCategory, AnimalSex } from "@/lib/types";

// ── Sexo ─────────────────────────────────────────────────────────────────────

export const SEX_OPTIONS: { value: AnimalSex; label: string }[] = [
  { value: "macho", label: "Macho" },
  { value: "femea", label: "Fêmea" },
];

export const SEX_LABELS: Record<AnimalSex, string> = {
  macho: "Macho",
  femea: "Fêmea",
};

// ── Categoria (derivada na view) ─────────────────────────────────────────────

export const CATEGORY_META: Record<AnimalCategory, { label: string; chip: string }> = {
  boi: {
    label: "Boi",
    chip: "bg-produmar-100 text-produmar-700 dark:bg-produmar-900/40 dark:text-produmar-300",
  },
  vaca: {
    label: "Vaca",
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  },
  bezerro: {
    label: "Bezerro",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  },
};

/** Rótulo da categoria já flexionado pelo sexo (bezerro/bezerra). */
export function categoryLabel(category: AnimalCategory, sex: AnimalSex): string {
  if (category === "bezerro") return sex === "femea" ? "Bezerra" : "Bezerro";
  return CATEGORY_META[category].label;
}

// ── Formatação ───────────────────────────────────────────────────────────────

/** Idade em texto curto: "2 anos e 3 meses", "8 meses", "—". */
export function formatAge(ageMonths: number | null): string {
  if (ageMonths == null) return "—";
  if (ageMonths < 1) return "menos de 1 mês";
  const years = Math.floor(ageMonths / 12);
  const months = ageMonths % 12;
  if (years === 0) return `${months} ${months === 1 ? "mês" : "meses"}`;
  const y = `${years} ${years === 1 ? "ano" : "anos"}`;
  if (months === 0) return y;
  return `${y} e ${months} ${months === 1 ? "mês" : "meses"}`;
}

/** Peso em kg, sem casas quando inteiro (450 kg / 32,5 kg). */
export function formatWeight(kg: number): string {
  if (!kg) return "—";
  const n = Number(kg);
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1).replace(".", ",")} kg`;
}

/** Parse de número digitado com vírgula (450,5 → 450.5). */
export function parseDecimal(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

/** Máscara de digitação numérica: dígitos e uma vírgula com até 2 casas. */
export function formatDecimalInput(raw: string): string {
  const cleaned = raw.replace(/[^\d,]/g, "");
  const parts = cleaned.split(",");
  if (parts.length > 2) return parts[0] + "," + parts.slice(1).join("");
  if (parts[1]?.length > 2) return parts[0] + "," + parts[1].slice(0, 2);
  return cleaned;
}

// ── Vacinação ────────────────────────────────────────────────────────────────

export type VaccineStatus = "em_dia" | "atrasada" | "nunca";

export const VACCINE_STATUS_META: Record<VaccineStatus, { label: string; chip: string }> = {
  em_dia: {
    label: "Em dia",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  },
  atrasada: {
    label: "Atrasada",
    chip: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  },
  nunca: {
    label: "Nunca aplicada",
    chip: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  },
};

/** Soma meses a uma data YYYY-MM-DD, devolvendo YYYY-MM-DD. */
export function addMonths(dateISO: string, months: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(y, m - 1 + months, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Situação de uma vacina para um animal.
 *  • nunca    — não há aplicação registrada
 *  • em_dia   — dose única aplicada, ou reforço ainda dentro do prazo
 *  • atrasada — passou da data do reforço
 */
export function vaccineStatusFor(
  lastAppliedAt: string | null,
  recurrenceMonths: number | null
): { status: VaccineStatus; nextDate: string | null } {
  if (!lastAppliedAt) return { status: "nunca", nextDate: null };
  if (!recurrenceMonths || recurrenceMonths <= 0) return { status: "em_dia", nextDate: null };

  const nextDate = addMonths(lastAppliedAt, recurrenceMonths);
  const today = new Date();
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
  return { status: nextDate > todayISO ? "em_dia" : "atrasada", nextDate };
}

// ── Seletor de sexo (chips, bom de tocar no celular) ─────────────────────────

export function SexPicker({
  value,
  onChange,
}: {
  value: AnimalSex;
  onChange: (v: AnimalSex) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {SEX_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`py-2 text-xs rounded-lg border font-medium transition-colors ${
            value === opt.value
              ? "bg-produmar-50 border-produmar-300 text-produmar-700 dark:bg-produmar-950/40 dark:border-produmar-700 dark:text-produmar-300"
              : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
