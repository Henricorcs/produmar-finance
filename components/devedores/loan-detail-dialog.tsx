"use client";

import { useState, useTransition, useEffect } from "react";
import { Trash2, CheckCircle2, Plus, Pencil, FileSignature } from "lucide-react";
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
import { addPayment, deletePayment } from "@/app/(app)/devedores/actions";
import { LoanComprovantes } from "./loan-comprovantes";
import { LoanBoletos } from "./loan-boletos";
import {
  loanTotalDue,
  loanInterestAmount,
  loanBalance,
  formatBRL,
  formatDate,
  daysUntil,
  formatBRLInput,
  localDateISO,
} from "@/lib/utils";
import { LOAN_PAYMENT_METHOD_LABEL } from "@/lib/types";
import type { LoanWithDetails } from "@/app/(app)/devedores/page";

interface Props {
  open: boolean;
  onClose: () => void;
  loan: LoanWithDetails | null;
  onEdit?: () => void;
  onDelete?: () => void;
}

function parseBRL(value: string): number {
  const n = parseFloat(value.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}
/** Hoje no calendário daqui — o toISOString virava amanhã depois das 21h. */
const todayStr = () => localDateISO();

export function LoanDetailDialog({ open, onClose, loan, onEdit, onDelete }: Props) {
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
    if (
      !confirm(
        "Remover este pagamento? O saldo do devedor volta a subir.\n\nO caixa não é alterado."
      )
    )
      return;
    startTransition(async () => {
      await deletePayment(id);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 line-clamp-2">
            Dívida — {loan.borrower_name}
          </DialogTitle>
        </DialogHeader>

        {/* Ações rápidas — visíveis só no celular */}
        {(onEdit || onDelete) && (
          <div className="flex gap-2 sm:hidden mb-1">
            {onEdit && (
              <Button type="button" variant="outline" size="sm" className="flex-1" onClick={onEdit}>
                <Pencil className="w-3.5 h-3.5 mr-1.5" />
                Editar
              </Button>
            )}
            {onDelete && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950/40"
                onClick={onDelete}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Excluir
              </Button>
            )}
          </div>
        )}

        <div className="space-y-4">
          {/* Resumo financeiro */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <SummaryItem label="Valor devido" value={formatBRL(loan.principal)} />
            <SummaryItem
              label={
                loan.interest_amount
                  ? "Juros (fixo)"
                  : loan.interest_rate
                    ? `Juros (${loan.interest_rate}%/mês)`
                    : "Juros"
              }
              value={formatBRL(interest)}
            />
            <SummaryItem label="Total a receber" value={formatBRL(total)} strong />
            <SummaryItem label="Já recebido" value={formatBRL(totalPaid)} tone="emerald" />
          </div>

          {/* Como ele paga e em quantas vezes — o que se precisa saber antes de
              pegar o telefone para cobrar. */}
          <div className="flex items-center gap-2 flex-wrap text-[11px]">
            {loan.payment_method && (
              <span className="font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {LOAN_PAYMENT_METHOD_LABEL[loan.payment_method]}
              </span>
            )}
            <span className="font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {loan.repayment_type === "parcelado"
                ? `Parcelado em ${loan.installments_count ?? installments.length}x`
                : "Pagamentos avulsos"}
            </span>
            <span className="text-slate-400 dark:text-slate-500">
              dívida de {formatDate(loan.loan_date)}
            </span>
          </div>

          {/* O papel para o devedor assinar: a confissão de dívida, com o valor
              e as parcelas desta dívida, para imprimir ou mandar em PDF */}
          <a
            href={`/imprimir/confissao/${loan.id}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
          >
            <FileSignature className="w-5 h-5 text-produmar-600 dark:text-produmar-400 flex-shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                Confissão de dívida
              </span>
              <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                Documento para o devedor assinar, com duas testemunhas — imprimir ou PDF
              </span>
            </span>
          </a>

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
                      ) : (
                        // Atrasada também se dá baixa: antes a etiqueta tomava o
                        // lugar do botão e a parcela vencida não tinha como ser paga
                        <div className="flex flex-col items-end gap-1">
                          {overdue && <Badge variant="danger">Atrasada</Badge>}
                          <button
                            onClick={() => handleAddPayment(inst.id, Number(inst.amount))}
                            disabled={isPending}
                            className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50 min-h-[32px]"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Marcar paga
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Registrar pagamento avulso — só p/ dívidas sem parcelas */}
          {balance > 0 && installments.length === 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Registrar pagamento
              </p>
              {/* Valor em linha própria — largura total para o número não cortar no celular */}
              <div className="space-y-1">
                <Label htmlFor="pay_amount" className="text-xs">Valor</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
                    R$
                  </span>
                  <Input
                    id="pay_amount"
                    value={payAmount}
                    onChange={(e) => setPayAmount(formatBRLInput(e.target.value))}
                    placeholder="0,00"
                    inputMode="decimal"
                    className="pl-9 tabular-nums h-11 text-base"
                  />
                </div>
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="pay_date" className="text-xs">Data</Label>
                  <Input
                    id="pay_date"
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="h-11"
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => handleAddPayment()}
                  disabled={isPending}
                  className="h-11 px-5"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Registrar
                </Button>
              </div>
            </div>
          )}

          {/* BOLETOS (migration 139) — na dívida cobrada no boleto, ou que já tem */}
          {(loan.payment_method === "boleto" || (loan.loan_boletos ?? []).length > 0) && (
            <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
              <LoanBoletos loan={loan} />
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
