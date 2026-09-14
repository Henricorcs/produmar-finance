"use client";

import { useState } from "react";
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
import { loanTotalDue, formatBRL, formatBRLInput, formatDate, parseMoney } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Hoje no fuso do aparelho (toISOString é UTC e, depois das 21h, já dá amanhã). */
const todayStr = () => addMonths(
  `${new Date().getFullYear()}-${new Date().getMonth() + 1}-${new Date().getDate()}`,
  0
);

/** Mesma conta de `addMonths` das actions: a data da parcela sai igual à da dívida. */
function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = new Date(y, m - 1 + months, d);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(
    base.getDate()
  ).padStart(2, "0")}`;
}

/**
 * CALCULADORA DE EMPRÉSTIMO — para responder "quanto fica a parcela?" antes
 * de fechar o negócio, sem lançar nada.
 *
 * A conta é a MESMA da dívida (juros simples: taxa × meses, e um mês por
 * parcela), e a divisão das parcelas também: centavo cortado nas primeiras e
 * a sobra na última. Assim o número daqui é o número que aparece depois,
 * quando a dívida for lançada com esses valores.
 */
export function LoanCalculatorDialog({ open, onClose }: Props) {
  const [amount, setAmount] = useState("");
  const [loanDate, setLoanDate] = useState(todayStr);
  const [rateStr, setRateStr] = useState("");
  const [countStr, setCountStr] = useState("");

  const principal = parseMoney(amount);
  const rate = parseFloat(rateStr.replace(",", ".")) || 0;
  const count = parseInt(countStr, 10) || 0;

  const total = loanTotalDue({
    principal,
    interest_rate: rate,
    term_months: count,
    interest_amount: null,
  });
  const interest = total - principal;

  const ready = principal > 0 && count > 0;
  const base = ready ? Math.floor((total / count) * 100) / 100 : 0;
  const last = ready ? Math.round((total - base * (count - 1)) * 100) / 100 : 0;
  const parcelas =
    ready && loanDate
      ? Array.from({ length: count }, (_, i) => ({
          number: i + 1,
          due: addMonths(loanDate, i + 1),
          amount: i === count - 1 ? last : base,
        }))
      : [];

  function limpar() {
    setAmount("");
    setLoanDate(todayStr());
    setRateStr("");
    setCountStr("");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Calculadora de empréstimo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2 xs:col-span-1">
              <Label htmlFor="calc_amount">Valor emprestado</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
                  R$
                </span>
                <Input
                  id="calc_amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(formatBRLInput(e.target.value))}
                  placeholder="0,00"
                  className="pl-9 tabular-nums"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="space-y-1.5 col-span-2 xs:col-span-1">
              <Label htmlFor="calc_date">Data do empréstimo</Label>
              <Input
                id="calc_date"
                type="date"
                value={loanDate}
                onChange={(e) => setLoanDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="calc_rate">Juros ao mês (%)</Label>
              <Input
                id="calc_rate"
                type="text"
                inputMode="decimal"
                value={rateStr}
                onChange={(e) => setRateStr(e.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="ex: 3"
                className="tabular-nums"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="calc_count">Parcelas</Label>
              <Input
                id="calc_count"
                type="number"
                inputMode="numeric"
                min={1}
                value={countStr}
                onChange={(e) => setCountStr(e.target.value)}
                placeholder="ex: 10"
                className="tabular-nums"
                autoComplete="off"
              />
            </div>
          </div>

          {/* O resultado: os dois números que se pergunta, grandes. */}
          {ready ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl px-3 py-2.5 border bg-produmar-50 dark:bg-produmar-950/30 border-produmar-100 dark:border-produmar-900/40 min-w-0">
                  <p className="text-xs font-medium text-produmar-700 dark:text-produmar-400 mb-0.5">
                    Valor da parcela
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-produmar-800 dark:text-produmar-300">
                    {formatBRL(base)}
                  </p>
                  {last !== base && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                      última {formatBRL(last)}
                    </p>
                  )}
                </div>
                <div className="rounded-xl px-3 py-2.5 border bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/50 min-w-0">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-0.5">
                    Total com juros
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-amber-800 dark:text-amber-300">
                    {formatBRL(total)}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                    juros {formatBRL(interest)}
                  </p>
                </div>
              </div>

              {parcelas.length > 0 && (
                <div className="rounded-lg border border-slate-100 dark:border-slate-800">
                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {parcelas.map((p) => (
                      <div
                        key={p.number}
                        className="flex items-center justify-between px-3 py-1.5 text-xs"
                      >
                        <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                          {p.number}ª · {formatDate(p.due)}
                        </span>
                        <span className="font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                          {formatBRL(p.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Juros simples sobre o valor emprestado, uma parcela por mês a partir de um mês
                depois da data do empréstimo — a mesma conta da dívida. Nada aqui é lançado.
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Preencha o valor emprestado e a quantidade de parcelas para ver o resultado.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={limpar}>
            Limpar
          </Button>
          <Button type="button" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
