"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Minus } from "lucide-react";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { createStockAdjustment } from "@/app/(app)/estoque/actions";
import type { Product } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  products: Product[];
}

function parseQty(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? 0 : n;
}
function formatQty(raw: string): string {
  const cleaned = raw.replace(/[^\d,]/g, "");
  const parts = cleaned.split(",");
  if (parts.length > 2) return parts[0] + "," + parts.slice(1).join("");
  if (parts[1]?.length > 3) return parts[0] + "," + parts[1].slice(0, 3);
  return cleaned;
}

export function AdjustmentDialog({ open, onClose, products }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [productId, setProductId] = useState("");
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setProductId("");
    setDirection("add");
    setQuantity("");
    setNotes("");
    setError(null);
  }, [open]);

  const selectedProduct = products.find((p) => p.id === productId) ?? null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!productId) {
      setError("Selecione um material");
      return;
    }
    const qty = parseQty(quantity);
    if (qty <= 0) {
      setError("Informe uma quantidade maior que zero");
      return;
    }

    const signed = direction === "add" ? qty : -qty;

    startTransition(async () => {
      const r = await createStockAdjustment({
        product_id: productId,
        quantity: signed,
        unit: selectedProduct?.unit ?? null,
        notes: notes.trim() || (direction === "add" ? "Ajuste — entrada" : "Ajuste — saída"),
      });
      if (r && "error" in r) setError(r.error ?? "Erro ao salvar");
      else onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Ajuste manual de estoque</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Use para definir o saldo inicial, corrigir contagens ou registrar perdas. Não
            mexe no financeiro.
          </p>

          <div className="space-y-1.5">
            <Label>Material *</Label>
            <SearchableSelect
              items={products}
              value={productId}
              onChange={setProductId}
              getId={(p) => p.id}
              getLabel={(p) => p.name}
              renderItem={(p) => (
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="truncate">{p.name}</span>
                  <span className="text-[10px] text-slate-400 flex-shrink-0">{p.unit}</span>
                </div>
              )}
              placeholder="Selecione o material..."
              searchPlaceholder="Buscar material..."
              emptyMessage="Nenhum material"
            />
          </div>

          {/* Direção */}
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { v: "add", label: "Adicionar", icon: Plus },
                { v: "remove", label: "Remover", icon: Minus },
              ] as const
            ).map(({ v, label, icon: Icon }) => (
              <button
                key={v}
                type="button"
                onClick={() => setDirection(v)}
                className={`flex items-center justify-center gap-1.5 py-2 text-sm rounded-lg border font-medium transition-colors ${
                  direction === v
                    ? v === "add"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-700/50 dark:text-emerald-400"
                      : "bg-red-50 border-red-200 text-red-600 dark:bg-red-950/30 dark:border-red-700/50 dark:text-red-400"
                    : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adj_qty">
              Quantidade * {selectedProduct ? `(${selectedProduct.unit})` : ""}
            </Label>
            <Input
              id="adj_qty"
              value={quantity}
              onChange={(e) => setQuantity(formatQty(e.target.value))}
              placeholder="0"
              inputMode="decimal"
              autoComplete="off"
              className="tabular-nums"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adj_notes">Motivo</Label>
            <Input
              id="adj_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.toUpperCase())}
              placeholder="ex: saldo inicial, perda, contagem"
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
              {isPending ? "Salvando..." : "Salvar ajuste"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
