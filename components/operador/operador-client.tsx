"use client";

import { useState, useTransition } from "react";
import {
  Truck,
  Wrench,
  User,
  Building2,
  Loader2,
  CheckCircle2,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FinalizeOSDialog } from "./finalize-os-dialog";
import { updateServiceOrderStatus } from "@/app/(app)/operacoes/actions";
import { formatBRL } from "@/lib/utils";
import type { ServiceOrder, ServiceOrderItem, ServiceOrderStatus } from "@/lib/types";

type OrderWithDetails = ServiceOrder & {
  machines: { name: string; plate: string | null } | null;
  pickup_locations: { name: string } | null;
  service_order_items: ServiceOrderItem[];
};

interface Props {
  orders: OrderWithDetails[];
  operadorName: string;
}

const STATUS_LABEL: Record<ServiceOrderStatus, string> = {
  pendente:     "Pendente",
  em_andamento: "Em andamento",
  entregue:     "Entregue",
  cancelado:    "Cancelado",
};

const STATUS_STYLE: Record<ServiceOrderStatus, string> = {
  pendente:     "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400",
  em_andamento: "bg-produmar-100 dark:bg-produmar-900/40 text-produmar-700 dark:text-produmar-400",
  entregue:     "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400",
  cancelado:    "bg-slate-100 dark:bg-slate-800 text-slate-500",
};

export function OperadorClient({ orders: initialOrders, operadorName }: Props) {
  const [orders, setOrders] = useState(initialOrders);
  const [finalizeTarget, setFinalizeTarget] = useState<OrderWithDetails | null>(null);
  const [, startTransition] = useTransition();

  const pending     = orders.filter((o) => o.status === "pendente");
  const emAndamento = orders.filter((o) => o.status === "em_andamento");

  function handleFinalized(orderId: string) {
    // Remove a OS da lista local (já foi para "entregue")
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
  }

  async function handleIniciar(o: OrderWithDetails) {
    startTransition(async () => {
      await updateServiceOrderStatus(o.id, "em_andamento");
      setOrders((prev) =>
        prev.map((x) => (x.id === o.id ? { ...x, status: "em_andamento" } : x))
      );
    });
  }

  return (
    <div className="space-y-6 animate-fade-in">

      {/* Header */}
      <div>
        <h1 className="text-xl font-medium text-slate-800 dark:text-slate-100">
          Painel Operacional
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Olá, {operadorName.split(" ")[0]}. Aqui estão as ordens de serviço em aberto.
        </p>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50 rounded-xl p-4">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">Pendentes</p>
          <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-0.5 tabular-nums">
            {pending.length}
          </p>
        </div>
        <div className="bg-produmar-50 dark:bg-produmar-950/30 border border-produmar-100 dark:border-produmar-900/50 rounded-xl p-4">
          <p className="text-xs font-medium text-produmar-600 dark:text-produmar-400">Em andamento</p>
          <p className="text-2xl font-bold text-produmar-700 dark:text-produmar-400 mt-0.5 tabular-nums">
            {emAndamento.length}
          </p>
        </div>
      </div>

      {/* Empty state */}
      {orders.length === 0 && (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-7 h-7 text-emerald-500" />
            </div>
            <p className="font-medium text-slate-700 dark:text-slate-200">
              Tudo em dia!
            </p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              Não há ordens de serviço em aberto no momento.
            </p>
          </div>
        </Card>
      )}

      {/* Em andamento — priority section */}
      {emAndamento.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-produmar-700 dark:text-produmar-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Em andamento
          </h2>
          <div className="space-y-2">
            {emAndamento.map((o) => (
              <OSCard
                key={o.id}
                order={o}
                onIniciar={handleIniciar}
                onFinalizar={setFinalizeTarget}
              />
            ))}
          </div>
        </section>
      )}

      {/* Pendentes */}
      {pending.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            Pendentes
          </h2>
          <div className="space-y-2">
            {pending.map((o) => (
              <OSCard
                key={o.id}
                order={o}
                onIniciar={handleIniciar}
                onFinalizar={setFinalizeTarget}
              />
            ))}
          </div>
        </section>
      )}

      {/* Finalize dialog */}
      {finalizeTarget && (
        <FinalizeOSDialog
          order={finalizeTarget}
          open={!!finalizeTarget}
          onClose={() => setFinalizeTarget(null)}
          onFinalized={handleFinalized}
        />
      )}
    </div>
  );
}

// ── OS Card ───────────────────────────────────────────────────────────────────

function OSCard({
  order: o,
  onIniciar,
  onFinalizar,
}: {
  order: OrderWithDetails;
  onIniciar: (o: OrderWithDetails) => void;
  onFinalizar: (o: OrderWithDetails) => void;
}) {
  const isClient   = o.freight_type === "cliente";
  const isMaterial = o.type === "entrega_material";

  const itemSummary = o.service_order_items
    .slice(0, 3)
    .map((it) => `${it.quantity.toString().replace(".", ",")} ${it.unit ?? ""} ${it.description ?? ""}`.trim())
    .join(" · ");
  const moreItems = o.service_order_items.length > 3 ? ` +${o.service_order_items.length - 3} item(s)` : "";

  return (
    <div
      className={`rounded-xl border p-4 space-y-3 ${
        o.status === "em_andamento"
          ? "border-produmar-200 dark:border-produmar-800/60 bg-produmar-50/40 dark:bg-produmar-950/20"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
      }`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
              isClient
                ? "bg-emerald-100 dark:bg-emerald-950/50"
                : "bg-amber-100 dark:bg-amber-950/50"
            }`}
          >
            {isMaterial ? (
              <Truck
                className={`w-4 h-4 ${
                  isClient ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                }`}
              />
            ) : (
              <Wrench
                className={`w-4 h-4 ${
                  isClient ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                }`}
              />
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 tabular-nums">
                #{o.order_number}
              </span>
              <span
                className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${STATUS_STYLE[o.status]}`}
              >
                {STATUS_LABEL[o.status]}
              </span>
            </div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 leading-tight">
              {isClient ? (o.client_name ?? "Cliente") : "Consumo interno"}
            </p>
          </div>
        </div>
        <p
          className={`text-base font-bold tabular-nums flex-shrink-0 ${
            isClient
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-700 dark:text-amber-400"
          }`}
        >
          {formatBRL(o.total_amount)}
        </p>
      </div>

      {/* Details */}
      <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400 pl-11">
        {itemSummary && (
          <p>
            📦 {itemSummary}{moreItems}
          </p>
        )}
        {o.service_description && (
          <p>🔧 {o.service_description.slice(0, 80)}</p>
        )}
        {o.machines && (
          <p>
            🚛 {o.machines.name}
            {o.machines.plate ? ` (${o.machines.plate})` : ""}
          </p>
        )}
        {o.pickup_locations && (
          <p>📍 {o.pickup_locations.name}</p>
        )}
        {o.delivery_date && (
          <p>
            📅 Entrega:{" "}
            {new Date(o.delivery_date + "T12:00:00").toLocaleDateString("pt-BR")}
          </p>
        )}
        {o.notes && <p className="italic opacity-75">💬 {o.notes.slice(0, 60)}</p>}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pl-11">
        {o.status === "pendente" && (
          <Button
            size="sm"
            variant="outline"
            className="flex-1 border-produmar-200 text-produmar-700 hover:bg-produmar-50"
            onClick={() => onIniciar(o)}
          >
            <Loader2 className="w-3.5 h-3.5" />
            Iniciar
          </Button>
        )}
        <Button
          size="sm"
          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => onFinalizar(o)}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Finalizar OS
        </Button>
      </div>
    </div>
  );
}
