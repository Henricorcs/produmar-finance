"use client";

import { useEffect, useState, useTransition } from "react";
import { HandCoins, Skull } from "lucide-react";
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
import { cn, formatBRLInput, localDateISO, parseMoney } from "@/lib/utils";
import { registerAnimalExit } from "@/app/(app)/animais/actions";
import {
  FOOTER_CANCEL,
  FOOTER_SUBMIT,
  STICKY_FOOTER,
  categoryLabel,
} from "./animal-shared";
import type { AnimalExitReason, AnimalWithInfo } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  animal: AnimalWithInfo | null;
}

/**
 * Baixa do animal: vendido ou morto. Nos dois casos ele sai do rebanho e some
 * da planilha — mas continua guardado, na aba Saídas, com o motivo e a data.
 *
 * Na VENDA o valor vai direto para o financeiro (entrada já recebida), sem
 * ninguém precisar lançar de novo em Contas.
 */
export function AnimalExitDialog({ open, onClose, animal }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [reason, setReason] = useState<AnimalExitReason>("venda");
  const [exitDate, setExitDate] = useState("");
  const [amount, setAmount] = useState("");
  const [buyer, setBuyer] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason("venda");
    setExitDate(localDateISO());
    setAmount("");
    setBuyer("");
    setNotes("");
    setError(null);
  }, [open]);

  const isSale = reason === "venda";
  const value = parseMoney(amount);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!animal) return;
    if (isSale && value <= 0) {
      setError("Informe o valor da venda");
      return;
    }

    startTransition(async () => {
      const r = await registerAnimalExit({
        animal_id: animal.id,
        reason,
        exit_date: exitDate || localDateISO(),
        amount: isSale ? value : 0,
        buyer: isSale ? buyer : null,
        notes,
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao dar baixa no animal");
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">
            Baixa do animal {animal?.tag ? `nº ${animal.tag}` : ""}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {animal && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {categoryLabel(animal.category, animal.sex, animal.species)}
              {animal.breed_name ? ` · ${animal.breed_name}` : ""} — sai do rebanho e some
              da planilha, mas continua guardado na aba Saídas.
            </p>
          )}

          {/* O que houve com o animal */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setReason("venda")}
              className={cn(
                "flex flex-col items-center justify-center gap-1 min-h-[64px] rounded-xl border text-sm font-medium transition-colors active:scale-[0.97]",
                isSale
                  ? "bg-emerald-600 border-emerald-600 text-white"
                  : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
              )}
            >
              <HandCoins className="w-5 h-5" />
              Vendido
            </button>
            <button
              type="button"
              onClick={() => setReason("morte")}
              className={cn(
                "flex flex-col items-center justify-center gap-1 min-h-[64px] rounded-xl border text-sm font-medium transition-colors active:scale-[0.97]",
                !isSale
                  ? "bg-slate-700 border-slate-700 text-white dark:bg-slate-600 dark:border-slate-600"
                  : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
              )}
            >
              <Skull className="w-5 h-5" />
              Morreu
            </button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ex_date">{isSale ? "Data da venda *" : "Data da morte *"}</Label>
            <Input
              id="ex_date"
              type="date"
              value={exitDate}
              onChange={(e) => setExitDate(e.target.value)}
              className="h-11 sm:h-10"
            />
          </div>

          {isSale && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="ex_amount">Valor da venda (R$) *</Label>
                <Input
                  id="ex_amount"
                  value={amount}
                  onChange={(e) => setAmount(formatBRLInput(e.target.value))}
                  placeholder="0,00"
                  className="h-11 text-base tabular-nums sm:h-10 sm:text-sm"
                  inputMode="decimal"
                  autoComplete="off"
                  autoFocus
                />
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Entra no financeiro na hora, como entrada já recebida na categoria
                  &quot;Venda de animais&quot;.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="ex_buyer">Comprador</Label>
                <Input
                  id="ex_buyer"
                  value={buyer}
                  onChange={(e) => setBuyer(e.target.value.toUpperCase())}
                  placeholder="opcional, quem levou o animal"
                  className="uppercase placeholder:normal-case placeholder:lowercase"
                  autoComplete="off"
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="ex_notes">{isSale ? "Observação" : "O que houve"}</Label>
            <Textarea
              id="ex_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.toUpperCase())}
              placeholder={isSale ? "opcional" : "ex: picada de cobra"}
              rows={2}
              className="uppercase placeholder:normal-case placeholder:lowercase"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <DialogFooter className={STICKY_FOOTER}>
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
              type="submit"
              disabled={isPending}
              className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}
            >
              {isPending
                ? "Salvando..."
                : isSale
                  ? "Registrar venda"
                  : "Registrar morte"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
