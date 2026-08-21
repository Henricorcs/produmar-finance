"use client";

import dynamic from "next/dynamic";
import type { CashflowProjectionDay } from "@/lib/types";

/** Mesmo caso do fluxo de caixa: a projeção entra depois que a tela já abriu. */
export const CashflowProjection = dynamic(
  () => import("./cashflow-projection").then((m) => m.CashflowProjection),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
        <div className="text-sm font-medium text-produmar-800 dark:text-slate-100">
          Projeção de saldo
        </div>
        <div className="mt-4 h-64 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
      </div>
    ),
  }
) as (props: { data: CashflowProjectionDay[]; saldoAtual: number }) => JSX.Element;
