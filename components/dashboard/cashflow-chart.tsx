"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer,
  Tooltip, CartesianGrid,
} from "recharts";
import { formatBRL, formatBRLCompact } from "@/lib/utils";
import type { CashflowMonth } from "@/lib/types";

export function CashflowChart({ data }: { data: CashflowMonth[] }) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  function handleBarClick(entry: CashflowMonth, filter: "pagos" | "para-onde-foi") {
    if (!entry?.month) return;
    if (filter === "pagos") {
      router.push(`/contas?m=${entry.month}&filter=pagos`);
    } else {
      router.push(`/para-onde-foi?m=${entry.month}`);
    }
  }

  return (
    <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
      <div className="flex items-start justify-between gap-2 mb-1 flex-wrap">
        <div>
          <div className="text-sm font-medium text-produmar-800 dark:text-slate-100">Fluxo de caixa</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Últimos 6 meses — toque nas barras para filtrar</div>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-produmar-600" />
            Receitas
          </span>
          <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
            <span className="w-2.5 h-2.5 rounded-sm bg-produmar-300" />
            Despesas
          </span>
        </div>
      </div>

      <div className="h-[190px] sm:h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 0, left: -10, bottom: 0 }}>
            <CartesianGrid
              stroke={isDark ? "#1e293b" : "#E3EEFE"}
              strokeDasharray="2 3"
              vertical={false}
            />
            <XAxis
              dataKey="month_label"
              tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: isDark ? "#64748b" : "#94a3b8", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatBRLCompact(v)}
            />

            <Tooltip
              contentStyle={{
                background: isDark ? "#1e293b" : "white",
                border: isDark ? "1px solid #334155" : "1px solid #BBD4FA",
                borderRadius: 8,
                fontSize: 12,
                color: isDark ? "#f1f5f9" : "#0f172a",
              }}
              formatter={(value: number, name: string) => [
                formatBRL(value),
                name === "receitas" ? "Receitas" : "Despesas",
              ]}
              labelStyle={{ color: isDark ? "#93c5fd" : "#0A3A8C", fontWeight: 500 }}
            />

            {/* Receitas — clica → Contas (pagos/recebidos) do mês */}
            <Bar
              dataKey="receitas"
              fill="#0A4DB8"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              style={{ cursor: "pointer" }}
              activeBar={{ fill: "#1260CC" }}
              onClick={(entry) => handleBarClick(entry as CashflowMonth, "pagos")}
            />

            {/* Despesas — clica → Para onde foi do mês */}
            <Bar
              dataKey="despesas"
              fill="#5A97FF"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              style={{ cursor: "pointer" }}
              activeBar={{ fill: "#3378F0" }}
              onClick={(entry) => handleBarClick(entry as CashflowMonth, "para-onde-foi")}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
