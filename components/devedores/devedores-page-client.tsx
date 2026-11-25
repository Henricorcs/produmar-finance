"use client";

import { useEffect, useState, useMemo, useTransition } from "react";
import { Plus, Pencil, Trash2, HandCoins, Search, Paperclip, Calculator, Car } from "lucide-react";
import { ChecklistVeiculoDialog, type VeiculoDaFrota } from "./checklist-veiculo-dialog";
import type { VehicleDeliveryChecklist } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoanDialog } from "./loan-dialog";
import { LoanDetailDialog } from "./loan-detail-dialog";
import { LoanCalculatorDialog } from "./loan-calculator-dialog";
import { conferirPagamentosDasDividas, deleteLoan } from "@/app/(app)/devedores/actions";
import {
  loanTotalDue,
  loanBalance,
  formatBRL,
  formatDate,
  daysUntil,
  paraBusca,
} from "@/lib/utils";
import { LOAN_PAYMENT_METHOD_LABEL } from "@/lib/types";
import type { Loan } from "@/lib/types";
import type { LoanWithDetails } from "@/app/(app)/devedores/page";

interface Props {
  loans: LoanWithDetails[];
  /** Os checklists de entrega de veículo já feitos (migration 150). */
  checklists?: VehicleDeliveryChecklist[];
  /** Os veículos da frota — placa e nome a um toque no checklist. */
  veiculos?: VeiculoDaFrota[];
  /** CPF/CNPJ (só dígitos) → RG dado em outro cadastro (aluguéis, compradores). */
  rgsPorDocumento?: Record<string, string>;
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

/**
 * O PRÓXIMO VENCIMENTO da dívida — a parcela mais antiga ainda não paga, ou o
 * vencimento único quando não é parcelado. É a informação que decide o dia de
 * quem cobra, e ela não aparecia na lista: era preciso abrir cada dívida para
 * saber quem vence amanhã.
 */
function nextDueOf(loan: LoanWithDetails): string | null {
  const abertas = loan.loan_installments
    .filter((i) => !i.paid)
    .map((i) => i.due_date)
    .sort();
  if (abertas.length > 0) return abertas[0];
  return loan.loan_installments.length === 0 ? loan.due_date : null;
}

/** "vence 12/10", "venceu 12/09 · 5 dias", "vence hoje". */
function dueLabel(due: string): { texto: string; atrasado: boolean } {
  const dias = daysUntil(due);
  if (dias < 0) {
    const n = Math.abs(dias);
    return {
      texto: `venceu ${formatDate(due)} · ${n} ${n === 1 ? "dia" : "dias"}`,
      atrasado: true,
    };
  }
  if (dias === 0) return { texto: "vence hoje", atrasado: true };
  return { texto: `vence ${formatDate(due)}`, atrasado: false };
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

export function DevedoresPageClient({ loans, checklists = [], veiculos = [], rgsPorDocumento = {} }: Props) {
  const [, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [editing, setEditing] = useState<Loan | null>(null);
  const [detail, setDetail] = useState<LoanWithDetails | null>(null);
  const [filter, setFilter] = useState<FilterValue>("");
  const [search, setSearch] = useState("");

  // Ao abrir: confere na Cora os boletos de dívida já pagos no banco e dá a
  // baixa (pega o aviso do banco que se perdeu). No máximo a cada 5 minutos.
  useEffect(() => {
    if (!loans.some((l) => l.loan_boletos?.some((b) => b.cora_invoice_id))) return;
    conferirPagamentosDasDividas().catch(() => undefined);
    // só ao abrir a tela
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const q = paraBusca(search.trim());
    return decorated.filter(({ loan, status }) => {
      if (filter && status !== filter) return false;
      if (!q) return true;
      // A busca pega o nome E a forma de pagamento: digitar "pix" separa num
      // toque quem paga por pix, que é como a cobrança se organiza no dia.
      const forma = loan.payment_method
        ? paraBusca(LOAN_PAYMENT_METHOD_LABEL[loan.payment_method])
        : "";
      return paraBusca(loan.borrower_name).includes(q) || forma.includes(q);
    });
  }, [decorated, filter, search]);

  // Os quatro números da cobrança (dívida cancelada fica de fora de todos).
  // VENCIDO é o que o módulo existe para mostrar: não adianta saber que faltam
  // R$ 40 mil se ninguém sabe quanto já passou do dia.
  const totals = useMemo(() => {
    let devido = 0;
    let aReceber = 0;
    let recebido = 0;
    let vencido = 0;
    for (const l of loans) {
      if (l.status === "cancelado") continue;
      const paid = totalPaidOf(l);
      const saldo = loanBalance(l, paid);
      devido += loanTotalDue(l);
      recebido += paid;
      aReceber += saldo;
      if (displayStatusOf(l) === "atrasado") vencido += saldo;
    }
    return { devido, aReceber, recebido, vencido };
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
    if (
      !confirm(
        "Excluir esta dívida, com as parcelas e os pagamentos dela? Isso não tem volta.\n\nO caixa não é alterado."
      )
    )
      return;
    startTransition(async () => {
      await deleteLoan(id);
    });
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">Devedores</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Quem deve para a empresa — quanto falta e quando vence
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setCalcOpen(true)}>
            <Calculator className="w-4 h-4" />
            Calculadora
          </Button>
          {/* a folha para o comprador assinar na entrega do veículo vendido */}
          <Button variant="outline" onClick={() => setChecklistOpen(true)}>
            <Car className="w-4 h-4" />
            Checklist veículo
          </Button>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4" />
            Nova dívida
          </Button>
        </div>
      </div>

      {/* Os quatro números: dois de cada lado no celular, tudo numa linha no
          computador. VENCIDO vem por último de propósito — é o que o olho
          procura, e no fim da linha ele não se perde no meio dos outros. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <SummaryCard label="Dívida total" value={totals.devido} tone="slate" />
        <SummaryCard label="Já recebido" value={totals.recebido} tone="emerald" />
        <SummaryCard label="Falta receber" value={totals.aReceber} tone="amber" />
        <SummaryCard label="Vencido" value={totals.vencido} tone="red" />
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou forma de pagamento..."
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
            <p className="text-sm text-slate-400">Nenhum devedor encontrado</p>
            <button onClick={openCreate} className="mt-3 text-xs text-produmar-600 hover:underline">
              + Registrar a primeira dívida
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map(({ loan, status }) => {
              const paid = totalPaidOf(loan);
              const balance = loanBalance(loan, paid);
              const badge = STATUS_BADGE[status];
              // O vencimento só interessa enquanto há saldo: dívida paga não
              // vence mais, e mostrar data nela só sujaria a lista.
              const due = balance > 0 ? nextDueOf(loan) : null;
              const vencimento = due ? dueLabel(due) : null;
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
                      {/* O vencimento vem PRIMEIRO: é por ele que se cobra.
                          A data da dívida é histórico e fica atrás. */}
                      {vencimento && (
                        <span
                          className={`text-xs font-medium ${
                            vencimento.atrasado
                              ? "text-red-600 dark:text-red-400"
                              : "text-slate-500 dark:text-slate-400"
                          }`}
                        >
                          {vencimento.texto}
                        </span>
                      )}
                      <span className="text-xs text-slate-400">{formatDate(loan.loan_date)}</span>
                      {/* Como ele paga: decide se a cobrança manda boleto,
                          pede pix ou vai buscar. Some quando não foi
                          informado — dívida antiga não tem isso. */}
                      {loan.payment_method && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {LOAN_PAYMENT_METHOD_LABEL[loan.payment_method]}
                        </span>
                      )}
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

      <LoanDialog open={dialogOpen} onClose={() => setDialogOpen(false)} loan={editing} dividas={loans} />
      <LoanCalculatorDialog open={calcOpen} onClose={() => setCalcOpen(false)} />
      <ChecklistVeiculoDialog
        open={checklistOpen}
        onClose={() => setChecklistOpen(false)}
        dividas={loans}
        checklists={checklists}
        veiculos={veiculos}
        rgsPorDocumento={rgsPorDocumento}
      />
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
  tone: "slate" | "amber" | "emerald" | "red";
}) {
  const styles = {
    slate: "bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300",
    amber: "bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/50 text-amber-700 dark:text-amber-400",
    emerald: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400",
    red: "bg-red-50 dark:bg-red-950/40 border-red-100 dark:border-red-900/50 text-red-700 dark:text-red-400",
  }[tone];
  return (
    // Quatro cartões em duas colunas no celular: o rótulo em cima e o valor
    // embaixo, senão "Falta receber" e o número brigam pela mesma linha.
    <div className={`rounded-xl px-3 py-2.5 sm:p-4 border min-w-0 ${styles}`}>
      <p className="text-xs font-medium opacity-80 mb-0.5 sm:mb-1 truncate">{label}</p>
      <p className="text-base font-semibold tabular-nums">{formatBRL(value)}</p>
    </div>
  );
}
