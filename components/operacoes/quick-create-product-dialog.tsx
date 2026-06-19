"use client";

import { useState, useTransition, useEffect } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProduct } from "@/app/(app)/operacoes/actions";
import { PRODUCT_UNITS, type Product } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (p: Product) => void;
}

export function QuickCreateProductDialog({ open, onClose, onCreated }: Props) {
  const [name, setName]   = useState("");
  const [unit, setUnit]   = useState("carrada");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (open) { setName(""); setUnit("carrada"); setPrice(""); setError(null); }
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Nome é obrigatório");

    const default_price = price.trim()
      ? parseFloat(price.replace(/\./g, "").replace(",", "."))
      : null;

    startTransition(async () => {
      const r = await createProduct({ name, unit, default_price });
      if ("error" in r) setError(r.error);
      else { onCreated(r.product); onClose(); }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Novo produto</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="prd_name">Nome *</Label>
            <Input
              id="prd_name"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              placeholder="ex: areia média"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoCapitalize="characters"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prd_unit">Unidade</Label>
              <select
                id="prd_unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-produmar-500"
              >
                {PRODUCT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prd_price">Valor (R$)</Label>
              <Input
                id="prd_price"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Criando…" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
