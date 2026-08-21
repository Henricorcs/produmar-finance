"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatBRL, formatBRLFull } from "@/lib/utils";

export type CashflowPonto = {
  short: string;
  receitas: number;
  despesas: number;
  acumulado: number;
};

/**
 * Receitas vs. despesas dos últimos 12 meses, num arquivo só dele para a
 * biblioteca de gráficos entrar depois que a tela já abriu (ver o import no
 * cliente da tela).
 */
export function ReceitasDespesasChart({
  data,
  isDark,
}: {
  data: CashflowPonto[];
  isDark: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid
          stroke={isDark ? "#1e293b" : "#E3EEFE"}
          strokeDasharray="2 3"
          vertical={false}
        />
        <XAxis
          dataKey="short"
          tick={{ fill: isDark ? "#94a3b8" : "#64748b", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          width={64}
          tick={{ fill: isDark ? "#64748b" : "#94a3b8", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatBRLFull}
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
            name === "receitas"
              ? "Receitas"
              : name === "despesas"
              ? "Despesas"
              : "Saldo acumulado",
          ]}
          labelStyle={{
            color: isDark ? "#93c5fd" : "#0A3A8C",
            fontWeight: 500,
          }}
        />
        <Legend
          formatter={(v) =>
            v === "receitas" ? "Receitas" : v === "despesas" ? "Despesas" : "Acumulado"
          }
          wrapperStyle={{ fontSize: 11 }}
        />
        <Bar dataKey="receitas" fill="#0A4DB8" radius={[3, 3, 0, 0]} maxBarSize={22} />
        <Bar dataKey="despesas" fill="#5A97FF" radius={[3, 3, 0, 0]} maxBarSize={22} />
        <Line
          type="monotone"
          dataKey="acumulado"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={{ fill: "#f59e0b", r: 3 }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
