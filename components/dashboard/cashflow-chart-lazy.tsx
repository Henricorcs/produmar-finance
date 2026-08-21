"use client";

import dynamic from "next/dynamic";
import type { CashflowMonth } from "@/lib/types";

/**
 * O gráfico carrega depois da página. A biblioteca de gráficos é o pedaço mais
 * pesado do painel e ninguém precisa dela para ver os números do topo — então
 * a tela abre primeiro e o gráfico entra em seguida, no lugar da moldura.
 */
export const CashflowChart = dynamic(
  () => import("./cashflow-chart").then((m) => m.CashflowChart),
  {
    ssr: false,
    loading: () => <ChartFrame title="Fluxo de caixa" />,
  }
) as (props: { data: CashflowMonth[] }) => JSX.Element;

function ChartFrame({ title }: { title: string }) {
  return (
    <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <div className="text-sm font-medium text-produmar-800 dark:text-slate-100">
        {title}
      </div>
      <div className="mt-4 h-64 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
    </div>
  );
}
