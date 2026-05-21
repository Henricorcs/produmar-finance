"use client";

import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ArrowDownCircle,
  ArrowUpCircle,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDate } from "@/lib/utils";
import type { Transaction } from "@/lib/types";

type TransactionRow = Transaction & {
  categories: { name: string; color: string } | null;
  cost_centers: { name: string } | null;
};

interface Props {
  transactions: TransactionRow[];
  month: string;
}

const STATUS_LABEL: Record<string, string> = {
  pendente:  "Pendente",
  pago:      "Pago",
  recebido:  "Recebido",
  vencido:   "Vencido",
  cancelado: "Cancelado",
};

const STATUS_STYLE: Record<string, string> = {
  pendente:  "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400",
  pago:      "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400",
  recebido:  "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400",
  vencido:   "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400",
  cancelado: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
};

// ── CSV export ────────────────────────────────────────────────────────────────

function exportCSV(transactions: TransactionRow[], fileLabel: string) {
  const headers = [
    "Tipo",
    "Descrição",
    "Valor (R$)",
    "Vencimento",
    "Data Pagamento",
    "Status",
    "Categoria",
    "Centro de Custo",
    "Observações",
  ];

  const rows = transactions.map((t) => [
    t.type === "entrada" ? "Receita" : "Despesa",
    t.description,
    t.amount.toFixed(2).replace(".", ","),
    t.due_date,
    t.paid_date ?? "",
    STATUS_LABEL[t.status] ?? t.status,
    t.categories?.name ?? "",
    t.cost_centers?.name ?? "",
    t.notes ?? "",
  ]);

  const csv =
    "﻿" +
    [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")
      )
      .join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lancamentos-${fileLabel}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
        STATUS_STYLE[status] ?? STATUS_STYLE.pendente
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function VisualizadorClient({ transactions, month }: Props) {
  const router = useRouter();
  const [year, monthNum] = month.split("-").map(Number);

  const monthLabel = new Date(year, monthNum - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  const fileLabel = `${String(monthNum).padStart(2, "0")}-${year}`;

  function navigate(dir: -1 | 1) {
    const d = new Date(year, monthNum - 1 + dir, 1);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    router.push(`/visualizador?m=${m}`);
  }

  const totalReceitas = transactions
    .filter((t) => t.type === "entrada")
    .reduce((s, t) => s + t.amount, 0);

  const totalDespesas = transactions
    .filter((t) => t.type === "saida")
    .reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">
            Lançamentos
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Consulte e exporte os lançamentos por período
          </p>
        </div>
        {transactions.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCSV(transactions, fileLabel)}
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </Button>
        )}
      </div>

      {/* Month navigator */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => navigate(-1)}
          className="p-2.5 sm:p-1.5 rounded-lg hover:bg-produmar-50 dark:hover:bg-slate-800 text-produmar-600 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium text-produmar-800 dark:text-slate-100 capitalize min-w-[160px] text-center">
          {monthLabel}
        </span>
        <button
          onClick={() => navigate(1)}
          className="p-2.5 sm:p-1.5 rounded-lg hover:bg-produmar-50 dark:hover:bg-slate-800 text-produmar-600 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Summary */}
      {transactions.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/50 rounded-xl px-4 py-2.5">
            <ArrowDownCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <div>
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Receitas</p>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                {formatBRL(totalReceitas)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 rounded-xl px-4 py-2.5">
            <ArrowUpCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
            <div>
              <p className="text-[10px] text-red-600 dark:text-red-400 font-medium">Despesas</p>
              <p className="text-sm font-semibold text-red-700 dark:text-red-400 tabular-nums">
                {formatBRL(totalDespesas)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-4 py-2.5">
            <div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Saldo do período</p>
              <p
                className={`text-sm font-semibold tabular-nums ${
                  totalReceitas - totalDespesas >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {formatBRL(totalReceitas - totalDespesas)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {transactions.length === 0 && (
        <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-14 flex flex-col items-center gap-3">
          <FileText className="w-10 h-10 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center">
            Nenhum lançamento encontrado neste período.
          </p>
        </div>
      )}

      {/* Desktop table */}
      {transactions.length > 0 && (
        <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60">
                  {[
                    "Tipo", "Descrição", "Vencimento", "Pagamento",
                    "Categoria", "Centro de Custo", "Status", "Valor",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left text-xs font-semibold text-slate-500 dark:text-slate-400 px-4 py-3 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {transactions.map((t) => {
                  const isEntrada = t.type === "entrada";
                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                            isEntrada
                              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
                              : "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400"
                          }`}
                        >
                          {isEntrada
                            ? <ArrowDownCircle className="w-3 h-3" />
                            : <ArrowUpCircle className="w-3 h-3" />}
                          {isEntrada ? "Receita" : "Despesa"}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-800 dark:text-slate-200 font-medium max-w-[200px]">
                        <p className="truncate">{t.description}</p>
                        {t.notes && (
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                            {t.notes}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {formatDate(t.due_date)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {t.paid_date ? formatDate(t.paid_date) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {t.categories ? (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-semibold"
                            style={{ backgroundColor: t.categories.color }}
                          >
                            {t.categories.name}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                        {t.cost_centers?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={t.status} />
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap ${
                          isEntrada
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {isEntrada ? "+" : "−"}
                        {formatBRL(t.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {transactions.map((t) => {
              const isEntrada = t.type === "entrada";
              return (
                <div key={t.id} className="flex items-start gap-3 px-4 py-3.5">
                  <div
                    className={`w-1 h-10 rounded-full flex-shrink-0 mt-0.5 ${
                      isEntrada ? "bg-emerald-400" : "bg-red-400"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                      {t.description}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {t.categories && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-semibold"
                          style={{ backgroundColor: t.categories.color }}
                        >
                          {t.categories.name}
                        </span>
                      )}
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {formatDate(t.due_date)}
                      </span>
                      <StatusBadge status={t.status} />
                    </div>
                  </div>
                  <p
                    className={`text-sm font-semibold tabular-nums flex-shrink-0 ${
                      isEntrada
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {isEntrada ? "+" : "−"}
                    {formatBRL(t.amount)}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Table footer */}
          <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {transactions.length} lançamento{transactions.length !== 1 ? "s" : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportCSV(transactions, fileLabel)}
              className="h-7 text-xs"
            >
              <Download className="w-3 h-3" />
              Exportar CSV
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
