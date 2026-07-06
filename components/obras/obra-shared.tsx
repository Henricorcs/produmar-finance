"use client";

import type { ObraStatus } from "@/lib/types";

export const OBRA_STATUS_OPTIONS: { value: ObraStatus; label: string }[] = [
  { value: "planejamento", label: "Planejamento" },
  { value: "em_andamento", label: "Em andamento" },
  { value: "concluida", label: "Concluída" },
  { value: "cancelada", label: "Cancelada" },
];

export const OBRA_STATUS_META: Record<ObraStatus, { label: string; chip: string }> = {
  planejamento: {
    label: "Planejamento",
    chip: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
  em_andamento: {
    label: "Em andamento",
    chip: "bg-produmar-100 text-produmar-700 dark:bg-produmar-900/40 dark:text-produmar-300",
  },
  concluida: {
    label: "Concluída",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  },
  cancelada: {
    label: "Cancelada",
    chip: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
  },
};
