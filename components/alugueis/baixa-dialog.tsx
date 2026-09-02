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
import { Textarea } from "@/components/ui/textarea";
import { actionError } from "@/lib/action-result";
import {
  cn,
  formatBRL,
  formatBRLInput,
  formatDate,
  localDateISO,
  parseMoney,
  upperKeepingCaret,
} from "@/lib/utils";
import { darBaixaAluguel, desfazerBaixaAluguel } from "@/app/(app)/alugueis/actions";
import { FOOTER_CANCEL, FOOTER_SUBMIT, STICKY_FOOTER } from "./alugueis-shared";
import { RENTAL_METHODS } from "@/lib/types";
import type { CobrancaDoMes } from "@/lib/alugueis";

interface Props {
  /** A cobrança tocada na lista — null fecha a caixa. */
  cobranca: CobrancaDoMes | null;
  onClose: () => void;
  /** "setembro de 2026" — o mês do aluguel. */
  mesLabel: string;
}

/**
 * A BAIXA DO ALUGUEL — o inquilino pagou.
 *
 * O valor já vem preenchido com o do contrato; se ele pagou a mais (multa) ou a
 * menos, é só corrigir aqui, e a tela mostra o que ficou faltando. Desfazer a
 * baixa devolve o mês para a lista de aberto.
 */
export function BaixaDialog({ cobranca, onClose, mesLabel }: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [paidAt, setPaidAt] = useState(localDateISO());
  const [paidAmount, setPaidAmount] = useState("");
  const [method, setMethod] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!cobranca) return;
    const p = cobranca.payment;
    setPaidAt(p?.paid_at ?? localDateISO());
    setPaidAmount(
      formatBRLInput(Number(p?.paid_at ? p.paid_amount : cobranca.amount) || 0)
    );
    setMethod(p?.method ?? "");
    setNotes(p?.notes ?? "");
    setErro(null);
  }, [cobranca]);

  const pago = parseMoney(paidAmount);
  const falta = cobranca ? Math.round((cobranca.amount - pago) * 100) / 100 : 0;

  function salvar() {
    if (!cobranca) return;
    setErro(null);
    if (pago <= 0) {
      setErro("Informe quanto o inquilino pagou");
      return;
    }
    startTransition(async () => {
      const falha = actionError(
        await darBaixaAluguel({
          contract_id: cobranca.contract.id,
          competencia: cobranca.competencia,
          due_date: cobranca.due_date,
          amount: cobranca.amount,
          paid_at: paidAt,
          paid_amount: pago,
          method,
          notes,
        })
      );
      if (falha) {
        setErro(falha);
        return;
      }
      onClose();
    });
  }

  function desfazer() {
    const id = cobranca?.payment?.id;
    if (!id) return;
    if (!confirm("Desfazer a baixa deste mês? Ele volta a aparecer como em aberto."))
      return;
    setErro(null);
    startTransition(async () => {
      const falha = actionError(await desfazerBaixaAluguel(id));
      if (falha) {
        setErro(falha);
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={!!cobranca} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
              <HandCoins className="w-4 h-4" />
            </span>
            Receber o aluguel
          </DialogTitle>
        </DialogHeader>

        {cobranca && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 px-3 py-2">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                {cobranca.contract.tenant_name}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                Imóvel nº {cobranca.contract.property_code} · aluguel de {mesLabel} ·
                vence {formatDate(cobranca.due_date)}
              </p>
              <p className="mt-1 text-base font-bold tabular-nums text-slate-800 dark:text-slate-100">
                {formatBRL(cobranca.amount)}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bx_valor">Quanto ele pagou (R$) *</Label>
              <Input
                id="bx_valor"
                value={paidAmount}
                onChange={(e) => setPaidAmount(formatBRLInput(e.target.value))}
                className="h-12 text-lg tabular-nums font-bold sm:h-11"
                inputMode="decimal"
                autoComplete="off"
              />
              {falta > 0.005 && (
                <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  Fica faltando {formatBRL(falta)} deste mês.
                </p>
              )}
              {falta < -0.005 && (
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Pagou {formatBRL(-falta)} a mais que o aluguel.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bx_data">Dia do pagamento</Label>
              <Input
                id="bx_data"
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className="h-11 tabular-nums sm:h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Como pagou</Label>
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
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

            <div className="space-y-1.5">
              <Label htmlFor="bx_obs">Observação</Label>
              <Textarea
                id="bx_obs"
                value={notes}
                onChange={(e) => setNotes(upperKeepingCaret(e))}
                placeholder="opcional"
                rows={2}
                className="uppercase placeholder:normal-case placeholder:lowercase"
              />
            </div>

            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              O recebimento fica aqui, no módulo Aluguéis — ele não vira lançamento no
              módulo Contas.
            </p>

            {erro && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                {erro}
              </p>
            )}
          </div>
        )}

        <DialogFooter className={STICKY_FOOTER}>
          {cobranca?.payment && (
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
