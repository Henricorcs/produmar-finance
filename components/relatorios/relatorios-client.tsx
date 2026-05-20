"use client";

import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
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
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { cn, formatBRL, formatBRLCompact } from "@/lib/utils";
import type { Transaction } from "@/lib/types";

type TxWithCategory = Transaction & {
  categories: { name: string; color: string } | null;
};

interface CategoryLine {
  id: string;
  name: string;
  color: string;
  total: number;
  count: number;
}

interface Props {
  transactions: TxWithCategory[];
}

type Tab = "dre" | "cashflow";

// ── Helpers ──────────────────────────────────────────────────────────────────

const PT_MONTHS = [
  "Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez",
];

function currentYM(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fullMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1)
    .toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function shortMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${PT_MONTHS[m - 1]}/${String(y).slice(2)}`;
}

function tableMonthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${PT_MONTHS[m - 1]}/${y}`;
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// CSV with semicolon separator + UTF-8 BOM (Excel pt-BR friendly)
function downloadCSV(
  filename: string,
  headers: string[],
  rows: (string | number)[][]
) {
  const BOM = "﻿";
  const escape = (v: string | number) =>
    typeof v === "number"
      ? String(v).replace(".", ",")
      : `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [headers.map(escape), ...rows.map((r) => r.map(escape))];
  const blob = new Blob([BOM + lines.map((r) => r.join(";")).join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: filename,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────────────────────────

export function RelatoriosClient({ transactions }: Props) {
  const [tab, setTab] = useState<Tab>("dre");
  const [period, setPeriod] = useState(currentYM());
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // ── DRE ─────────────────────────────────────────────────────────────────────
  const dre = useMemo(() => {
    const filtered = transactions.filter((t) => t.due_date.startsWith(period));
    const rec = new Map<string, CategoryLine>();
    const dep = new Map<string, CategoryLine>();

    for (const t of filtered) {
      const map = t.type === "entrada" ? rec : dep;
      const key = t.category_id ?? "__sem__";
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name: t.categories?.name ?? "Sem categoria",
          color: t.categories?.color ?? "#94a3b8",
          total: 0,
          count: 0,
        });
      }
      const l = map.get(key)!;
      l.total += t.amount;
      l.count += 1;
    }

    const receitas = [...rec.values()].sort((a, b) => b.total - a.total);
    const despesas = [...dep.values()].sort((a, b) => b.total - a.total);
    const totalReceitas = receitas.reduce((s, l) => s + l.total, 0);
    const totalDespesas = despesas.reduce((s, l) => s + l.total, 0);

    return {
      receitas,
      despesas,
      totalReceitas,
      totalDespesas,
      resultado: totalReceitas - totalDespesas,
    };
  }, [transactions, period]);

  // ── Cashflow (last 12 months) ────────────────────────────────────────────────
  const cashflow = useMemo(() => {
    // Build ordered map of last 12 months
    const monthMap = new Map<string, { receitas: number; despesas: number }>();
    for (let i = 11; i >= 0; i--) {
      const ym = shiftMonth(currentYM(), -i);
      monthMap.set(ym, { receitas: 0, despesas: 0 });
    }

    for (const t of transactions) {
      const ym = t.due_date.slice(0, 7);
      if (!monthMap.has(ym)) continue;
      const m = monthMap.get(ym)!;
      if (t.type === "entrada") m.receitas += t.amount;
      else m.despesas += t.amount;
    }

    let acumulado = 0;
    return [...monthMap.entries()].map(([ym, { receitas, despesas }]) => {
      const resultado = receitas - despesas;
      acumulado += resultado;
      return {
        month: ym,
        short: shortMonthLabel(ym),
        label: tableMonthLabel(ym),
        receitas,
        despesas,
        resultado,
        acumulado,
      };
    });
  }, [transactions]);

  // ── Exports ──────────────────────────────────────────────────────────────────
  function exportDRE() {
    downloadCSV(
      `DRE_${period}.csv`,
      ["Categoria", "Lançamentos", "Valor (R$)"],
      [
        ["RECEITAS", "", ""],
        ...dre.receitas.map((l) => [l.name, l.count, l.total]),
        ["TOTAL RECEITAS", "", dre.totalReceitas],
        ["", "", ""],
        ["DESPESAS", "", ""],
        ...dre.despesas.map((l) => [l.name, l.count, l.total]),
        ["TOTAL DESPESAS", "", dre.totalDespesas],
        ["", "", ""],
        ["RESULTADO", "", dre.resultado],
      ]
    );
  }

  function exportCashflow() {
    downloadCSV(
      "FluxoCaixa_12meses.csv",
      ["Mês", "Receitas (R$)", "Despesas (R$)", "Resultado (R$)", "Acumulado (R$)"],
      cashflow.map((r) => [r.label, r.receitas, r.despesas, r.resultado, r.acumulado])
    );
  }

  const today = currentYM();
  const totCF = {
    receitas: cashflow.reduce((s, r) => s + r.receitas, 0),
    despesas: cashflow.reduce((s, r) => s + r.despesas, 0),
    resultado: cashflow.reduce((s, r) => s + r.resultado, 0),
    acumulado: cashflow.at(-1)?.acumulado ?? 0,
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">
            Relatórios
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Análise financeira — DRE e fluxo de caixa
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={tab === "dre" ? exportDRE : exportCashflow}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir
          </button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit print:hidden">
        {(["dre", "cashflow"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium rounded-md transition-colors",
              tab === t
                ? "bg-white dark:bg-slate-700 text-produmar-700 dark:text-produmar-400 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            )}
          >
            {t === "dre" ? "DRE" : "Fluxo de Caixa"}
          </button>
        ))}
      </div>

      {/* ══ DRE ══════════════════════════════════════════════════════════════ */}
      {tab === "dre" && (
        <div className="space-y-4">
          {/* Period navigator */}
          <div className="flex items-center gap-1 print:hidden">
            <button
              onClick={() => setPeriod(shiftMonth(period, -1))}
              className="p-2.5 sm:p-1.5 rounded-lg hover:bg-produmar-50 dark:hover:bg-slate-800 text-produmar-600 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-produmar-800 dark:text-slate-100 capitalize min-w-[180px] text-center">
              {fullMonthLabel(period)}
            </span>
            <button
              onClick={() => setPeriod(shiftMonth(period, 1))}
              className="p-2.5 sm:p-1.5 rounded-lg hover:bg-produmar-50 dark:hover:bg-slate-800 text-produmar-600 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Print title */}
          <div className="hidden print:block text-center mb-6">
            <p className="text-xl font-bold text-slate-900 capitalize">
              DRE — {fullMonthLabel(period)}
            </p>
            <p className="text-sm text-slate-500 mt-1">PRODUMAR Finance</p>
          </div>

          {/* DRE card */}
          <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            {/* ── Receitas section ── */}
            <SectionHeader
              icon={<TrendingUp className="w-4 h-4" />}
              label="RECEITAS"
              variant="receita"
            />
            {dre.receitas.length === 0 ? (
              <EmptyLine label="Nenhuma receita confirmada neste período" />
            ) : (
              <div className="divide-y divide-slate-50 dark:divide-slate-800/60">
                {dre.receitas.map((l) => (
                  <DRELine
                    key={l.id}
                    line={l}
                    sectionTotal={dre.totalReceitas}
                  />
                ))}
              </div>
            )}
            <SectionTotal
              label="Total de Receitas"
              value={dre.totalReceitas}
              variant="receita"
            />

            {/* ── Despesas section ── */}
            <SectionHeader
              icon={<TrendingDown className="w-4 h-4" />}
              label="DESPESAS"
              variant="despesa"
            />
            {dre.despesas.length === 0 ? (
              <EmptyLine label="Nenhuma despesa confirmada neste período" />
            ) : (
              <div className="divide-y divide-slate-50 dark:divide-slate-800/60">
                {dre.despesas.map((l) => (
                  <DRELine
                    key={l.id}
                    line={l}
                    sectionTotal={dre.totalDespesas}
                  />
                ))}
              </div>
            )}
            <SectionTotal
              label="Total de Despesas"
              value={dre.totalDespesas}
              variant="despesa"
            />

            {/* ── Resultado ── */}
            <div
              className={cn(
                "flex items-center justify-between px-5 py-4",
                dre.resultado >= 0
                  ? "bg-emerald-50/80 dark:bg-emerald-950/30"
                  : "bg-red-50/80 dark:bg-red-950/30"
              )}
            >
              <div className="flex items-center gap-2">
                {dre.resultado > 0 ? (
                  <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : dre.resultado < 0 ? (
                  <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                ) : (
                  <Minus className="w-4 h-4 text-slate-400" />
                )}
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-wide">
                  RESULTADO DO PERÍODO
                </span>
              </div>
              <span
                className={cn(
                  "text-xl font-bold tabular-nums",
                  dre.resultado >= 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-red-700 dark:text-red-400"
                )}
              >
                {dre.resultado >= 0 ? "+" : ""}
                {formatBRL(dre.resultado)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ══ CASHFLOW ═════════════════════════════════════════════════════════ */}
      {tab === "cashflow" && (
        <div className="space-y-4">
          {/* Print title */}
          <div className="hidden print:block text-center mb-6">
            <p className="text-xl font-bold text-slate-900">
              Fluxo de Caixa — Últimos 12 meses
            </p>
            <p className="text-sm text-slate-500 mt-1">PRODUMAR Finance</p>
          </div>

          {/* Chart card */}
          <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <p className="text-sm font-medium text-produmar-800 dark:text-slate-100 mb-1">
              Receitas vs. Despesas
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
              Últimos 12 meses · linha amarela = saldo acumulado
            </p>
            <div className="h-[220px] sm:h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={cashflow}
                  margin={{ top: 4, right: 8, left: -10, bottom: 0 }}
                >
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
                    tick={{ fill: isDark ? "#64748b" : "#94a3b8", fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={formatBRLCompact}
                  />
                  <Tooltip
                    contentStyle={{
                      background: isDark ? "#1e293b" : "white",
                      border: isDark
                        ? "1px solid #334155"
                        : "1px solid #BBD4FA",
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
                      v === "receitas"
                        ? "Receitas"
                        : v === "despesas"
                        ? "Despesas"
                        : "Acumulado"
                    }
                    wrapperStyle={{ fontSize: 11 }}
                  />
                  <Bar
                    dataKey="receitas"
                    fill="#0A4DB8"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={22}
                  />
                  <Bar
                    dataKey="despesas"
                    fill="#5A97FF"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={22}
                  />
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
            </div>
          </div>

          {/* Table card */}
          <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    {[
                      { label: "Mês", align: "left" },
                      { label: "Receitas", align: "right", cls: "text-emerald-600 dark:text-emerald-400" },
                      { label: "Despesas", align: "right", cls: "text-red-600 dark:text-red-400" },
                      { label: "Resultado", align: "right", cls: "text-slate-600 dark:text-slate-300" },
                      { label: "Acumulado", align: "right", cls: "text-amber-600 dark:text-amber-400" },
                    ].map(({ label, align, cls }) => (
                      <th
                        key={label}
                        className={cn(
                          "px-4 py-3 text-xs font-semibold whitespace-nowrap",
                          align === "left" ? "text-left text-slate-500 dark:text-slate-400" : `text-right ${cls}`
                        )}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {cashflow.map((row) => (
                    <tr
                      key={row.month}
                      className={cn(
                        "transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/40",
                        row.month === today &&
                          "bg-produmar-50/50 dark:bg-produmar-900/10"
                      )}
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        {row.label}
                        {row.month === today && (
                          <span className="ml-2 text-[10px] bg-produmar-100 dark:bg-produmar-900/40 text-produmar-600 dark:text-produmar-400 px-1.5 py-0.5 rounded-full font-medium">
                            atual
                          </span>
                        )}
                      </td>
                      <MoneyCell value={row.receitas} color="emerald" dash />
                      <MoneyCell value={row.despesas} color="red" dash />
                      <MoneyCell value={row.resultado} color="auto" signed />
                      <MoneyCell value={row.acumulado} color="amber" signed />
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                    <td className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-100">
                      TOTAL 12 MESES
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {formatBRL(totCF.receitas)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-red-600 dark:text-red-400 tabular-nums">
                      {formatBRL(totCF.despesas)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right text-xs font-bold tabular-nums",
                        totCF.resultado >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {totCF.resultado >= 0 ? "+" : ""}
                      {formatBRL(totCF.resultado)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right text-xs font-bold tabular-nums",
                        totCF.acumulado >= 0
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-red-600 dark:text-red-400"
                      )}
                    >
                      {formatBRL(totCF.acumulado)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  label,
  variant,
}: {
  icon: React.ReactNode;
  label: string;
  variant: "receita" | "despesa";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-5 py-2.5 border-b",
        variant === "receita"
          ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/30"
          : "bg-red-50 dark:bg-red-950/30 border-red-100 dark:border-red-900/30"
      )}
    >
      <span
        className={
          variant === "receita"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-red-600 dark:text-red-400"
        }
      >
        {icon}
      </span>
      <span
        className={cn(
          "text-xs font-bold tracking-wider",
          variant === "receita"
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-red-700 dark:text-red-400"
        )}
      >
        {label}
      </span>
    </div>
  );
}

function SectionTotal({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: "receita" | "despesa";
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-5 py-3 border-y",
        variant === "receita"
          ? "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30"
          : "bg-red-50/60 dark:bg-red-950/20 border-red-100 dark:border-red-900/30"
      )}
    >
      <span
        className={cn(
          "text-xs font-semibold",
          variant === "receita"
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-red-700 dark:text-red-400"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "text-sm font-bold tabular-nums",
          variant === "receita"
            ? "text-emerald-700 dark:text-emerald-400"
            : "text-red-700 dark:text-red-400"
        )}
      >
        {formatBRL(value)}
      </span>
    </div>
  );
}

function EmptyLine({ label }: { label: string }) {
  return (
    <div className="px-5 py-4 text-sm text-slate-400 dark:text-slate-500 italic">
      {label}
    </div>
  );
}

function DRELine({
  line,
  sectionTotal,
}: {
  line: CategoryLine;
  sectionTotal: number;
}) {
  const pct = sectionTotal > 0 ? (line.total / sectionTotal) * 100 : 0;

  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <div
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: line.color }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-4 mb-1">
          <span className="text-sm text-slate-700 dark:text-slate-200 truncate">
            {line.name}
          </span>
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums flex-shrink-0">
            {formatBRL(line.total)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, backgroundColor: line.color }}
            />
          </div>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 w-10 text-right flex-shrink-0">
            {pct.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

function MoneyCell({
  value,
  color,
  dash,
  signed,
}: {
  value: number;
  color: "emerald" | "red" | "amber" | "auto";
  dash?: boolean;
  signed?: boolean;
}) {
  const autoColor =
    color === "auto"
      ? value >= 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-red-600 dark:text-red-400"
      : color === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : color === "red"
      ? "text-red-600 dark:text-red-400"
      : "text-amber-600 dark:text-amber-400";

  if (dash && value === 0) {
    return (
      <td className="px-4 py-2.5 text-right text-sm text-slate-300 dark:text-slate-600 tabular-nums">
        —
      </td>
    );
  }

  return (
    <td className={cn("px-4 py-2.5 text-right text-sm tabular-nums font-medium", autoColor)}>
      {signed && value > 0 ? "+" : ""}
      {formatBRL(value)}
    </td>
  );
}
