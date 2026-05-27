"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ArrowDownCircle,
  ArrowUpCircle,
  FileText,
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDate } from "@/lib/utils";
import {
  TransactionDetailsDialog,
  type DetailTransaction,
} from "./transaction-details-dialog";
import type { Transaction, TransactionAttachment } from "@/lib/types";

type TransactionRow = Transaction & {
  categories: { name: string; color: string } | null;
  cost_centers: { name: string } | null;
  transaction_attachments?: TransactionAttachment[];
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
      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap ${
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
  const [selected, setSelected] = useState<DetailTransaction | null>(null);

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
    <div className="space-y-5 animate-fade-in min-w-0">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">
            Lançamentos
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Toque em qualquer lançamento para ver os detalhes
          </p>
        </div>
        {transactions.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportCSV(transactions, fileLabel)}
          >
            <Download className="w-4 h-4" />
            CSV
          </Button>
        )}
      </div>

      {/* Month navigator */}
      <div className="flex items-center gap-1 justify-center sm:justify-start">
        <button
          onClick={() => navigate(-1)}
          className="p-2.5 sm:p-1.5 rounded-lg hover:bg-produmar-50 dark:hover:bg-slate-800 text-produmar-600 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium text-produmar-800 dark:text-slate-100 capitalize min-w-[140px] sm:min-w-[160px] text-center">
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
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-3">
          <div className="flex items-center gap-1.5 sm:gap-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/50 rounded-xl px-2.5 sm:px-4 py-2 sm:py-2.5 min-w-0">
            <ArrowDownCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] sm:text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Receitas</p>
              <p className="text-[11px] sm:text-sm font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums truncate">
                {formatBRL(totalReceitas)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 rounded-xl px-2.5 sm:px-4 py-2 sm:py-2.5 min-w-0">
            <ArrowUpCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] sm:text-[10px] text-red-600 dark:text-red-400 font-medium">Despesas</p>
              <p className="text-[11px] sm:text-sm font-semibold text-red-700 dark:text-red-400 tabular-nums truncate">
                {formatBRL(totalDespesas)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-2.5 sm:px-4 py-2 sm:py-2.5 min-w-0">
            <div className="min-w-0">
              <p className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-medium">Saldo</p>
              <p
                className={`text-[11px] sm:text-sm font-semibold tabular-nums truncate ${
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

      {/* List */}
      {transactions.length > 0 && (
        <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">

          {/* Desktop table */}
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
                  const hasAttachments = (t.transaction_attachments?.length ?? 0) > 0;
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelected(t as DetailTransaction)}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
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
                        <div className="flex items-center gap-1.5">
                          <p className="truncate">{t.description}</p>
                          {hasAttachments && (
                            <Paperclip className="w-3 h-3 text-slate-400 flex-shrink-0" />
                          )}
                        </div>
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
                            className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-semibold whitespace-nowrap"
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
              const hasAttachments = (t.transaction_attachments?.length ?? 0) > 0;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelected(t as DetailTransaction)}
                  className="w-full flex items-start gap-2.5 px-3 py-3 text-left hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                >
                  <div
                    className={`w-1 self-stretch rounded-full flex-shrink-0 ${
                      isEntrada ? "bg-emerald-400" : "bg-red-400"
                    }`}
                  />
                  <div className="flex-1 min-w-0 space-y-1">
                    {/* Top row: description + amount */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0 flex items-center gap-1.5">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                          {t.description}
                        </p>
                        {hasAttachments && (
                          <Paperclip className="w-3 h-3 text-slate-400 flex-shrink-0" />
                        )}
                      </div>
                      <p
                        className={`text-sm font-semibold tabular-nums flex-shrink-0 whitespace-nowrap ${
                          isEntrada
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}
                      >
                        {isEntrada ? "+" : "−"}
                        {formatBRL(t.amount)}
                      </p>
                    </div>

                    {/* Category + date + status row */}
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      {t.categories && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-semibold truncate max-w-[140px]"
                          style={{ backgroundColor: t.categories.color }}
                        >
                          {t.categories.name}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums whitespace-nowrap">
                        {formatDate(t.due_date)}
                      </span>
                      <StatusBadge status={t.status} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-2.5 flex items-center justify-between gap-2">
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

      {/* Details dialog (read-only) */}
      <TransactionDetailsDialog
        open={!!selected}
        transaction={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
