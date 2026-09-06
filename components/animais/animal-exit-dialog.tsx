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
import {
  cn,
  formatBRL,
  formatBRLInput,
  formatQty,
  localDateISO,
  parseMoney,
  upperKeepingCaret,
} from "@/lib/utils";
import { registerAnimalExit } from "@/app/(app)/animais/actions";
import {
  FOOTER_CANCEL,
  FOOTER_SUBMIT,
  STICKY_FOOTER,
  categoryLabel,
  formatDecimalInput,
  parseDecimal,
} from "./animal-shared";
import type { AnimalExitReason, AnimalSaleMode, AnimalWithInfo } from "@/lib/types";

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
  const [saleMode, setSaleMode] = useState<AnimalSaleMode>("unidade");
  const [exitDate, setExitDate] = useState("");
  const [amount, setAmount] = useState("");
  const [weight, setWeight] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [buyer, setBuyer] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason("venda");
    setSaleMode("unidade");
    setExitDate(localDateISO());
    setAmount("");
    // o peso da última pesagem já entra: quase sempre é o peso da venda, e
    // quem for pesar de novo na balança do comprador só corrige
    setWeight(
      animal && Number(animal.weight) > 0
        ? formatDecimalInput(String(Number(animal.weight)).replace(".", ","))
        : ""
    );
    setPricePerKg("");
    setBuyer("");
    setNotes("");
    setError(null);
  }, [open, animal]);

  const isSale = reason === "venda";
  const noPeso = isSale && saleMode === "peso";

  /**
   * O total da venda. No peso ele é a CONTA — peso × preço do quilo —, e não um
   * campo: quem lança digita os dois e vê o resultado, em vez de fazer a conta
   * no papel e digitar só o fim. O servidor refaz a mesma conta ao gravar.
   */
  const kg = parseDecimal(weight);
  const precoKg = parseMoney(pricePerKg);
  const value = noPeso ? kg * precoKg : parseMoney(amount);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!animal) return;
    if (noPeso) {
      if (kg <= 0) {
        setError("Informe o peso vendido");
        return;
      }
      if (precoKg <= 0) {
        setError("Informe o valor do quilo");
        return;
      }
    }
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
        sale_mode: isSale ? saleMode : null,
        sale_weight_kg: noPeso ? kg : 0,
        sale_price_per_kg: noPeso ? precoKg : 0,
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
              {/* Como o animal foi vendido — por cabeça ou por quilo */}
              <div className="space-y-1.5">
                <Label>Forma da venda *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { v: "unidade", label: "Na unidade", hint: "valor fechado" },
                      { v: "peso", label: "No peso", hint: "kg × valor do quilo" },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.v}
                      type="button"
                      onClick={() => setSaleMode(m.v)}
                      className={cn(
                        "min-h-[56px] rounded-xl border px-3 py-2 text-left transition-colors active:scale-[0.97]",
                        saleMode === m.v
                          ? "bg-emerald-50 border-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-700"
                          : "bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700"
                      )}
                    >
                      <span
                        className={cn(
                          "block text-sm font-semibold",
                          saleMode === m.v
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-slate-600 dark:text-slate-300"
                        )}
                      >
                        {m.label}
                      </span>
                      <span className="block text-[10px] text-slate-400">{m.hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              {noPeso ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="ex_kg">Peso vendido (kg) *</Label>
                      <Input
                        id="ex_kg"
                        value={weight}
                        onChange={(e) => setWeight(formatDecimalInput(e.target.value))}
                        placeholder="0"
                        className="h-11 text-base tabular-nums font-semibold sm:h-10"
                        inputMode="decimal"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="ex_kg_price">Valor do kg (R$) *</Label>
                      <Input
                        id="ex_kg_price"
                        value={pricePerKg}
                        onChange={(e) => setPricePerKg(formatBRLInput(e.target.value))}
                        placeholder="0,00"
                        className="h-11 text-base tabular-nums font-semibold sm:h-10"
                        inputMode="decimal"
                        autoComplete="off"
                      />
                    </div>
                  </div>

                  {/* A conta escrita do jeito que se fala */}
                  <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 px-3 py-2.5 space-y-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                        Total da venda
                      </span>
                      <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                        {formatBRL(value)}
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 tabular-nums">
                      {formatQty(kg)} kg × {formatBRL(precoKg)} = {formatBRL(value)}
                    </p>
                  </div>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    O total entra no financeiro na hora, como entrada já recebida na
                    categoria &quot;Venda de animais&quot;.
                  </p>
                </>
              ) : (
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
                  />
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    Entra no financeiro na hora, como entrada já recebida na categoria
                    &quot;Venda de animais&quot;.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="ex_buyer">Comprador</Label>
                <Input
                  id="ex_buyer"
                  value={buyer}
                  onChange={(e) => setBuyer(upperKeepingCaret(e))}
                  placeholder="opcional, quem levou o animal"
                  autoCapitalize="characters"
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
              onChange={(e) => setNotes(upperKeepingCaret(e))}
              placeholder={isSale ? "opcional" : "ex: picada de cobra"}
              rows={2}
              autoCapitalize="characters"
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
