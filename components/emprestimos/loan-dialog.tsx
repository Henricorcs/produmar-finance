"use client";

import { useState, useTransition, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createLoan, updateLoan, type LoanInput } from "@/app/(app)/emprestimos/actions";
import { loanTotalDue, formatBRL } from "@/lib/utils";
import type { Loan, LoanRepaymentType } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  loan?: Loan | null;
}

function formatBRLInput(raw: string | number): string {
  let digits: string;
  if (typeof raw === "number") digits = String(Math.round(raw * 100));
  else digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const cents = parseInt(digits, 10);
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseBRL(value: string): number {
  const n = parseFloat(value.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

const todayStr = () => new Date().toISOString().split("T")[0];

export function LoanDialog({ open, onClose, loan }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [repaymentType, setRepaymentType] = useState<LoanRepaymentType>("avulso");
  const [amount, setAmount] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [termMonths, setTermMonths] = useState("");
  const [installments, setInstallments] = useState("");

  useEffect(() => {
    if (open) {
      setRepaymentType(loan?.repayment_type ?? "avulso");
      setAmount(loan?.principal ? formatBRLInput(loan.principal) : "");
      setInterestRate(loan?.interest_rate != null ? String(loan.interest_rate) : "");
      setTermMonths(loan?.term_months != null ? String(loan.term_months) : "");
      setInstallments(loan?.installments_count != null ? String(loan.installments_count) : "");
      setError(null);
    }
  }, [open, loan]);

  // Prévia do total a receber
  const principal = parseBRL(amount);
  const rate = parseFloat(interestRate.replace(",", ".")) || 0;
  const months = parseInt(termMonths, 10) || 0;
  const total = loanTotalDue({ principal, interest_rate: rate, term_months: months });
  const interest = total - principal;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const input: LoanInput = {
      borrower_name: String(fd.get("borrower_name") ?? ""),
      borrower_document: String(fd.get("borrower_document") ?? "") || null,
      borrower_phone: String(fd.get("borrower_phone") ?? "") || null,
      principal,
      interest_rate: rate > 0 ? rate : null,
      term_months: months > 0 ? months : null,
      repayment_type: repaymentType,
      installments_count:
        repaymentType === "parcelado" ? parseInt(installments, 10) || null : null,
      loan_date: String(fd.get("loan_date") ?? ""),
      due_date: String(fd.get("due_date") ?? "") || null,
      notes: String(fd.get("notes") ?? "") || null,
    };

    startTransition(async () => {
      const result = loan ? await updateLoan(loan.id, input) : await createLoan(input);
      if (result && "error" in result) setError(result.error ?? "Erro inesperado");
      else onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{loan ? "Editar empréstimo" : "Novo empréstimo"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Devedor */}
          <div className="space-y-1.5">
            <Label htmlFor="borrower_name">Devedor *</Label>
            <Input
              id="borrower_name"
              name="borrower_name"
              defaultValue={loan?.borrower_name ?? ""}
              placeholder="nome de quem pegou emprestado"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoCapitalize="characters"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="borrower_document">CPF/CNPJ</Label>
              <Input
                id="borrower_document"
                name="borrower_document"
                defaultValue={loan?.borrower_document ?? ""}
                placeholder="opcional"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="borrower_phone">Telefone</Label>
              <Input
                id="borrower_phone"
                name="borrower_phone"
                defaultValue={loan?.borrower_phone ?? ""}
                placeholder="opcional"
                inputMode="tel"
              />
            </div>
          </div>

          {/* Valor emprestado */}
          <div className="space-y-1.5">
            <Label htmlFor="amount">Valor emprestado *</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
                R$
              </span>
              <Input
                id="amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(formatBRLInput(e.target.value))}
                placeholder="0,00"
                className="pl-9 tabular-nums"
                autoComplete="off"
                required
              />
            </div>
          </div>

          {/* Juros + prazo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="interest_rate">Juros (% ao mês)</Label>
              <Input
                id="interest_rate"
                type="text"
                inputMode="decimal"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="opcional"
                className="tabular-nums"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="term_months">Prazo (meses)</Label>
              <Input
                id="term_months"
                type="number"
                min={0}
                value={termMonths}
                onChange={(e) => setTermMonths(e.target.value)}
                placeholder="ex: 6"
                className="tabular-nums"
                autoComplete="off"
              />
            </div>
          </div>

          {/* Prévia do total */}
          {principal > 0 && (
            <div className="rounded-lg bg-produmar-50 dark:bg-produmar-950/30 border border-produmar-100 dark:border-produmar-900/40 px-3 py-2 text-xs space-y-0.5">
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Juros</span>
                <span className="tabular-nums">{formatBRL(interest)}</span>
              </div>
              <div className="flex justify-between font-semibold text-produmar-800 dark:text-produmar-300">
                <span>Total a receber</span>
                <span className="tabular-nums">{formatBRL(total)}</span>
              </div>
            </div>
          )}

          {/* Forma de pagamento */}
          <div className="space-y-1.5">
            <Label>Forma de pagamento</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["avulso", "parcelado"] as LoanRepaymentType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setRepaymentType(t)}
                  className={`py-2.5 text-sm rounded-lg border font-medium transition-colors ${
                    repaymentType === t
                      ? "bg-produmar-50 dark:bg-produmar-950/40 border-produmar-300 dark:border-produmar-800 text-produmar-700 dark:text-produmar-400"
                      : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700"
                  }`}
                >
                  {t === "avulso" ? "Pagamentos avulsos" : "Parcelado"}
                </button>
              ))}
            </div>
          </div>

          {repaymentType === "parcelado" && (
            <div className="space-y-1.5">
              <Label htmlFor="installments">Número de parcelas *</Label>
              <Input
                id="installments"
                type="number"
                min={1}
                value={installments}
                onChange={(e) => setInstallments(e.target.value)}
                placeholder="ex: 6"
                className="tabular-nums"
                autoComplete="off"
              />
              {total > 0 && parseInt(installments, 10) > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  ~{formatBRL(total / parseInt(installments, 10))} por parcela, mensais a partir
                  do vencimento.
                </p>
              )}
            </div>
          )}

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="loan_date">Data do empréstimo *</Label>
              <Input
                id="loan_date"
                name="loan_date"
                type="date"
                defaultValue={loan?.loan_date ?? todayStr()}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="due_date">
                {repaymentType === "parcelado" ? "1º vencimento" : "Vencimento"}
              </Label>
              <Input
                id="due_date"
                name="due_date"
                type="date"
                defaultValue={loan?.due_date ?? ""}
              />
            </div>
          </div>

          {/* Observações */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              name="notes"
              defaultValue={loan?.notes ?? ""}
              placeholder="observações opcionais..."
              rows={2}
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoCapitalize="characters"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 dark:bg-red-950/40 px-3 py-2 rounded-lg border border-red-100 dark:border-red-900/50">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : loan ? "Salvar alterações" : "Emprestar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
