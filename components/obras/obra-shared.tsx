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

/**
 * Quadro de "não tem nada aqui" — usado pelas duas abas de obras (as do
 * cadastro e as do Estoque), para as duas ficarem com a mesma cara.
 */
export function EmptyState({
  icon: Icon,
  text,
  hint,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
      <Icon className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
      <p className="text-sm text-slate-500 dark:text-slate-400">{text}</p>
      {hint && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
