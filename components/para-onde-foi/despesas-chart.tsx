"use client";

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatBRL, formatBRLFull } from "@/lib/utils";

export type DespesaFatia = { id: string; name: string; color: string; total: number };

/**
 * Gráfico de despesas por categoria, num arquivo só dele para a biblioteca de
 * gráficos entrar depois que a tela já abriu (ver o import no cliente da tela).
 */
export function DespesasChart({
  data,
  isDark,
}: {
  data: DespesaFatia[];
  isDark: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          horizontal={false}
          stroke={isDark ? "#1e293b" : "#f1f5f9"}
        />
        <XAxis
          type="number"
          tickFormatter={(v) => formatBRLFull(v)}
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={110}
          tick={{ fontSize: 10, fill: isDark ? "#94a3b8" : "#64748b" }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(value: number) => [formatBRL(value), "Total"]}
          contentStyle={{
            borderRadius: "8px",
            border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
            background: isDark ? "#1e293b" : "white",
            fontSize: "12px",
            color: isDark ? "#f1f5f9" : "#0f172a",
          }}
        />
        <Bar dataKey="total" radius={[0, 4, 4, 0]}>
          {data.map((entry) => (
            <Cell key={entry.id} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
