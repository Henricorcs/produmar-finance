"use client";

import { useEffect, useState, useTransition } from "react";
import { Settings2 } from "lucide-react";
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
import { formatMoneyInput, parseMoney } from "@/lib/utils";
import { createSupplyItem, updateSupplyItem } from "@/app/(app)/almoxarifado/actions";
import { UNIT_SUGGESTIONS, formatQtyInput, parseQty } from "./supply-shared";
import type { SupplyCategory, SupplyItem } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Item em edição — null cria um novo. */
  item: SupplyItem | null;
  categories: SupplyCategory[];
  /** Categoria que a tela está filtrando — já vem escolhida no cadastro. */
  defaultCategoryId?: string | null;
  onManageCategories: () => void;
}

export function ItemDialog({
  open,
  onClose,
  item,
  categories,
  defaultCategoryId,
  onManageCategories,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unit, setUnit] = useState("un");
  const [minQuantity, setMinQuantity] = useState("");
  const [location, setLocation] = useState("");
  const [initialQty, setInitialQty] = useState("");
  const [initialCost, setInitialCost] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? "");
    setCode(item?.code ?? "");
    setCategoryId(item?.category_id ?? defaultCategoryId ?? "");
    setUnit(item?.unit ?? "un");
    setMinQuantity(item && item.min_quantity ? String(item.min_quantity).replace(".", ",") : "");
    setLocation(item?.location ?? "");
    setInitialQty("");
    setInitialCost("");
    setError(null);
  }, [open, item, defaultCategoryId]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Informe o nome do item");
      return;
    }

    startTransition(async () => {
      const base = {
        name,
        code,
        category_id: categoryId || null,
        unit,
        min_quantity: parseQty(minQuantity),
        location,
      };
      const r = item
        ? await updateSupplyItem(item.id, base)
        : await createSupplyItem({
            ...base,
            initial_quantity: parseQty(initialQty),
            initial_unit_cost: parseMoney(initialCost),
          });
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
          <div className="space-y-1.5">
            <Label htmlFor="si_name">Nome *</Label>
            <Input
              id="si_name"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              placeholder="ex: cano 50mm, emenda ótica, cola pvc"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="si_unit">Unidade *</Label>
              <Input
                id="si_unit"
                list="supply-units"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="un"
                autoComplete="off"
              />
              <datalist id="supply-units">
                {UNIT_SUGGESTIONS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="si_min">Avisar em</Label>
              <Input
                id="si_min"
                value={minQuantity}
                onChange={(e) => setMinQuantity(formatQtyInput(e.target.value))}
                placeholder="0"
                inputMode="decimal"
                className="tabular-nums"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="si_category">Categoria</Label>
              <button
                type="button"
                onClick={onManageCategories}
                className="flex items-center gap-1 text-[11px] font-medium text-produmar-600 dark:text-produmar-400 hover:underline"
              >
                <Settings2 className="w-3 h-3" />
                Gerenciar
              </button>
            </div>
            <select
              id="si_category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full h-11 text-base rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-slate-800 dark:text-slate-100 sm:h-10 sm:text-sm"
            >
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="si_code">Código</Label>
              <Input
                id="si_code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="opcional"
                className="uppercase placeholder:normal-case placeholder:lowercase"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="si_location">Onde fica</Label>
              <Input
                id="si_location"
                value={location}
                onChange={(e) => setLocation(e.target.value.toUpperCase())}
                placeholder="prateleira 3"
                className="uppercase placeholder:normal-case placeholder:lowercase"
                autoComplete="off"
              />
            </div>
          </div>

          {/* Só no cadastro: o saldo de partida vira a primeira entrada */}
          {!item && (
            <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-produmar-50/40 dark:bg-slate-800/40 border border-produmar-100 dark:border-slate-700">
              <div className="space-y-1.5">
                <Label htmlFor="si_initial">Quantidade em estoque</Label>
                <Input
                  id="si_initial"
                  value={initialQty}
                  onChange={(e) => setInitialQty(formatQtyInput(e.target.value))}
                  placeholder="0"
                  inputMode="decimal"
                  className="tabular-nums"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="si_initial_cost">Custo por {unit || "un"} (R$)</Label>
                <Input
                  id="si_initial_cost"
                  value={initialCost}
                  onChange={(e) => setInitialCost(formatMoneyInput(e.target.value))}
                  placeholder="0,00"
                  inputMode="decimal"
                  className="tabular-nums"
                  autoComplete="off"
                />
              </div>
            </div>
          )}

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
              {isPending ? "Salvando..." : item ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
