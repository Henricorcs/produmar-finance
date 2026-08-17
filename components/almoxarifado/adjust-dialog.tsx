"use client";

import { useEffect, useState, useTransition } from "react";
import { ClipboardCheck } from "lucide-react";
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
import { formatQty } from "@/lib/utils";
import { adjustSupplyStock } from "@/app/(app)/almoxarifado/actions";
import { formatQtyInput, parseQty } from "./supply-shared";
import type { SupplyItemWithStock } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Item sendo conferido. */
  item: SupplyItemWithStock | null;
}

/**
 * Contagem de prateleira: o usuário digita o que CONTOU e o sistema grava a
 * diferença como ajuste. Ninguém precisa calcular quanto sobrou ou faltou.
 */
export function AdjustDialog({ open, onClose, item }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setCounted("");
    setNotes("");
    setError(null);
  }, [open, item]);

  if (!item) return null;

  const countedQty = parseQty(counted);
  const diff = counted.trim() ? countedQty - item.current_quantity : 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!counted.trim()) {
      setError("Informe quanto você contou");
      return;
    }

    startTransition(async () => {
      const r = await adjustSupplyStock({
        item_id: item!.id,
        counted_quantity: countedQty,
        notes,
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao ajustar");
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center">
              <ClipboardCheck className="w-4 h-4" />
            </span>
            Conferir estoque
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2.5">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
              {item.name}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
              Sistema diz: {formatQty(item.current_quantity)} {item.unit}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="aj_counted">Quanto tem de verdade ({item.unit}) *</Label>
            <Input
              id="aj_counted"
              value={counted}
              onChange={(e) => setCounted(formatQtyInput(e.target.value))}
              placeholder="0"
              inputMode="decimal"
              className="tabular-nums text-lg font-semibold"
              autoComplete="off"
              autoFocus
            />
            {diff !== 0 && (
              <p
                className={`text-xs font-medium tabular-nums ${
                  diff > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {diff > 0 ? "Sobrando" : "Faltando"} {formatQty(Math.abs(diff))} {item.unit}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="aj_notes">Motivo</Label>
            <Input
              id="aj_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.toUpperCase())}
              placeholder="quebra, perda, contagem (opcional)"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Ajustando..." : "Acertar saldo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
