"use client";

import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  TrendingUp,
  TrendingDown,
  Minus,
  HardHat,
  Package,
  Truck,
  Wrench,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn, formatBRL, machineCategoryLabel } from "@/lib/utils";
import type { Profile, ServiceOrder, Transaction } from "@/lib/types";

// O gráfico entra depois que a tela abriu: a biblioteca de gráficos é o pedaço
// mais pesado desta página e a tabela logo abaixo já traz os mesmos números.
const ReceitasDespesasChart = dynamic(
  () =>
    import("@/components/relatorios/receitas-despesas-chart").then(
      (m) => m.ReceitasDespesasChart
    ),
  {
    ssr: false,
    loading: () => (
      <div className="h-full rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
    ),
  }
);

type TxWithMeta = Transaction & {
  categories: { name: string; color: string } | null;
  cost_centers: { name: string } | null;
};

type OrderWithMachine = ServiceOrder & {
  machines: { name: string; plate: string | null; category: string | null } | null;
};

interface CategoryLine {
  id: string;
  name: string;
  color: string;
  total: number;
  count: number;
}

interface OperatorAgg {
  id: string;
  name: string;
  total: number;
  entregues: number;
  emAndamento: number;
  pendentes: number;
  cancelados: number;
  byType: { entrega_material: number; frete: number; prestacao_servico: number; servico_rapido: number };
  trips: number;
  valorTotal: number;
  valorEntregue: number;
  orders: OrderWithMachine[];
}

interface Props {
  transactions: TxWithMeta[];
  orders: OrderWithMachine[];
  operators: Profile[];
}

type Tab = "dre" | "cashflow" | "operadores";
type GroupBy = "category" | "cost_center";

// ── Helpers ──────────────────────────────────────────────────────────────────

const PT_MONTHS = [
  "Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez",
];

// Paleta para centro de custo (não guarda cor própria) — atribuída por posição.
const PALETTE = [
  "#0A4DB8","#5A97FF","#f59e0b","#10b981","#ef4444",
  "#8b5cf6","#ec4899","#14b8a6","#f97316","#64748b",
];

const OS_TYPE_LABEL: Record<ServiceOrder["type"], string> = {
  entrega_material: "Entrega",
  frete: "Frete",
  prestacao_servico: "Serviço",
  servico_rapido: "Serviço rápido",
};

const OS_STATUS: Record<ServiceOrder["status"], { label: string; cls: string }> = {
  pendente:     { label: "Pendente",     cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  em_andamento: { label: "Em andamento", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" },
  entregue:     { label: "Entregue",     cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" },
  cancelado:    { label: "Cancelada",    cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
};

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

function formatDateBR(s: string | null): string {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
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

export function RelatoriosClient({ transactions, orders, operators }: Props) {
  const [tab, setTab] = useState<Tab>("dre");
  const [period, setPeriod] = useState(currentYM());
  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Drill-downs (abrem ao clicar)
  const [drill, setDrill] = useState<{
    title: string;
    color: string;
    variant: "receita" | "despesa";
    rows: TxWithMeta[];
    total: number;
  } | null>(null);
  const [opDrill, setOpDrill] = useState<OperatorAgg | null>(null);

  const operatorNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const op of operators) m.set(op.id, op.full_name || op.email);
    return m;
  }, [operators]);

  // ── DRE (por categoria OU centro de custo) ───────────────────────────────────
  const dre = useMemo(() => {
    const filtered = transactions.filter((t) => t.due_date.startsWith(period));
    const rec = new Map<string, CategoryLine>();
    const dep = new Map<string, CategoryLine>();

    for (const t of filtered) {
      const map = t.type === "entrada" ? rec : dep;
      let key: string, name: string, color: string;
      if (groupBy === "category") {
        key = t.category_id ?? "__sem__";
        name = t.categories?.name ?? "Sem categoria";
        color = t.categories?.color ?? "#94a3b8";
      } else {
        key = t.cost_center_id ?? "__sem__";
        name = t.cost_centers?.name ?? "Sem centro de custo";
        color = ""; // atribuída por posição abaixo
      }
      if (!map.has(key)) {
        map.set(key, { id: key, name, color, total: 0, count: 0 });
      }
      const l = map.get(key)!;
      l.total += t.amount;
      l.count += 1;
    }

    const receitas = [...rec.values()].sort((a, b) => b.total - a.total);
    const despesas = [...dep.values()].sort((a, b) => b.total - a.total);
    if (groupBy === "cost_center") {
      receitas.forEach((l, i) => (l.color = PALETTE[i % PALETTE.length]));
      despesas.forEach((l, i) => (l.color = PALETTE[i % PALETTE.length]));
    }
    const totalReceitas = receitas.reduce((s, l) => s + l.total, 0);
    const totalDespesas = despesas.reduce((s, l) => s + l.total, 0);

    return {
      receitas,
      despesas,
      totalReceitas,
      totalDespesas,
      resultado: totalReceitas - totalDespesas,
    };
  }, [transactions, period, groupBy]);

  function openDrill(line: CategoryLine, variant: "receita" | "despesa") {
    const txType = variant === "receita" ? "entrada" : "saida";
    const rows = transactions
      .filter(
        (t) =>
          t.due_date.startsWith(period) &&
          t.type === txType &&
          (groupBy === "category"
            ? (t.category_id ?? "__sem__") === line.id
            : (t.cost_center_id ?? "__sem__") === line.id)
      )
      .sort((a, b) => b.amount - a.amount);
    setDrill({ title: line.name, color: line.color, variant, rows, total: line.total });
  }

  // ── Cashflow (últimos 12 meses) ──────────────────────────────────────────────
  const cashflow = useMemo(() => {
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

  // ── Relatório por operador ───────────────────────────────────────────────────
  const operatorReport = useMemo(() => {
    const filtered = orders.filter((o) =>
      (o.delivery_date ?? o.issue_date).startsWith(period)
    );
    const map = new Map<string, OperatorAgg>();
    for (const o of filtered) {
      const key = o.assigned_to ?? "__none__";
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          name:
            key === "__none__"
              ? "Sem operador definido"
              : operatorNameById.get(key) ?? "Operador",
          total: 0,
          entregues: 0,
          emAndamento: 0,
          pendentes: 0,
          cancelados: 0,
          byType: { entrega_material: 0, frete: 0, prestacao_servico: 0, servico_rapido: 0 },
          trips: 0,
          valorTotal: 0,
          valorEntregue: 0,
          orders: [],
        });
      }
      const a = map.get(key)!;
      a.total += 1;
      a.orders.push(o);
      if (o.status === "entregue") a.entregues += 1;
      else if (o.status === "em_andamento") a.emAndamento += 1;
      else if (o.status === "pendente") a.pendentes += 1;
      else if (o.status === "cancelado") a.cancelados += 1;
      if (o.type in a.byType) a.byType[o.type] += 1;
      a.trips += o.trips_count ?? 0;
      a.valorTotal += o.total_amount ?? 0;
      if (o.status === "entregue") a.valorEntregue += o.total_amount ?? 0;
    }
    // operador identificado primeiro; "sem operador" por último
    return [...map.values()].sort((a, b) => {
      if (a.id === "__none__") return 1;
      if (b.id === "__none__") return -1;
      return b.total - a.total;
    });
  }, [orders, period, operatorNameById]);

  const opTotals = useMemo(
    () => ({
      os: operatorReport.reduce((s, o) => s + o.total, 0),
      entregues: operatorReport.reduce((s, o) => s + o.entregues, 0),
      valor: operatorReport.reduce((s, o) => s + o.valorEntregue, 0),
    }),
    [operatorReport]
  );

  // ── Exports ──────────────────────────────────────────────────────────────────
  function exportDRE() {
    const what = groupBy === "category" ? "Categoria" : "Centro de custo";
    downloadCSV(
      `DRE_${groupBy}_${period}.csv`,
      [what, "Lançamentos", "Valor (R$)"],
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

  function exportOperadores() {
    downloadCSV(
      `Operadores_${period}.csv`,
      [
        "Operador", "OS", "Entregues", "Em andamento", "Pendentes", "Canceladas",
        "Entregas", "Fretes", "Serviços", "Viagens",
        "Faturado entregue (R$)", "Valor total (R$)",
      ],
      operatorReport.map((o) => [
        o.name, o.total, o.entregues, o.emAndamento, o.pendentes, o.cancelados,
        o.byType.entrega_material, o.byType.frete, o.byType.prestacao_servico, o.trips,
        o.valorEntregue, o.valorTotal,
      ])
    );
  }

  const today = currentYM();
  const totCF = {
    receitas: cashflow.reduce((s, r) => s + r.receitas, 0),
    despesas: cashflow.reduce((s, r) => s + r.despesas, 0),
    resultado: cashflow.reduce((s, r) => s + r.resultado, 0),
    acumulado: cashflow.at(-1)?.acumulado ?? 0,
  };

  const exportFn =
    tab === "dre" ? exportDRE : tab === "cashflow" ? exportCashflow : exportOperadores;

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
            DRE, fluxo de caixa e desempenho por operador
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportFn}
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
        {(["dre", "cashflow", "operadores"] as Tab[]).map((t) => (
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
            {t === "dre" ? "DRE" : t === "cashflow" ? "Fluxo de Caixa" : "Operadores"}
          </button>
        ))}
      </div>

      {/* ══ DRE ══════════════════════════════════════════════════════════════ */}
      {tab === "dre" && (
        <div className="space-y-4">
          {/* Period navigator + group toggle */}
          <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
            <PeriodNav period={period} onChange={setPeriod} />
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
              {(["category", "cost_center"] as GroupBy[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setGroupBy(g)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
                    groupBy === g
                      ? "bg-white dark:bg-slate-700 text-produmar-700 dark:text-produmar-400 shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  )}
                >
                  {g === "category" ? "Por categoria" : "Por centro de custo"}
                </button>
              ))}
            </div>
          </div>

          {/* Print title */}
          <div className="hidden print:block text-center mb-6">
            <p className="text-xl font-bold text-slate-900 capitalize">
              DRE — {fullMonthLabel(period)}
            </p>
            <p className="text-sm text-slate-500 mt-1">
              PRODUMAR Finance · {groupBy === "category" ? "por categoria" : "por centro de custo"}
            </p>
          </div>

          <p className="text-xs text-slate-400 dark:text-slate-500 print:hidden">
            Toque em uma linha para ver os lançamentos.
          </p>

          {/* DRE card */}
          <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            {/* ── Receitas ── */}
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
                    onClick={() => openDrill(l, "receita")}
                  />
                ))}
              </div>
            )}
            <SectionTotal label="Total de Receitas" value={dre.totalReceitas} variant="receita" />

            {/* ── Despesas ── */}
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
                    onClick={() => openDrill(l, "despesa")}
                  />
                ))}
              </div>
            )}
            <SectionTotal label="Total de Despesas" value={dre.totalDespesas} variant="despesa" />

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
              <ReceitasDespesasChart data={cashflow} isDark={isDark} />
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
                        row.month === today && "bg-produmar-50/50 dark:bg-produmar-900/10"
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

      {/* ══ OPERADORES ═══════════════════════════════════════════════════════ */}
      {tab === "operadores" && (
        <div className="space-y-4">
          <div className="print:hidden">
            <PeriodNav period={period} onChange={setPeriod} />
          </div>

          {/* Print title */}
          <div className="hidden print:block text-center mb-6">
            <p className="text-xl font-bold text-slate-900 capitalize">
              Desempenho por operador — {fullMonthLabel(period)}
            </p>
            <p className="text-sm text-slate-500 mt-1">PRODUMAR Finance</p>
          </div>

          {/* Resumo do período */}
          <div className="grid grid-cols-3 gap-3">
            <SummaryStat label="Ordens de serviço" value={String(opTotals.os)} />
            <SummaryStat label="Entregues" value={String(opTotals.entregues)} accent="emerald" />
            <SummaryStat label="Faturado" value={formatBRL(opTotals.valor)} accent="produmar" />
          </div>

          <p className="text-xs text-slate-400 dark:text-slate-500 print:hidden">
            Toque em um operador para ver todas as ordens dele.
          </p>

          {operatorReport.length === 0 ? (
            <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
              Nenhuma ordem de serviço neste período.
            </div>
          ) : (
            <div className="space-y-3">
              {operatorReport.map((op) => (
                <OperatorCard key={op.id} op={op} onClick={() => setOpDrill(op)} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Drill-down de lançamentos (DRE) ── */}
      {drill && (
        <Dialog open onOpenChange={(v) => !v && setDrill(null)}>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: drill.color }}
                />
                <span className="truncate">{drill.title}</span>
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-slate-400 dark:text-slate-500 -mt-2">
              {drill.variant === "receita" ? "Receitas" : "Despesas"} · {fullMonthLabel(period)} ·{" "}
              {drill.rows.length} {drill.rows.length === 1 ? "lançamento" : "lançamentos"}
            </p>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {drill.rows.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700 dark:text-slate-200 truncate">
                      {t.description}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      {formatDateBR(t.due_date)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums flex-shrink-0",
                      drill.variant === "receita"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    )}
                  >
                    {formatBRL(t.amount)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t-2 border-slate-200 dark:border-slate-700 pt-3 mt-1">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">TOTAL</span>
              <span
                className={cn(
                  "text-base font-bold tabular-nums",
                  drill.variant === "receita"
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-red-700 dark:text-red-400"
                )}
              >
                {formatBRL(drill.total)}
              </span>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Drill-down de OS (operador) ── */}
      {opDrill && (
        <Dialog open onOpenChange={(v) => !v && setOpDrill(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
                <HardHat className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <span className="truncate">{opDrill.name}</span>
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-slate-400 dark:text-slate-500 -mt-2">
              {fullMonthLabel(period)} · {opDrill.total}{" "}
              {opDrill.total === 1 ? "ordem" : "ordens"} · faturado{" "}
              {formatBRL(opDrill.valorEntregue)}
            </p>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {opDrill.orders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => window.open(`/imprimir/os/${o.id}`, "_blank")}
                  title="Ver detalhes da OS"
                  className="w-full text-left py-2.5 px-2 -mx-2 rounded-lg hover:bg-produmar-50/60 dark:hover:bg-slate-800/60 active:bg-produmar-100/70 dark:active:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-produmar-700 dark:text-produmar-400 tabular-nums flex-shrink-0">
                        #{o.order_number}
                      </span>
                      <span className="text-sm text-slate-700 dark:text-slate-200 truncate">
                        {o.client_name || o.service_description || "—"}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                        {formatBRL(o.total_amount ?? 0)}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-produmar-50 dark:bg-slate-800 text-produmar-600 dark:text-produmar-400">
                      {OS_TYPE_LABEL[o.type]}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded",
                        OS_STATUS[o.status].cls
                      )}
                    >
                      {OS_STATUS[o.status].label}
                    </span>
                    {o.machines?.name && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                        {o.machines.name}
                        {o.machines.category ? ` · ${machineCategoryLabel(o.machines.category)}` : ""}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-auto">
                      {formatDateBR(o.delivery_date ?? o.issue_date)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PeriodNav({ period, onChange }: { period: string; onChange: (ym: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(shiftMonth(period, -1))}
        className="p-2.5 sm:p-1.5 rounded-lg hover:bg-produmar-50 dark:hover:bg-slate-800 text-produmar-600 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm font-medium text-produmar-800 dark:text-slate-100 capitalize min-w-[180px] text-center">
        {fullMonthLabel(period)}
      </span>
      <button
        onClick={() => onChange(shiftMonth(period, 1))}
        className="p-2.5 sm:p-1.5 rounded-lg hover:bg-produmar-50 dark:hover:bg-slate-800 text-produmar-600 transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "emerald" | "produmar";
}) {
  return (
    <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
      <p className="text-[11px] text-slate-400 dark:text-slate-500">{label}</p>
      <p
        className={cn(
          "text-lg font-bold tabular-nums mt-0.5",
          accent === "emerald"
            ? "text-emerald-600 dark:text-emerald-400"
            : accent === "produmar"
            ? "text-produmar-700 dark:text-produmar-400"
            : "text-slate-800 dark:text-slate-100"
        )}
      >
        {value}
      </p>
    </div>
  );
}

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
  onClick,
}: {
  line: CategoryLine;
  sectionTotal: number;
  onClick: () => void;
}) {
  const pct = sectionTotal > 0 ? (line.total / sectionTotal) * 100 : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-produmar-50/50 dark:hover:bg-slate-800/40"
    >
      <div
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: line.color }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-4 mb-1">
          <span className="text-sm text-slate-700 dark:text-slate-200 truncate">
            {line.name}
            <span className="ml-2 text-[10px] text-slate-400 dark:text-slate-500">
              {line.count} lanç.
            </span>
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
      <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 flex-shrink-0 print:hidden" />
    </button>
  );
}

function OperatorCard({ op, onClick }: { op: OperatorAgg; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 transition-colors hover:bg-produmar-50/40 dark:hover:bg-slate-800/40"
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-full bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
            <HardHat className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-slate-800 dark:text-slate-100 truncate">{op.name}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {op.total} {op.total === 1 ? "ordem" : "ordens"} no período
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-produmar-700 dark:text-produmar-400 tabular-nums">
            {formatBRL(op.valorEntregue)}
          </p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">faturado</p>
        </div>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        <StatusChip label="Entregues" value={op.entregues} cls="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" />
        <StatusChip label="Em andamento" value={op.emAndamento} cls="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" />
        <StatusChip label="Pendentes" value={op.pendentes} cls="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" />
        {op.cancelados > 0 && (
          <StatusChip label="Canceladas" value={op.cancelados} cls="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" />
        )}
      </div>

      {/* Tipo + viagens */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <Package className="w-3.5 h-3.5" /> {op.byType.entrega_material} entregas
        </span>
        <span className="flex items-center gap-1">
          <Truck className="w-3.5 h-3.5" /> {op.byType.frete} fretes
        </span>
        <span className="flex items-center gap-1">
          <Wrench className="w-3.5 h-3.5" /> {op.byType.prestacao_servico} serviços
        </span>
        {op.byType.servico_rapido > 0 && (
          <span className="flex items-center gap-1">
            <Zap className="w-3.5 h-3.5" /> {op.byType.servico_rapido} rápidos
          </span>
        )}
        {op.trips > 0 && <span>{op.trips} viagens</span>}
        <span className="ml-auto flex items-center gap-0.5 text-produmar-600 dark:text-produmar-400 print:hidden">
          Ver ordens <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </button>
  );
}

function StatusChip({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded-full", cls)}>
      {value} {label}
    </span>
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
