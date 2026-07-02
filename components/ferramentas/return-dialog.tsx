"use client";

import { useEffect, useState, useTransition } from "react";
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
import { returnTool } from "@/app/(app)/ferramentas/actions";
import { ConditionPicker } from "./tool-shared";
import type { ToolCondition } from "@/lib/types";

export interface ReturnTarget {
  loanId: string;
  toolName: string;
  borrower: string;
  /** Estado atual da ferramenta — vira o padrão do seletor. */
  condition: ToolCondition;
}

interface Props {
  open: boolean;
  onClose: () => void;
  target: ReturnTarget | null;
}

export function ReturnDialog({ open, onClose, target }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [condition, setCondition] = useState<ToolCondition>("bom");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setCondition(target?.condition ?? "bom");
    setNotes("");
    setError(null);
  }, [open, target]);

  if (!target) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const r = await returnTool({
        loan_id: target!.loanId,
        condition,
        notes,
      });
      if (r && "error" in r) setError(r.error ?? "Erro ao registrar devolução");
      else onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Devolução de ferramenta</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5 text-sm">
            <p className="font-semibold text-slate-800 dark:text-slate-100">{target.toolName}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Está com <span className="font-medium">{target.borrower}</span>
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Como voltou? (estado)</Label>
            <ConditionPicker value={condition} onChange={setCondition} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ret_notes">Observações</Label>
            <Input
              id="ret_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.toUpperCase())}
              placeholder="ex: faltando broca, cabo danificado"
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
              {isPending ? "Registrando..." : "Confirmar devolução"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
