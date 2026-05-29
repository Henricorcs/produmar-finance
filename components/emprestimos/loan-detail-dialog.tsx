"use client";

import { useState, useTransition, useEffect } from "react";
import { Trash2, CheckCircle2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { addPayment, deletePayment } from "@/app/(app)/emprestimos/actions";
import { LoanComprovantes } from "./loan-comprovantes";
import {
  loanTotalDue,
  loanInterestAmount,
  loanBalance,
  formatBRL,
  formatDate,
  daysUntil,
} from "@/lib/utils";
import type { LoanWithDetails } from "@/app/(app)/emprestimos/page";

interface Props {
  open: boolean;
  onClose: () => void;
  loan: LoanWithDetails | null;
}

function formatBRLInput(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return (parseInt(digits, 10) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function parseBRL(value: string): number {
  const n = parseFloat(value.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}
const todayStr = () => new Date().toISOString().split("T")[0];

export function LoanDetailDialog({ open, onClose, loan }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayStr());

  useEffect(() => {
    if (open) {
      setPayAmount("");
      setPayDate(todayStr());
      setError(null);
    }
  }, [open, loan]);

  if (!loan) return null;

  const totalPaid = loan.loan_payments.reduce((s, p) => s + Number(p.amount), 0);
  const total = loanTotalDue(loan);
  const interest = loanInterestAmount(loan);
  const balance = loanBalance(loan, totalPaid);
  const installments = [...loan.loan_installments].sort((a, b) => a.number - b.number);
  const payments = [...loan.loan_payments].sort((a, b) =>
    a.payment_date < b.payment_date ? 1 : -1
  );

  function handleAddPayment(installmentId?: string, amount?: number) {
    setError(null);
    const value = amount ?? parseBRL(payAmount);
    if (!(value > 0)) {
      setError("Informe o valor do pagamento");
      return;
    }
    startTransition(async () => {
      const result = await addPayment(loan!.id, {
        amount: value,
        payment_date: installmentId ? todayStr() : payDate,
        installment_id: installmentId ?? null,
      });
      if (result && "error" in result) setError(result.error ?? "Erro inesperado");
      else setPayAmount("");
    });
  }

  function handleDeletePayment(id: string) {
    if (!confirm("Remover este pagamento? O lançamento no caixa também será excluído.")) return;
    startTransition(async () => {
      await deletePayment(id);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Empréstimo #{loan.loan_number} — {loan.borrower_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Resumo financeiro */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <SummaryItem label="Emprestado" value={formatBRL(loan.principal)} />
            <SummaryItem
              label={`Juros${loan.interest_rate ? ` (${loan.interest_rate}%/mês)` : ""}`}
              value={formatBRL(interest)}
            />
            <SummaryItem label="Total a receber" value={formatBRL(total)} strong />
            <SummaryItem label="Já recebido" value={formatBRL(totalPaid)} tone="emerald" />
          </div>

          <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-produmar-50/60 dark:bg-slate-800/50 px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-medium text-produmar-800 dark:text-slate-200">
              Saldo devedor
            </span>
            <span
              className={`text-lg font-bold tabular-nums ${
                balance <= 0 ? "text-emerald-600" : "text-produmar-700 dark:text-produmar-400"
              }`}
            >
              {formatBRL(balance)}
            </span>
          </div>

          {/* Cronograma de parcelas */}
          {installments.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Parcelas
              </p>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-100 dark:border-slate-800">
                {installments.map((inst) => {
                  const overdue = !inst.paid && daysUntil(inst.due_date) < 0;
                  return (
                    <div key={inst.id} className="flex items-center gap-3 px-3 py-2">
                      <span className="text-xs font-medium text-slate-400 w-6">{inst.number}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm tabular-nums text-slate-700 dark:text-slate-300">
                          {formatBRL(inst.amount)}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          venc. {formatDate(inst.due_date)}
                        </p>
                      </div>
                      {inst.paid ? (
                        <Badge variant="success">Paga</Badge>
                      ) : overdue ? (
                        <Badge variant="danger">Atrasada</Badge>
                      ) : (
                        <button
                          onClick={() => handleAddPayment(inst.id, Number(inst.amount))}
                          disabled={isPending}
                          className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Marcar paga
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Registrar pagamento avulso */}
          {balance > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Registrar pagamento
              </p>
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="pay_amount" className="text-xs">Valor</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                      R$
                    </span>
                    <Input
                      id="pay_amount"
                      value={payAmount}
                      onChange={(e) => setPayAmount(formatBRLInput(e.target.value))}
                      placeholder="0,00"
                      inputMode="decimal"
                      className="pl-8 tabular-nums h-9"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="pay_date" className="text-xs">Data</Label>
                  <Input
                    id="pay_date"
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="h-9"
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => handleAddPayment()}
                  disabled={isPending}
                  className="h-9"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Histórico de pagamentos */}
          {payments.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Pagamentos recebidos
              </p>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-100 dark:border-slate-800">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2 group">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium tabular-nums text-emerald-600">
                        + {formatBRL(Number(p.amount))}
                      </p>
                      <p className="text-[11px] text-slate-400">{formatDate(p.payment_date)}</p>
                    </div>
                    <button
                      onClick={() => handleDeletePayment(p.id)}
                      disabled={isPending}
                      title="Remover pagamento"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Comprovantes (prints, PIX, PDF) */}
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
            <LoanComprovantes loanId={loan.id} attachments={loan.loan_attachments ?? []} />
          </div>

          {loan.notes && (
            <p className="text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-3">
              {loan.notes}
            </p>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 px-3 py-2 rounded-lg border border-red-100 dark:border-red-900/50">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryItem({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "emerald";
}) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{label}</p>
      <p
        className={`tabular-nums ${strong ? "font-bold" : "font-medium"} ${
          tone === "emerald" ? "text-emerald-600" : "text-slate-800 dark:text-slate-200"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
