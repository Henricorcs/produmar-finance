"use client";

import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// O visual que o módulo Aluguéis repete
// ─────────────────────────────────────────────────────────────────────────────

/** Rodapé de diálogo que fica colado embaixo no celular. */
export const STICKY_FOOTER =
  "sticky bottom-0 z-10 flex-row -mx-5 px-5 pt-3 pb-1 " +
  "bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 " +
  "sm:static sm:mx-0 sm:px-0 sm:pt-0 sm:pb-0 sm:border-0";

export const FOOTER_CANCEL = "flex-1 sm:flex-none";
export const FOOTER_SUBMIT = "flex-[2] sm:flex-none";

/** Chip de filtro rolável. */
export function Chip({
  label,
  ativo,
  onClick,
}: {
  label: string;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
        ativo
          ? "bg-produmar-600 border-produmar-600 text-white"
          : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
      )}
    >
      {label}
    </button>
  );
}

/** O código do imóvel, do jeito que se fala: "nº 3". */
export function CodigoDoImovel({ code }: { code: number }) {
  return (
    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400 tabular-nums">
      nº {code}
    </span>
  );
}
