"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  ArrowDownCircle,
  ArrowUpCircle,
  Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SummaryStatCard } from "@/components/ui/summary-stat-card";
import { MonthNav } from "@/components/ui/month-nav";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { TransactionDialog } from "./transaction-dialog";
import { deleteTransaction, markTransactionPaid } from "@/app/(app)/contas/actions";
import { formatBRL, formatDate } from "@/lib/utils";
import type { Category, CostCenter, Obra, Transaction, TransactionAttachment } from "@/lib/types";

type TransactionWithCategory = Transaction & {
  categories: { name: string; color: string } | null;
  transaction_attachments?: TransactionAttachment[];
};

interface Props {
  transactions: TransactionWithCategory[];
  categories: Category[];
  costCenters: CostCenter[];
  obras?: Obra[];
  month: string;
  initialFilter?: string;
}

const FILTER_TABS = [
  { label: "Todos", value: "" },
  { label: "A pagar", value: "a-pagar" },
  { label: "A receber", value: "a-receber" },
  { label: "Pagos/Recebidos", value: "pagos" },
  { label: "Vencidos", value: "vencido" },
] as const;

type FilterValue = (typeof FILTER_TABS)[number]["value"];

export function ContasPageClient({
  transactions,
  categories,
  costCenters,
  obras = [],
  month,
  initialFilter = "",
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<TransactionWithCategory | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterValue>(
    (FILTER_TABS.some((f) => f.value === initialFilter) ? initialFilter : "") as FilterValue
  );

  const filtered = useMemo(() => {
    switch (activeFilter) {
      case "a-pagar":
        return transactions.filter((t) => t.type === "saida" && t.status === "pendente");
      case "a-receber":
        return transactions.filter((t) => t.type === "entrada" && t.status === "pendente");
      case "pagos":
        return transactions.filter((t) => t.status === "pago" || t.status === "recebido");
      case "vencido":
        return transactions.filter((t) => t.status === "vencido");
      default:
        return transactions;
    }
  }, [transactions, activeFilter]);

  const [year, monthNum] = month.split("-").map(Number);
  const monthLabel = new Date(year, monthNum - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const totalReceitas = transactions
    .filter((t) => t.type === "entrada" && (t.status === "recebido"))
    .reduce((s, t) => s + t.amount, 0);

  const totalDespesas = transactions
    .filter((t) => t.type === "saida" && t.status === "pago")
    .reduce((s, t) => s + t.amount, 0);

  const totalPendente = transactions
    .filter((t) => t.status === "pendente" || t.status === "vencido")
    .reduce((s, t) => s + t.amount, 0);

  function navigateMonth(direction: -1 | 1) {
    const d = new Date(year, monthNum - 1 + direction, 1);
    const newMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    startTransition(() => router.push(`${pathname}?m=${newMonth}`));
  }

  function openCreate() {
    setEditingTransaction(null);
    setDialogOpen(true);
  }

  function openEdit(t: TransactionWithCategory) {
    setEditingTransaction(t);
    setDialogOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este lançamento? Essa ação não pode ser desfeita.")) return;
    await deleteTransaction(id);
  }

  async function handleMarkPaid(t: Transaction) {
    await markTransactionPaid(t.id, t.type);
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">Contas</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Lançamentos a pagar e a receber</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Lançamento
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <SummaryStatCard tone="emerald" icon={ArrowDownCircle} label="Recebido" amount={totalReceitas} />
        <SummaryStatCard tone="red" icon={ArrowUpCircle} label="Pago" amount={totalDespesas} />
        <SummaryStatCard tone="amber" icon={CheckCircle2} label="Pendente" amount={totalPendente} />
      </div>

      {/* Month nav + filter tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
        <MonthNav label={monthLabel} onPrev={() => navigateMonth(-1)} onNext={() => navigateMonth(1)} />
        <FilterTabs tabs={FILTER_TABS} active={activeFilter} onChange={setActiveFilter} />
      </div>

      {/* Transaction list */}
      <Card>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <p className="text-sm text-slate-400">Nenhum lançamento encontrado</p>
            <button
              onClick={openCreate}
              className="mt-3 text-xs text-produmar-600 hover:underline"
            >
              + Criar o primeiro lançamento deste período
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((t) => (
              <TransactionRow
                key={t.id}
                transaction={t}
                onEdit={openEdit}
                onDelete={handleDelete}
                onMarkPaid={handleMarkPaid}
              />
            ))}
          </div>
        )}
      </Card>

      <TransactionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        transaction={editingTransaction}
        categories={categories}
        costCenters={costCenters}
        obras={obras}
      />
    </div>
  );
}

function TransactionRow({
  transaction: t,
  onEdit,
  onDelete,
  onMarkPaid,
}: {
  transaction: TransactionWithCategory;
  onEdit: (t: TransactionWithCategory) => void;
  onDelete: (id: string) => void;
  onMarkPaid: (t: Transaction) => void;
}) {
  const canMarkPaid = t.status === "pendente" || t.status === "vencido";
  const markLabel = t.type === "entrada" ? "Marcar como recebido" : "Marcar como pago";
  const attachmentCount = t.transaction_attachments?.length ?? 0;

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition-colors group">
      {/* Type stripe */}
      <div
        className={`w-1 h-10 rounded-full flex-shrink-0 ${
          t.type === "entrada" ? "bg-emerald-400" : "bg-red-400"
        }`}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{t.description}</p>
          {attachmentCount > 0 && (
            <span
              className="flex items-center gap-0.5 text-[10px] text-slate-500 dark:text-slate-400 flex-shrink-0"
              title={`${attachmentCount} anexo(s)`}
            >
              <Paperclip className="w-3 h-3" />
              {attachmentCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {t.categories && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-semibold leading-none"
              style={{ backgroundColor: t.categories.color }}
            >
              {t.categories.name}
            </span>
          )}
          <span className="text-xs text-slate-400 dark:text-slate-500">{formatDate(t.paid_date ?? t.due_date)}</span>
        </div>
      </div>

      {/* Amount + status */}
      <div className="text-right flex-shrink-0 space-y-1">
        <p
          className={`text-sm font-semibold ${
            t.type === "entrada" ? "text-emerald-600" : "text-red-600"
          }`}
        >
          {t.type === "entrada" ? "+" : "-"}
          {formatBRL(t.amount)}
        </p>
        <StatusBadge status={t.status} />
      </div>

      {/* Actions — always visible on mobile, hover-only on desktop */}
      <div className="flex items-center gap-1 sm:gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0">
        {canMarkPaid && (
          <button
            onClick={() => onMarkPaid(t)}
            title={markLabel}
            className="p-2.5 sm:p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
          >
            <CheckCircle2 className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={() => onEdit(t)}
          title="Editar"
          className="p-2.5 sm:p-1.5 rounded-lg text-slate-400 hover:text-produmar-600 hover:bg-produmar-50 transition-colors"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDelete(t.id)}
          title="Excluir"
          className="p-2.5 sm:p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
