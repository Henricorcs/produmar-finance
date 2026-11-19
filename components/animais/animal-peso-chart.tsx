"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate } from "@/lib/utils";
import { formatWeight } from "./animal-shared";

export type PontoPeso = { data: string; peso: number };

/** "2026-11-19" → "19/11/26": cabe no eixo de baixo do celular. */
function dataCurta(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

/**
 * Gráfico do peso por data, na aba Evolução da ficha do animal. Fica num
 * arquivo só dele para a biblioteca de gráficos só baixar quando a aba abre.
 */
export function AnimalPesoChart({ pontos, isDark }: { pontos: PontoPeso[]; isDark: boolean }) {
  const pesos = pontos.map((p) => p.peso);
  const min = Math.min(...pesos);
  const max = Math.max(...pesos);
  // folga em cima e embaixo, para a linha não colar na borda
  const folga = Math.max(5, Math.round((max - min) * 0.15));
  const dominio: [number, number] = [Math.max(0, Math.floor(min - folga)), Math.ceil(max + folga)];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={pontos} margin={{ left: -12, right: 8, top: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="pesoFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0284c7" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#0284c7" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke={isDark ? "#1e293b" : "#f1f5f9"}
        />
        <XAxis
          dataKey="data"
          tickFormatter={dataCurta}
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
          minTickGap={16}
        />
        <YAxis
          domain={dominio}
          tickFormatter={(v: number) => `${v}`}
          tick={{ fontSize: 10, fill: "#94a3b8" }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip
          labelFormatter={(l: string) => formatDate(l)}
          formatter={(v: number) => [formatWeight(v), "Peso"]}
          contentStyle={{
            borderRadius: "8px",
            border: isDark ? "1px solid #334155" : "1px solid #e2e8f0",
            background: isDark ? "#1e293b" : "white",
            fontSize: "12px",
            color: isDark ? "#f1f5f9" : "#0f172a",
          }}
        />
        <Area
          type="monotone"
          dataKey="peso"
          stroke="#0284c7"
          strokeWidth={2}
          fill="url(#pesoFill)"
          dot={{ r: 3, fill: "#0284c7", strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
