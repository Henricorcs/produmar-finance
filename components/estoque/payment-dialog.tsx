"use client";

import { useEffect, useState, useTransition } from "react";
import { Wallet } from "lucide-react";
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
import { payMaterialPurchase } from "@/app/(app)/estoque/actions";
import { formatBRL, formatBRLInput } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  purchaseId: string;
  purchaseNumber: number;
  jazidaName: string;
  remaining: number;
}

function parseBRLToNumber(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

export function PaymentDialog({
  open,
  onClose,
  purchaseId,
  purchaseNumber,
  jazidaName,
  remaining,
}: Props) {
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setAmount(formatBRLInput(remaining));
      setError(null);
    }
  }, [open, remaining]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = parseBRLToNumber(amount);
    if (value <= 0) {
      setError("Informe um valor maior que zero");
      return;
    }
    setError(null);
    startTransition(async () => {
      const r = await payMaterialPurchase(purchaseId, value);
      if (r && "error" in r) setError(r.error ?? "Erro ao registrar pagamento");
      else onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100 flex items-center gap-2">
            <Wallet className="w-4 h-4" /> Pagar compra #{purchaseNumber}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3 text-sm space-y-1">
            <p className="text-slate-600 dark:text-slate-300">{jazidaName}</p>
            <p className="text-slate-500 dark:text-slate-400">
              Saldo devedor:{" "}
              <span className="font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                {formatBRL(remaining)}
              </span>
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay_amount">Valor do pagamento</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">R$</span>
              <Input
                id="pay_amount"
                value={amount}
                onChange={(e) => setAmount(formatBRLInput(e.target.value))}
                placeholder="0,00"
                inputMode="decimal"
                autoComplete="off"
                className="pl-9 h-12 text-lg tabular-nums"
              />
            </div>
            <button
              type="button"
              onClick={() => setAmount(formatBRLInput(remaining))}
              className="text-xs text-produmar-600 dark:text-produmar-400 font-medium"
            >
              Quitar tudo ({formatBRL(remaining)})
            </button>
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
            <Button type="submit" disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700">
              {isPending ? "Salvando..." : "Registrar pagamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
