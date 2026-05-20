"use client";

import { useState, useMemo, useTransition } from "react";
import { useTheme } from "next-themes";
import { useRouter, usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, TrendingDown } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBRL, formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui/badge";
import type { Category, CostCenter, Transaction } from "@/lib/types";

type TransactionWithRels = Transaction & {
  categories: { name: string; color: string; type: string } | null;
  cost_centers: { name: string } | null;
};

interface CategoryStat {
  id: string;
  name: string;
  color: string;
  total: number;
  count: number;
  percent: number;
}

interface Props {
  transactions: TransactionWithRels[];
  categories: Category[];
  costCenters: CostCenter[];
  month: string;
}

export function ParaOndeFoiClient({ transactions, categories, costCenters, month }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [year, monthNum] = month.split("-").map(Number);
  const monthLabel = new Date(year, monthNum - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  function navigateMonth(direction: -1 | 1) {
    const d = new Date(year, monthNum - 1 + direction, 1);
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    startTransition(() => router.push(`${pathname}?m=${newMonth}`));
  }

  const totalDespesas = transactions.reduce((s, t) => s + t.amount, 0);

  const categoryStats = useMemo((): CategoryStat[] => {
    const map = new Map<string, CategoryStat>();

    for (const t of transactions) {
      const key = t.category_id ?? "__sem_categoria__";
      const name = t.categories?.name ?? "Sem categoria";
      const color = t.categories?.color ?? "#94a3b8";

      if (!map.has(key)) {
        map.set(key, { id: key, name, color, total: 0, count: 0, percent: 0 });
      }
      const stat = map.get(key)!;
      stat.total += t.amount;
      stat.count += 1;
    }

    const stats = Array.from(map.values()).sort((a, b) => b.total - a.total);
    return stats.map((s) => ({
      ...s,
      percent: totalDespesas > 0 ? (s.total / totalDespesas) * 100 : 0,
    }));
  }, [transactions, totalDespesas]);

  const filteredTransactions = useMemo(() => {
    if (!selectedCategory) return transactions;
    return transactions.filter((t) => (t.category_id ?? "__sem_categoria__") === selectedCategory);
  }, [transactions, selectedCategory]);

  const costCenterStats = useMemo(() => {
    const map = new Map<string, { name: string; total: number }>();
    for (const t of transactions) {
      const key = t.cost_center_id ?? "__sem_cc__";
      const name = t.cost_centers?.name ?? "Sem centro de custo";
      if (!map.has(key)) map.set(key, { name, total: 0 });
      map.get(key)!.total += t.amount;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [transactions]);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">Para onde foi</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Análise de despesas por categoria</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigateMonth(-1)}
            className="p-1.5 rounded-lg hover:bg-produmar-50 text-produmar-600 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-produmar-800 capitalize min-w-[160px] text-center">
            {monthLabel}
          </span>
          <button
            onClick={() => navigateMonth(1)}
            className="p-1.5 rounded-lg hover:bg-produmar-50 text-produmar-600 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Total */}
      <div className="flex items-center gap-3 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 rounded-xl px-5 py-4">
        <TrendingDown className="w-5 h-5 text-red-500 flex-shrink-0" />
        <div>
          <p className="text-xs text-red-600 dark:text-red-400 font-medium">Total de despesas em {monthLabel}</p>
          <p className="text-2xl font-bold text-red-700 dark:text-red-400">{formatBRL(totalDespesas)}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-slate-400 dark:text-slate-500">{transactions.length} lançamento(s)</p>
        </div>
      </div>

      {transactions.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <p className="text-sm text-slate-400">Nenhuma despesa registrada neste período</p>
          </div>
        </Card>
      ) : (
        <>
          {/* Chart + breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Bar chart */}
            <Card>
              <CardHeader>
                <CardTitle>Despesas por categoria</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={categoryStats.slice(0, 8)}
                    layout="vertical"
                    margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={isDark ? "#1e293b" : "#f1f5f9"} />
                    <XAxis
                      type="number"
                      tickFormatter={(v) =>
                        v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v}`
                      }
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
                      {categoryStats.slice(0, 8).map((entry) => (
                        <Cell key={entry.id} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Category list */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Detalhamento</CardTitle>
                  {selectedCategory && (
                    <button
                      onClick={() => setSelectedCategory(null)}
                      className="text-xs text-produmar-600 hover:underline"
                    >
                      Limpar filtro
                    </button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {categoryStats.map((stat) => (
                  <button
                    key={stat.id}
                    onClick={() =>
                      setSelectedCategory(selectedCategory === stat.id ? null : stat.id)
                    }
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${
                      selectedCategory === stat.id
                        ? "bg-produmar-50 dark:bg-produmar-900/30 ring-1 ring-produmar-200 dark:ring-produmar-700"
                        : "hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    }`}
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: stat.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-slate-700 dark:text-slate-200 truncate">{stat.name}</span>
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 flex-shrink-0">
                          {formatBRL(stat.total)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${stat.percent}%`,
                              backgroundColor: stat.color,
                            }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 dark:text-slate-500 flex-shrink-0 w-10 text-right">
                          {stat.percent.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Cost center breakdown */}
          {costCenterStats.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Por centro de custo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {costCenterStats.map((cc) => (
                    <div key={cc.name} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{cc.name}</p>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-0.5">
                        {formatBRL(cc.total)}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {totalDespesas > 0
                          ? ((cc.total / totalDespesas) * 100).toFixed(1)
                          : "0"}
                        %
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Transaction list */}
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedCategory
                  ? `Lançamentos — ${categoryStats.find((s) => s.id === selectedCategory)?.name}`
                  : "Todos os lançamentos"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTransactions.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{t.description}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {t.categories && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-semibold leading-none"
                            style={{ backgroundColor: t.categories.color }}
                          >
                            {t.categories.name}
                          </span>
                        )}
                        {t.cost_centers && (
                          <span className="text-xs text-slate-400 dark:text-slate-500">{t.cost_centers.name}</span>
                        )}
                        <span className="text-xs text-slate-400 dark:text-slate-500">{formatDate(t.due_date)}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 space-y-1">
                      <p className="text-sm font-semibold text-red-600">
                        -{formatBRL(t.amount)}
                      </p>
                      <StatusBadge status={t.status} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
