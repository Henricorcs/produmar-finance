"use client";

import type { ToolCondition, ToolStatus } from "@/lib/types";

export const CONDITION_OPTIONS: { value: ToolCondition; label: string }[] = [
  { value: "otimo", label: "Ótimo" },
  { value: "bom", label: "Bom" },
  { value: "regular", label: "Regular" },
  { value: "ruim", label: "Ruim" },
];

export const CONDITION_LABELS: Record<ToolCondition, string> = {
  otimo: "Ótimo",
  bom: "Bom",
  regular: "Regular",
  ruim: "Ruim",
};

export const STATUS_META: Record<ToolStatus, { label: string; chip: string }> = {
  disponivel: {
    label: "Disponível",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  },
  em_uso: {
    label: "Em uso",
    chip: "bg-produmar-100 text-produmar-700 dark:bg-produmar-900/40 dark:text-produmar-300",
  },
  manutencao: {
    label: "Manutenção",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  },
  baixada: {
    label: "Inutilizada",
    chip: "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  },
};

/**
 * Valor perdido numa inutilização = qtd × valor de reposição.
 * Se o item não tem valor de reposição, cai no valor unitário.
 */
export function lossValue(
  quantity: number,
  tool: { unit_value: number; replacement_value: number } | null
): number {
  if (!tool) return 0;
  const per = tool.replacement_value > 0 ? tool.replacement_value : tool.unit_value;
  return quantity * per;
}

/** Parse de valor em R$ digitado (1.234,56 → 1234.56). */
export function parseMoney(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

/** Máscara de digitação de dinheiro: mantém só dígitos e uma vírgula com 2 casas. */
export function formatMoneyInput(raw: string): string {
  const cleaned = raw.replace(/[^\d,]/g, "");
  const parts = cleaned.split(",");
  if (parts.length > 2) return parts[0] + "," + parts.slice(1).join("");
  if (parts[1]?.length > 2) return parts[0] + "," + parts[1].slice(0, 2);
  return cleaned;
}

/** Data + hora curtas (retiradas usam timestamp, não só data). */
export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Seletor de estado de conservação em chips (bom de usar no celular). */
export function ConditionPicker({
  value,
  onChange,
}: {
  value: ToolCondition;
  onChange: (v: ToolCondition) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {CONDITION_OPTIONS.map((opt) => (
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
