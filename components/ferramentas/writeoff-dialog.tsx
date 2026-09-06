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
import { writeOffTool } from "@/app/(app)/ferramentas/actions";
import type { ToolWithStatus } from "@/lib/types";
import { upperKeepingCaret } from "@/lib/utils";

const REASONS = ["QUEBRADO", "PERDIDO", "ROUBADO", "SUCATEADO"];

interface Props {
  open: boolean;
  onClose: () => void;
  tool: ToolWithStatus | null;
}

/** Inutilizar patrimônio: quantidade (máx = saldo) + motivo. */
export function WriteoffDialog({ open, onClose, tool }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuantity("1");
    setReason("");
    setError(null);
  }, [open]);

  if (!tool) return null;

  const maxQty = tool.available_qty;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const t = tool!;
    const qty = Math.max(1, Math.floor(Number(quantity) || 1));
    if (qty > maxQty) {
      setError(`Saldo insuficiente (disponível: ${maxQty})`);
      return;
    }

    startTransition(async () => {
      const r = await writeOffTool({ tool_id: t.id, quantity: qty, reason });
      if (r && "error" in r) setError(r.error ?? "Erro ao inutilizar");
      else onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Inutilizar patrimônio</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5 text-sm">
            <p className="font-semibold text-slate-800 dark:text-slate-100">{tool.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Saldo disponível: {maxQty} {tool.unit}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wo_quantity">Quantidade *</Label>
            <Input
              id="wo_quantity"
              type="number"
              min={1}
              max={maxQty}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="tabular-nums"
              inputMode="numeric"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wo_reason">Motivo</Label>
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    reason === r
                      ? "bg-produmar-600 border-produmar-600 text-white"
                      : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                  }`}
                >
                  {r.charAt(0) + r.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
            <Input
              id="wo_reason"
              value={reason}
              onChange={(e) => setReason(upperKeepingCaret(e))}
              placeholder="ou descreva o motivo (opcional)"
              autoCapitalize="characters"
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
            <Button
              type="submit"
              disabled={isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {isPending ? "Registrando..." : "Inutilizar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
