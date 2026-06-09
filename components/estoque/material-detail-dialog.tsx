"use client";

import { Mountain, Boxes } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBRL } from "@/lib/utils";
import type { ProductStockBalance } from "@/lib/types";
import type { MaterialByJazida } from "./estoque-page-client";

interface Props {
  open: boolean;
  onClose: () => void;
  material: ProductStockBalance | null;
  jazidas: MaterialByJazida[];
}

function fmtQty(n: number): string {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

export function MaterialDetailDialog({ open, onClose, material, jazidas }: Props) {
  if (!material) return null;

  const low = Number(material.current_quantity) <= 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100 flex items-center gap-2">
            <Boxes className="w-4 h-4" /> {material.name}
          </DialogTitle>
        </DialogHeader>

        {/* Saldo atual */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 p-4 text-center">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Saldo atual
          </p>
          <p
            className={`mt-1 text-3xl font-black tabular-nums ${
              low ? "text-red-500" : "text-produmar-700 dark:text-produmar-400"
            }`}
          >
            {fmtQty(material.current_quantity)}{" "}
            <span className="text-base font-medium text-slate-400">{material.unit}</span>
          </p>
          {material.avg_unit_cost != null && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Custo médio {formatBRL(Number(material.avg_unit_cost))} / {material.unit}
            </p>
          )}
        </div>

        {/* Por jazida */}
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
            <Mountain className="w-3.5 h-3.5" /> Comprado por jazida
          </p>

          {jazidas.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 py-2">
              Ainda não há compras deste material registradas.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              {jazidas.map((j) => (
                <div key={j.name} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                      {j.name}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                      {fmtQty(j.qty)} {material.unit} comprado · {formatBRL(j.value)}
                    </p>
                  </div>
                  {j.debt > 0 ? (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 flex-shrink-0">
                      devendo {formatBRL(j.debt)}
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 flex-shrink-0">
                      em dia
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-slate-400 dark:text-slate-500">
            O “devendo” é o saldo total em aberto com a jazida (todas as compras).
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
