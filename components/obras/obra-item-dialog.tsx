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
import { formatBRL } from "@/lib/utils";
import { createObraItem, updateObraItem, type ObraItemInput } from "@/app/(app)/obras/actions";
import { OBRA_ITEM_UNITS, type ObraItem } from "@/lib/types";

// ── Helpers (espelham o diálogo de compra de material) ───────────────────────
function parseBRLToNumber(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}
function formatBRLInput(raw: string | number): string {
  let digits: string;
  if (typeof raw === "number") digits = String(Math.round(raw * 100));
  else digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const cents = parseInt(digits, 10);
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function formatQty(raw: string | number): string {
  if (typeof raw === "number") return raw.toString().replace(".", ",");
  const cleaned = raw.replace(/[^\d,]/g, "");
  const parts = cleaned.split(",");
  if (parts.length > 2) return parts[0] + "," + parts.slice(1).join("");
  if (parts[1]?.length > 3) return parts[0] + "," + parts[1].slice(0, 3);
  return cleaned;
}
function parseQty(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? 0 : n;
}
function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

interface Props {
  open: boolean;
  onClose: () => void;
  obraId: string;
  /** Item em edição — null lança um novo. */
  item: ObraItem | null;
}

export function ObraItemDialog({ open, onClose, obraId, item }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [itemDate, setItemDate] = useState(todayStr());
  const [product, setProduct] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("UNIDADE");
  const [unitPrice, setUnitPrice] = useState("");
  const [marketUnitPrice, setMarketUnitPrice] = useState("");

  useEffect(() => {
    if (!open) return;
    setItemDate(item?.item_date ?? todayStr());
    setProduct(item?.product ?? "");
    setQuantity(item ? formatQty(item.quantity) : "1");
    setUnit(item?.unit ?? "UNIDADE");
    setUnitPrice(item ? formatBRLInput(item.unit_price) : "");
    setMarketUnitPrice(item?.market_unit_price != null ? formatBRLInput(item.market_unit_price) : "");
    setError(null);
  }, [open, item]);

  const qty = parseQty(quantity);
  const price = parseBRLToNumber(unitPrice);
  const marketPrice = marketUnitPrice ? parseBRLToNumber(marketUnitPrice) : null;
  const total = qty * price;
  const marketTotal = marketPrice != null ? qty * marketPrice : null;
  const savings = marketTotal != null ? marketTotal - total : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!product.trim()) {
      setError("Informe o produto/descrição");
      return;
    }
    if (qty <= 0) {
      setError("Informe a quantidade");
      return;
    }

    startTransition(async () => {
      const input: ObraItemInput = {
        item_date: itemDate,
        product,
        quantity: qty,
        unit,
        unit_price: price,
        market_unit_price: marketPrice,
      };
      const r = item ? await updateObraItem(item.id, input) : await createObraItem(obraId, input);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
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
            {item ? "Editar item" : "Novo item"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="item_date">Data</Label>
              <Input
                id="item_date"
                type="date"
                value={itemDate}
                onChange={(e) => setItemDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item_unit">Unidade</Label>
              <Input
                id="item_unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value.toUpperCase())}
                list="obra-item-units"
                autoComplete="off"
              />
              <datalist id="obra-item-units">
                {OBRA_ITEM_UNITS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="item_product">Produto / descrição *</Label>
            <Input
              id="item_product"
              value={product}
              onChange={(e) => setProduct(e.target.value.toUpperCase())}
              placeholder="ex: tijolo, cimento, diária - gilvan"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="item_qty">Quantidade</Label>
              <Input
                id="item_qty"
                value={quantity}
                onChange={(e) => setQuantity(formatQty(e.target.value))}
                placeholder="0"
                inputMode="decimal"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item_unit_price">Valor unit. (R$)</Label>
              <Input
                id="item_unit_price"
                value={unitPrice}
                onChange={(e) => setUnitPrice(formatBRLInput(e.target.value))}
                placeholder="0,00"
                inputMode="decimal"
                autoComplete="off"
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="item_market_price">Valor de comércio (R$)</Label>
            <Input
              id="item_market_price"
              value={marketUnitPrice}
              onChange={(e) => setMarketUnitPrice(formatBRLInput(e.target.value))}
              placeholder="opcional, pra calcular a economia"
              inputMode="decimal"
              autoComplete="off"
              className="tabular-nums"
            />
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Valor total</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                {formatBRL(total)}
              </span>
            </div>
            {marketTotal != null && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Valor total de comércio</span>
                  <span className="text-slate-700 dark:text-slate-200 tabular-nums">
                    {formatBRL(marketTotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Economia</span>
                  <span
                    className={`font-semibold tabular-nums ${
                      (savings ?? 0) >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {formatBRL(savings ?? 0)}
                  </span>
                </div>
              </>
            )}
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
              {isPending ? "Salvando..." : item ? "Salvar" : "Lançar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
