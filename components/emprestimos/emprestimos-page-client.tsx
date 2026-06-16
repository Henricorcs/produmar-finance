"use client";

import { useState, useMemo, useTransition } from "react";
import { Plus, Pencil, Trash2, HandCoins, Search, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoanDialog } from "./loan-dialog";
import { LoanDetailDialog } from "./loan-detail-dialog";
import { deleteLoan } from "@/app/(app)/emprestimos/actions";
import {
  loanTotalDue,
  loanBalance,
  formatBRL,
  formatDate,
  daysUntil,
} from "@/lib/utils";
import type { Loan } from "@/lib/types";
import type { LoanWithDetails } from "@/app/(app)/emprestimos/page";

interface Props {
  loans: LoanWithDetails[];
}

type DisplayStatus = "em_aberto" | "quitado" | "cancelado" | "atrasado";

const FILTER_TABS = [
  { label: "Todos", value: "" },
  { label: "Em aberto", value: "em_aberto" },
  { label: "Atrasados", value: "atrasado" },
  { label: "Quitados", value: "quitado" },
] as const;

type FilterValue = (typeof FILTER_TABS)[number]["value"];

function totalPaidOf(loan: LoanWithDetails): number {
  return loan.loan_payments.reduce((s, p) => s + Number(p.amount), 0);
}

function displayStatusOf(loan: LoanWithDetails): DisplayStatus {
  if (loan.status === "quitado") return "quitado";
  if (loan.status === "cancelado") return "cancelado";
  // em_aberto → verifica atraso
  const balance = loanBalance(loan, totalPaidOf(loan));
  if (balance <= 0) return "quitado";
  const overdueInstallment = loan.loan_installments.some(
    (i) => !i.paid && daysUntil(i.due_date) < 0
  );
  const overdueLump =
    loan.loan_installments.length === 0 &&
    loan.due_date != null &&
    daysUntil(loan.due_date) < 0;
  return overdueInstallment || overdueLump ? "atrasado" : "em_aberto";
}

const STATUS_BADGE: Record<DisplayStatus, { label: string; variant: "success" | "danger" | "warning" | "muted" }> = {
  em_aberto: { label: "Em aberto", variant: "warning" },
  atrasado: { label: "Atrasado", variant: "danger" },
  quitado: { label: "Quitado", variant: "success" },
  cancelado: { label: "Cancelado", variant: "muted" },
};

export function EmprestimosPageClient({ loans }: Props) {
  const [, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Loan | null>(null);
  const [detail, setDetail] = useState<LoanWithDetails | null>(null);
  const [filter, setFilter] = useState<FilterValue>("");
  const [search, setSearch] = useState("");

  // Mantém o detalhe sincronizado com os dados recarregados após uma ação
  const detailLive = useMemo(
    () => (detail ? loans.find((l) => l.id === detail.id) ?? null : null),
    [detail, loans]
  );

  const decorated = useMemo(
    () => loans.map((l) => ({ loan: l, status: displayStatusOf(l) })),
    [loans]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return decorated.filter(({ loan, status }) => {
      if (filter && status !== filter) return false;
      if (q && !loan.borrower_name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [decorated, filter, search]);

  // Totais (ignora cancelados)
  const totals = useMemo(() => {
    let emprestado = 0;
    let aReceber = 0;
    let recebido = 0;
    for (const l of loans) {
      if (l.status === "cancelado") continue;
      const paid = totalPaidOf(l);
      emprestado += l.principal;
      recebido += paid;
      aReceber += loanBalance(l, paid);
    }
    return { emprestado, aReceber, recebido };
  }, [loans]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(loan: Loan) {
    setEditing(loan);
    setDialogOpen(true);
  }
  // Abre a edição a partir do diálogo de detalhe. As duas caixas usam o
  // histórico do navegador (botão voltar do Android): fechar o detalhe dispara
  // um history.back() cujo popstate fecharia a edição se a abríssemos no mesmo
  // tick. Por isso esperamos esse popstate antes de abrir a edição.
  function openEditFromDetail(loan: Loan) {
    const onBack = () => {
      window.removeEventListener("popstate", onBack);
      openEdit(loan);
    };
    window.addEventListener("popstate", onBack);
    setDetail(null);
  }
  async function handleDelete(id: string) {
    if (!confirm("Excluir este empréstimo? Os lançamentos no caixa também serão removidos.")) return;
    startTransition(async () => {
      await deleteLoan(id);
    });
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">Empréstimos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Dinheiro emprestado a terceiros
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4" />
          Empréstimo
        </Button>
      </div>

      {/* Summary cards — empilhados no celular p/ caber o valor inteiro */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
        <SummaryCard label="Emprestado" value={totals.emprestado} tone="slate" />
        <SummaryCard label="A receber" value={totals.aReceber} tone="amber" />
        <SummaryCard label="Recebido" value={totals.recebido} tone="emerald" />
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar devedor..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 overflow-x-auto scrollbar-hide">
          {FILTER_TABS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-2 sm:py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                filter === f.value
                  ? "bg-white dark:bg-slate-700 text-produmar-700 dark:text-produmar-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <Card>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <HandCoins className="w-8 h-8 text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">Nenhum empréstimo encontrado</p>
            <button onClick={openCreate} className="mt-3 text-xs text-produmar-600 hover:underline">
              + Registrar o primeiro empréstimo
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map(({ loan, status }) => {
              const paid = totalPaidOf(loan);
              const balance = loanBalance(loan, paid);
              const badge = STATUS_BADGE[status];
              return (
                <div
                  key={loan.id}
                  onClick={() => setDetail(loan)}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition-colors group cursor-pointer"
                >
                  <div
                    className={`w-1 h-10 rounded-full flex-shrink-0 ${
                      status === "quitado"
                        ? "bg-emerald-400"
                        : status === "atrasado"
                        ? "bg-red-400"
                        : status === "cancelado"
                        ? "bg-slate-300"
                        : "bg-amber-400"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                      {loan.borrower_name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-slate-400">{formatDate(loan.loan_date)}</span>
                      {loan.repayment_type === "parcelado" && (
                        <span className="text-[10px] text-slate-400">
                          {loan.installments_count}x
                        </span>
                      )}
                      {loan.loan_attachments.length > 0 && (
                        <span
                          className="flex items-center gap-0.5 text-[10px] text-slate-400"
                          title={`${loan.loan_attachments.length} comprovante(s)`}
                        >
                          <Paperclip className="w-3 h-3" />
                          {loan.loan_attachments.length}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 space-y-1">
                    <p className="text-sm font-semibold text-produmar-700 dark:text-produmar-400 tabular-nums">
                      {formatBRL(loanTotalDue(loan))}
                    </p>
                    {balance > 0 && (
                      <p className="text-[11px] text-slate-400 tabular-nums">
                        falta {formatBRL(balance)}
                      </p>
                    )}
                  </div>
                  <div className="flex-shrink-0 hidden xs:block">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                  <div
                    className="hidden sm:flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 sm:transition-opacity flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => openEdit(loan)}
                      title="Editar"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-produmar-600 hover:bg-produmar-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(loan.id)}
                      title="Excluir"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <LoanDialog open={dialogOpen} onClose={() => setDialogOpen(false)} loan={editing} />
      <LoanDetailDialog
        open={detailLive !== null}
        onClose={() => setDetail(null)}
        loan={detailLive}
        onEdit={detailLive ? () => openEditFromDetail(detailLive) : undefined}
        onDelete={detailLive ? () => handleDelete(detailLive.id) : undefined}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "slate" | "amber" | "emerald";
}) {
  const styles = {
    slate: "bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300",
    amber: "bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/50 text-amber-700 dark:text-amber-400",
    emerald: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400",
  }[tone];
  return (
    // Celular: label e valor lado a lado (largura total). Desktop: empilhado.
    <div
      className={`rounded-xl px-4 py-3 sm:p-4 border min-w-0 flex items-center justify-between sm:block ${styles}`}
    >
      <p className="text-xs font-medium opacity-80 sm:mb-1">{label}</p>
      <p className="text-base font-semibold tabular-nums">{formatBRL(value)}</p>
    </div>
  );
}
