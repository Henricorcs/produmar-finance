"use client";

import { useEffect, useState } from "react";
import {
  Mountain,
  MapPin,
  Calendar,
  Package,
  Loader2,
  ChevronRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getJazidaDeliveries, type JazidaDeliveryRow } from "@/app/(app)/estoque/actions";
import { formatBRL, osStatusLabel, osTypeLabel } from "@/lib/utils";
import type { ServiceOrderStatus, ServiceOrderType } from "@/lib/types";

export type JazidaReportTarget = {
  id: string;
  name: string;
  materials: { name: string; unit: string; qty: number; value: number }[];
  totalValue: number;
  debt: number;
};

interface Props {
  jazida: JazidaReportTarget | null;
  open: boolean;
  onClose: () => void;
}

function fmtQty(n: number): string {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return d && m && y ? `${d}/${m}/${y}` : s;
}

export function JazidaReportDialog({ jazida, open, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [deliveries, setDeliveries] = useState<JazidaDeliveryRow[]>([]);

  useEffect(() => {
    if (!open || !jazida) return;
    let active = true;
    setLoading(true);
    setDeliveries([]);
    getJazidaDeliveries(jazida.id).then((res) => {
      if (active) {
        setDeliveries(res.deliveries);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [open, jazida]);

  if (!jazida) return null;

  const entregues = deliveries.filter((d) => d.status === "entregue").length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <Mountain className="w-5 h-5 text-produmar-600 dark:text-produmar-400 flex-shrink-0" />
            <span className="truncate">{jazida.name}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Resumo de compras da jazida */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Material comprado
            </span>
            {jazida.debt > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                devendo {formatBRL(jazida.debt)}
              </span>
            )}
          </div>
          {jazida.materials.length > 0 ? (
            <ul className="space-y-1">
              {jazida.materials.map((m) => (
                <li key={m.name} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-700 dark:text-slate-200 truncate">
                    <span className="font-semibold tabular-nums">
                      {fmtQty(m.qty)} {m.unit}
                    </span>{" "}
                    · {m.name}
                  </span>
                  <span className="text-xs text-slate-400 tabular-nums flex-shrink-0">
                    {formatBRL(m.value)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400">Nenhuma compra registrada.</p>
          )}
          <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/70 flex items-center justify-between text-xs">
            <span className="text-slate-400">Total comprado</span>
            <span className="font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
              {formatBRL(jazida.totalValue)}
            </span>
          </div>
        </div>

        {/* OS que retiraram material desta jazida */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Entregas / Ordens de serviço
            </span>
            {!loading && (
              <span className="text-[11px] text-slate-400 tabular-nums">
                {deliveries.length} {deliveries.length === 1 ? "OS" : "OS"} · {entregues} entregue(s)
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : deliveries.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">
              Nenhuma OS retirou material desta jazida ainda.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {deliveries.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => window.open(`/imprimir/os/${o.id}`, "_blank")}
                  title="Ver detalhes da OS"
                  className="w-full text-left py-2.5 px-1 rounded-lg active:bg-slate-100/70 dark:active:bg-slate-800/60 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-produmar-700 dark:text-produmar-400 tabular-nums flex-shrink-0">
                        #{o.order_number}
                      </span>
                      <span className="text-sm text-slate-700 dark:text-slate-200 truncate">
                        {o.client_name || o.service_description || osTypeLabel(o.type as ServiceOrderType)}
                      </span>
                    </div>
                    <span className="flex items-center gap-1 flex-shrink-0">
                      {o.total_amount > 0 && (
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                          {formatBRL(o.total_amount)}
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="font-medium px-1.5 py-0.5 rounded bg-produmar-50 dark:bg-slate-800 text-produmar-600 dark:text-produmar-400">
                      {osTypeLabel(o.type as ServiceOrderType)}
                    </span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Calendar className="w-3.5 h-3.5" />
                      {fmtDate(o.delivery_date ?? o.issue_date)}
                    </span>
                    <span>{osStatusLabel(o.status as ServiceOrderStatus, o.type as ServiceOrderType)}</span>
                  </div>
                  {o.delivery_address && (
                    <div className="mt-1 flex items-start gap-1.5 text-[12px] text-slate-600 dark:text-slate-300">
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-slate-400" />
                      <span className="break-words">{o.delivery_address}</span>
                    </div>
                  )}
                  {o.items.length > 0 && (
                    <div className="mt-1 flex items-start gap-1.5 text-[12px] text-slate-500 dark:text-slate-400">
                      <Package className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span className="break-words">
                        {o.items
                          .map((it) => `${fmtQty(it.quantity)} ${it.unit ?? ""} ${it.name}`.trim())
                          .join(" · ")}
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
