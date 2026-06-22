"use client";

import { useMemo } from "react";
import { useTheme } from "next-themes";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer,
  Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { formatBRL, formatBRLFull } from "@/lib/utils";
import type { CashflowProjectionDay } from "@/lib/types";

interface Props {
  data: CashflowProjectionDay[];
  saldoAtual: number;
}

export function CashflowProjection({ data, saldoAtual }: Props) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const { saldo30, saldo60, saldo90, menorSaldo, diaMenorSaldo } = useMemo(() => {
    const pick = (n: number) => data[Math.min(n, data.length - 1)]?.saldo_projetado ?? saldoAtual;
    const min = data.reduce<{ val: number; day: string }>(
      (acc, d) => (d.saldo_projetado < acc.val ? { val: d.saldo_projetado, day: d.day_label } : acc),
      { val: Infinity, day: "" }
    );
    return {
      saldo30: pick(30),
      saldo60: pick(60),
      saldo90: pick(90),
      menorSaldo: min.val === Infinity ? saldoAtual : min.val,
      diaMenorSaldo: min.day,
    };
  }, [data, saldoAtual]);

  const ficaNegativo = menorSaldo < 0;

  return (
    <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2 mb-4 flex-wrap">
        <div>
          <div className="text-sm font-medium text-produmar-800 dark:text-slate-100">
            Projeção de fluxo de caixa
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Próximos 90 dias — considera contas pendentes e vencidas
          </div>
        </div>
        {ficaNegativo && (
          <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 font-medium">
            <AlertTriangle className="w-3 h-3" />
            Saldo fica negativo em {diaMenorSaldo}
          </div>
        )}
      </div>

      {/* KPIs 30/60/90 */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <ProjectionKpi label="Em 30 dias" value={saldo30} />
        <ProjectionKpi label="Em 60 dias" value={saldo60} />
        <ProjectionKpi label="Em 90 dias" value={saldo90} />
      </div>

      {/* Chart */}
      <div className="h-[200px] sm:h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="saldoPos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#0A4DB8" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#0A4DB8" stopOpacity={0}    />
              </linearGradient>
            </defs>

            <CartesianGrid
              stroke={isDark ? "#1e293b" : "#E3EEFE"}
              strokeDasharray="2 3"
              vertical={false}
            />
            <XAxis
              dataKey="day_label"
              tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval={Math.floor(data.length / 8)}
            />
            <YAxis
              width={64}
              tick={{ fill: isDark ? "#64748b" : "#94a3b8", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatBRLFull(v)}
            />
            <Tooltip
              contentStyle={{
                background: isDark ? "#1e293b" : "white",
                border: isDark ? "1px solid #334155" : "1px solid #BBD4FA",
                borderRadius: 8,
                fontSize: 12,
                color: isDark ? "#f1f5f9" : "#0f172a",
              }}
              labelStyle={{ color: isDark ? "#93c5fd" : "#0A3A8C", fontWeight: 500 }}
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = {
                  saldo_projetado: "Saldo projetado",
                  entradas: "Entradas",
                  saidas: "Saídas",
                };
                return [formatBRL(value), labels[name] ?? name];
              }}
            />

            <ReferenceLine y={0} stroke={isDark ? "#64748b" : "#94a3b8"} strokeDasharray="3 3" />

            <Area
              type="monotone"
              dataKey="saldo_projetado"
              stroke="#0A4DB8"
              strokeWidth={2}
              fill="url(#saldoPos)"
              dot={false}
              activeDot={{ r: 4, fill: "#0A4DB8" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ProjectionKpi({ label, value }: { label: string; value: number }) {
  const positive = value >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <div
      className={`rounded-lg border p-2.5 sm:p-3 min-w-0 ${
        positive
          ? "border-produmar-100 dark:border-slate-700 bg-produmar-50/40 dark:bg-slate-800/40"
          : "border-red-200 dark:border-red-900/50 bg-red-50/60 dark:bg-red-950/30"
      }`}
    >
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mb-1">
        <Icon
          className={`w-3 h-3 shrink-0 ${
            positive ? "text-produmar-600 dark:text-produmar-400" : "text-red-600 dark:text-red-400"
          }`}
        />
        <span className="truncate">{label}</span>
      </div>
      <div
        className={`text-sm font-semibold tabular-nums truncate ${
          positive
            ? "text-produmar-800 dark:text-produmar-300"
            : "text-red-700 dark:text-red-400"
        }`}
      >
        {/* Valor cheio sem centavos no mobile (cabe em 3 colunas); com centavos no desktop */}
        <span className="sm:hidden">{formatBRLFull(value)}</span>
        <span className="hidden sm:inline">{formatBRL(value)}</span>
      </div>
    </div>
  );
}
