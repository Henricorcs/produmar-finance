"use client";

import { useEffect, useState, useTransition } from "react";
import { HandCoins, Undo2 } from "lucide-react";
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
import { actionError } from "@/lib/action-result";
import { cn, formatBRL, formatBRLInput, localDateISO, parseMoney } from "@/lib/utils";
import { nomeDoMes } from "@/lib/impressoras";
import { darBaixaFatura, desfazerBaixaFatura } from "@/app/(app)/impressoras/actions";
import { FOOTER_CANCEL, FOOTER_SUBMIT, STICKY_FOOTER } from "@/components/alugueis/alugueis-shared";
import { RENTAL_METHODS, type PrinterBilling } from "@/lib/types";

interface Props {
  billing: PrinterBilling | null;
  onClose: () => void;
  clientName: string;
}

/** A BAIXA DA FATURA — o cliente pagou. O valor vem com o total da fatura. */
export function BaixaFaturaDialog({ billing, onClose, clientName }: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [paidAt, setPaidAt] = useState(localDateISO());
  const [valor, setValor] = useState("");
  const [method, setMethod] = useState("");

  useEffect(() => {
    if (!billing) return;
    setErro(null);
    setPaidAt(billing.paid_at ?? localDateISO());
    setValor(formatBRLInput(Number(billing.paid_at ? billing.paid_amount : billing.total_amount)));
    setMethod(billing.method ?? "");
  }, [billing]);

  const falta = billing ? Number(billing.total_amount) - parseMoney(valor) : 0;

  function salvar() {
    if (!billing) return;
    setErro(null);
    startTransition(async () => {
      const falha = actionError(
        await darBaixaFatura(billing.id, {
          paid_at: paidAt,
          paid_amount: parseMoney(valor),
          method,
        })
      );
      if (falha) return setErro(falha);
      onClose();
    });
  }

  function desfazer() {
    if (!billing) return;
    if (!confirm("Desfazer a baixa? A fatura volta para a receber.")) return;
    startTransition(async () => {
      const falha = actionError(await desfazerBaixaFatura(billing.id));
      if (falha) return setErro(falha);
      onClose();
    });
  }

  return (
    <Dialog open={!!billing} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <HandCoins className="w-4 h-4 text-emerald-600" />
            Receber a fatura
          </DialogTitle>
        </DialogHeader>

        {billing && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {clientName} · <span className="capitalize">{nomeDoMes(billing.competencia)}</span> ·
              total {formatBRL(Number(billing.total_amount))}
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="bf_valor">Quanto pagou</Label>
              <Input
                id="bf_valor"
                value={valor}
                onChange={(e) => setValor(formatBRLInput(e.target.value))}
                inputMode="decimal"
                autoComplete="off"
                className="h-12 text-lg font-semibold tabular-nums"
              />
              {falta > 0.005 && (
                <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  Fica faltando {formatBRL(falta)} desta fatura.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bf_data">Dia do pagamento</Label>
              <Input
                id="bf_data"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className="tabular-nums"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Como pagou</Label>
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                {RENTAL_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(method === m ? "" : m)}
                    className={cn(
                      "flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors",
                      method === m
                        ? "bg-emerald-600 border-emerald-600 text-white"
                        : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {erro && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                {erro}
              </p>
            )}
          </div>
        )}

        <DialogFooter className={STICKY_FOOTER}>
          {billing?.paid_at && (
            <button
              type="button"
              onClick={desfazer}
              disabled={isPending}
              aria-label="Desfazer a baixa"
              className="h-11 px-4 rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40 sm:h-10"
            >
              <Undo2 className="w-4 h-4 inline" />
            </button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
            className={cn(FOOTER_CANCEL, "h-11 sm:h-10")}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={salvar}
            disabled={isPending}
            className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}
          >
            {isPending ? "Salvando..." : "Dar baixa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
