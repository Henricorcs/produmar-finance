"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowUpFromLine, HardHat, Pencil, Trash2, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatBRL, formatQty } from "@/lib/utils";
import { deleteSupplyObra, getSupplyObraMovements } from "@/app/(app)/almoxarifado/actions";
import { fmtDateTime, num } from "./supply-shared";
import type { SupplyItemWithStock, SupplyObraUsage } from "@/lib/types";

/** Saída da obra — vem da consulta sob demanda, sem o limite da listagem. */
type ObraMovement = {
  id: string;
  item_id: string;
  quantity: number;
  person: string | null;
  destination: string | null;
  created_at: string;
  supply_items: { name: string; unit: string } | null;
};

interface Props {
  open: boolean;
  onClose: () => void;
  obra: SupplyObraUsage | null;
  /** Catálogo, para pegar o custo médio de cada material. */
  items: SupplyItemWithStock[];
  onNewSaida: (obra: SupplyObraUsage) => void;
  onEdit: (obra: SupplyObraUsage) => void;
}

export function ObraDetailDialog({ open, onClose, obra, items, onNewSaida, onEdit }: Props) {
  const [isPending, startTransition] = useTransition();
  const [movements, setMovements] = useState<ObraMovement[]>([]);
  const [loading, setLoading] = useState(false);

  // o consumo inteiro da obra, sem o teto da listagem da página
  const obraId = obra?.id ?? null;
  useEffect(() => {
    setMovements([]);
    if (!open || !obraId) return;
    let cancelled = false;
    setLoading(true);
    getSupplyObraMovements(obraId).then((r) => {
      if (cancelled) return;
      setLoading(false);
      if ("movements" in r) setMovements(r.movements as unknown as ObraMovement[]);
    });
    return () => {
      cancelled = true;
    };
  }, [open, obraId]);

  const costByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of items) map.set(i.id, i.avg_unit_cost != null ? num(i.avg_unit_cost) : 0);
    return map;
  }, [items]);

  /** Consumo somado por material — é o que interessa numa obra. */
  const byItem = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; unit: string; qty: number; value: number }
    >();
    for (const m of movements) {
      const key = m.item_id;
      const current = map.get(key) ?? {
        id: key,
        name: m.supply_items?.name ?? "—",
        unit: m.supply_items?.unit ?? "",
        qty: 0,
        value: 0,
      };
      const qty = num(m.quantity);
      current.qty += qty;
      current.value += qty * (costByItem.get(key) ?? 0);
      map.set(key, current);
    }
    return Array.from(map.values()).sort((a, b) => b.value - a.value || b.qty - a.qty);
  }, [movements, costByItem]);

  if (!obra) return null;

  function handleDelete() {
    const o = obra!;
    if (
      !confirm(
        `Excluir a obra "${o.name}"? As saídas já lançadas NÃO são apagadas — elas ficam sem obra.`
      )
    )
      return;
    startTransition(async () => {
      const r = await deleteSupplyObra(o.id);
      if (r && "error" in r) {
        alert(r.error);
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100 pr-8">{obra.name}</DialogTitle>
          {obra.client && <p className="text-[11px] text-slate-400">{obra.client}</p>}
        </DialogHeader>

        <div className="space-y-4">
          {/* Total consumido */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-center">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide">
              Material consumido
            </p>
            {/* números da view: não piscam zero enquanto as saídas carregam */}
            <p className="mt-1.5 text-3xl font-bold text-slate-800 dark:text-slate-100 tabular-nums leading-none">
              {formatBRL(num(obra.total_value))}
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {num(obra.items_count) === 1 ? "1 material" : `${num(obra.items_count)} materiais`} ·{" "}
              {num(obra.movements_count) === 1
                ? "1 saída"
                : `${num(obra.movements_count)} saídas`}
            </p>
          </div>

          <Button className="w-full" onClick={() => onNewSaida(obra)}>
            <ArrowUpFromLine className="w-4 h-4" />
            Lançar saída para esta obra
          </Button>

          {/* Consumo por material */}
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Consumo por material
            </p>
            {byItem.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-3 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
                {loading ? "Carregando..." : "Nenhum material saiu para esta obra ainda."}
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                {byItem.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {r.name}
                      </p>
                      <p className="text-[11px] text-slate-400 tabular-nums">
                        {formatQty(r.qty)} {r.unit}
                      </p>
                    </div>
                    {r.value > 0 && (
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums flex-shrink-0">
                        {formatBRL(r.value)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Saídas lançadas */}
          {movements.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Saídas lançadas
              </p>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 max-h-48 overflow-y-auto">
                {movements.slice(0, 40).map((m) => (
                  <div key={m.id} className="flex items-center gap-2.5 px-3 py-2">
                    <span className="w-1.5 h-8 rounded-full bg-red-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate tabular-nums">
                        {formatQty(num(m.quantity))} {m.supply_items?.unit ?? ""} ·{" "}
                        {m.supply_items?.name ?? "—"}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {fmtDateTime(m.created_at)}
                        {m.person ? ` · ${m.person}` : ""}
                        {m.destination ? ` · ${m.destination}` : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {obra.notes && (
            <p className="text-xs text-slate-500 dark:text-slate-400 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
              {obra.notes}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onEdit(obra)}>
              <Pencil className="w-4 h-4" />
              Editar
            </Button>
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="h-10 px-4 rounded-md border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors"
            >
              <Trash2 className="w-4 h-4 inline" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Card da obra na aba — nome, cliente e quanto de material já consumiu. */
export function ObraCard({
  obra,
  onOpen,
}: {
  obra: SupplyObraUsage;
  onOpen: () => void;
}) {
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 cursor-pointer transition-all hover:shadow-md hover:border-produmar-200 dark:hover:border-produmar-800 active:bg-slate-50 dark:active:bg-slate-800/60"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
          <HardHat className="w-4 h-4 text-orange-600 dark:text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
            {obra.name}
          </p>
          {obra.client && (
            <p className="text-[11px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
              <User className="w-3 h-3" />
              {obra.client}
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums leading-none">
            {formatBRL(num(obra.total_value))}
          </p>
          <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
            {num(obra.items_count)} {num(obra.items_count) === 1 ? "material" : "materiais"}
          </p>
        </div>
      </div>
    </div>
  );
}
