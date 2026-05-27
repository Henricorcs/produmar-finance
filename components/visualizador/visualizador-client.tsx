"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Download,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  FileText,
  Paperclip,
  Search,
  X,
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

// ── Column definitions ────────────────────────────────────────────────────────

type SortKey = "type" | "description" | "due_date" | "paid_date" | "category" | "cost_center" | "status" | "amount";
type SortDir = "asc" | "desc";

const COLUMNS: { label: string; key: SortKey; align?: "right" }[] = [
  { label: "Tipo",           key: "type" },
  { label: "Descrição",      key: "description" },
  { label: "Vencimento",     key: "due_date" },
  { label: "Pagamento",      key: "paid_date" },
  { label: "Categoria",      key: "category" },
  { label: "Centro de Custo", key: "cost_center" },
  { label: "Status",         key: "status" },
  { label: "Valor",          key: "amount", align: "right" },
];

function getSortValue(t: TransactionRow, key: SortKey): string | number {
  switch (key) {
    case "type":        return t.type;
    case "description": return t.description.toLowerCase();
    case "due_date":    return t.due_date ?? "";
    case "paid_date":   return t.paid_date ?? "";
    case "category":    return (t.categories?.name ?? "").toLowerCase();
    case "cost_center": return (t.cost_centers?.name ?? "").toLowerCase();
    case "status":      return STATUS_LABEL[t.status] ?? t.status;
    case "amount":      return t.amount;
  }
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="w-3 h-3 opacity-30" />;
  return dir === "asc"
    ? <ChevronUp className="w-3 h-3 text-produmar-600 dark:text-produmar-400" />
    : <ChevronDown className="w-3 h-3 text-produmar-600 dark:text-produmar-400" />;
}

// ── Main component ────────────────────────────────────────────────────────────

export function VisualizadorClient({ transactions, month }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<DetailTransaction | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      if (sortDir === "asc") {
        setSortDir("desc");
      } else {
        // third click: clear sort
        setSortKey(null);
        setSortDir("asc");
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

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

  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = !q ? transactions : transactions.filter((t) =>
      t.description.toLowerCase().includes(q) ||
      (t.notes ?? "").toLowerCase().includes(q) ||
      (t.categories?.name ?? "").toLowerCase().includes(q) ||
      (t.cost_centers?.name ?? "").toLowerCase().includes(q) ||
      (STATUS_LABEL[t.status] ?? "").toLowerCase().includes(q)
    );

    if (!sortKey) return filtered;

    return [...filtered].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [transactions, search, sortKey, sortDir]);

  // Apenas valores efetivamente recebidos / pagos
  const totalReceitas = filteredTransactions
    .filter((t) => t.type === "entrada" && t.status === "recebido")
    .reduce((s, t) => s + t.amount, 0);

  const totalDespesas = filteredTransactions
    .filter((t) => t.type === "saida" && t.status === "pago")
    .reduce((s, t) => s + t.amount, 0);

  // Pendentes / vencidos que ainda não foram pagos
  const totalAPagar = filteredTransactions
    .filter((t) => t.type === "saida" && (t.status === "pendente" || t.status === "vencido"))
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
            onClick={() => exportCSV(filteredTransactions, fileLabel)}
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

      {/* Search */}
      {transactions.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar por descrição, categoria, status…"
            className="w-full pl-9 pr-9 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-produmar-500 transition"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Summary */}
      {filteredTransactions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {/* Receitas recebidas */}
          <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/50 rounded-xl px-3 sm:px-4 py-2.5 min-w-0">
            <ArrowDownCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Recebido</p>
              <p className="text-xs sm:text-sm font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums truncate">
                {formatBRL(totalReceitas)}
              </p>
            </div>
          </div>
          {/* Despesas pagas */}
          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 rounded-xl px-3 sm:px-4 py-2.5 min-w-0">
            <ArrowUpCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-red-600 dark:text-red-400 font-medium">Pago</p>
              <p className="text-xs sm:text-sm font-semibold text-red-700 dark:text-red-400 tabular-nums truncate">
                {formatBRL(totalDespesas)}
              </p>
            </div>
          </div>
          {/* Saldo */}
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl px-3 sm:px-4 py-2.5 min-w-0">
            <div className="min-w-0">
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Saldo</p>
              <p
                className={`text-xs sm:text-sm font-semibold tabular-nums truncate ${
                  totalReceitas - totalDespesas >= 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {formatBRL(totalReceitas - totalDespesas)}
              </p>
            </div>
          </div>
          {/* A pagar */}
          <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/50 rounded-xl px-3 sm:px-4 py-2.5 min-w-0">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">A pagar</p>
              <p className="text-xs sm:text-sm font-semibold text-amber-700 dark:text-amber-400 tabular-nums truncate">
                {formatBRL(totalAPagar)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {filteredTransactions.length === 0 && (
        <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-14 flex flex-col items-center gap-3">
          <FileText className="w-10 h-10 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center">
            {search
              ? "Nenhum lançamento encontrado para esta pesquisa."
              : "Nenhum lançamento encontrado neste período."}
          </p>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-xs text-produmar-600 dark:text-produmar-400 hover:underline"
            >
              Limpar pesquisa
            </button>
          )}
        </div>
      )}

      {/* List */}
      {filteredTransactions.length > 0 && (
        <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60">
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={`px-3 py-3 whitespace-nowrap ${col.align === "right" ? "text-right" : "text-left"}`}
                    >
                      <button
                        onClick={() => handleSort(col.key)}
                        className={`inline-flex items-center gap-1 text-xs font-semibold transition-colors select-none ${
                          sortKey === col.key
                            ? "text-produmar-700 dark:text-produmar-300"
                            : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        }`}
                      >
                        {col.label}
                        <SortIcon active={sortKey === col.key} dir={sortDir} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTransactions.map((t) => {
                  const isEntrada = t.type === "entrada";
                  const hasAttachments = (t.transaction_attachments?.length ?? 0) > 0;
                  return (
                    <tr
                      key={t.id}
                      onClick={() => setSelected(t as DetailTransaction)}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                    >
                      <td className="px-3 py-3">
                        <div
                          className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${
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
                      <td className="px-3 py-3 text-slate-800 dark:text-slate-200 font-medium max-w-[220px]">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate" title={t.description}>{t.description}</p>
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
                      <td className="px-3 py-3 text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {formatDate(t.due_date)}
                      </td>
                      <td className="px-3 py-3 text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {t.paid_date ? formatDate(t.paid_date) : "—"}
                      </td>
                      <td className="px-3 py-3 max-w-[140px]">
                        {t.categories ? (
                          <span
                            className="inline-block text-[10px] px-1.5 py-0.5 rounded-full text-white font-semibold max-w-full truncate align-middle"
                            style={{ backgroundColor: t.categories.color }}
                            title={t.categories.name}
                          >
                            {t.categories.name}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-500 dark:text-slate-400 text-xs max-w-[130px]">
                        <p className="truncate" title={t.cost_centers?.name ?? undefined}>
                          {t.cost_centers?.name ?? "—"}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={t.status} />
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-semibold tabular-nums whitespace-nowrap ${
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
            {filteredTransactions.map((t) => {
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
              {filteredTransactions.length}
              {search ? `/${transactions.length}` : ""} lançamento{filteredTransactions.length !== 1 ? "s" : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportCSV(filteredTransactions, fileLabel)}
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
