"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Truck,
  Wrench,
  Loader2,
  CheckCircle2,
  ClipboardList,
  Calendar,
  MapPin,
  Navigation,
  User,
  Phone,
  Package,
  Clock,
  PlayCircle,
  PlusCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FinalizeOSDialog } from "./finalize-os-dialog";
import { LancarServicoDialog } from "./lancar-servico-dialog";
import { updateServiceOrderStatus } from "@/app/(app)/operacoes/actions";
import { osStatusLabel } from "@/lib/utils";
import type { ServiceOrder, ServiceOrderItem, ServiceOrderStatus } from "@/lib/types";

type OrderWithDetails = ServiceOrder & {
  machines: { name: string; plate: string | null; tracking_type?: string | null } | null;
  pickup_locations: { name: string } | null;
  service_order_items: (ServiceOrderItem & { products: { name: string } | null })[];
};

interface Props {
  orders: OrderWithDetails[];
  operadorName: string;
  machines: { id: string; name: string; plate: string | null }[];
  recentClients: string[];
}

const STATUS_STYLE: Record<ServiceOrderStatus, string> = {
  pendente:     "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400",
  em_andamento: "bg-produmar-100 dark:bg-produmar-900/40 text-produmar-700 dark:text-produmar-400",
  entregue:     "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400",
  cancelado:    "bg-slate-100 dark:bg-slate-800 text-slate-500",
};

function fmtQty(n: number): string {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

export function OperadorClient({
  orders: initialOrders,
  operadorName,
  machines,
  recentClients,
}: Props) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [finalizeTarget, setFinalizeTarget] = useState<OrderWithDetails | null>(null);
  const [lancarOpen, setLancarOpen] = useState(false);
  const [, startTransition] = useTransition();

  // Reconcilia o estado local com os dados do servidor (após revalidação/refresh).
  useEffect(() => setOrders(initialOrders), [initialOrders]);

  const pending     = orders.filter((o) => o.status === "pendente");
  const emAndamento = orders.filter((o) => o.status === "em_andamento");

  function handleFinalized(orderId: string) {
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
          Minhas tarefas
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Olá, {operadorName.split(" ")[0]}! Veja abaixo o que precisa ser feito.
        </p>
      </div>

      {/* Botão grande: técnico lança o próprio serviço */}
      <button
        type="button"
        onClick={() => setLancarOpen(true)}
        className="w-full flex items-center justify-center gap-3 rounded-2xl bg-produmar-600 hover:bg-produmar-700 active:scale-[0.99] text-white font-bold text-xl h-20 shadow-lg shadow-produmar-600/25 transition-all"
      >
        <PlusCircle className="w-8 h-8" />
        Lançar serviço
      </button>

      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50 rounded-xl p-4">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">A fazer</p>
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
            <p className="font-medium text-slate-700 dark:text-slate-200">Tudo em dia!</p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              Você não tem nenhuma tarefa em aberto agora.
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
          <div className="space-y-3">
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
            A fazer
          </h2>
          <div className="space-y-3">
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

      {/* Lançar serviço (técnico) */}
      <LancarServicoDialog
        open={lancarOpen}
        onClose={() => setLancarOpen(false)}
        machines={machines}
        recentClients={recentClients}
        operadorName={operadorName}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}

// ── Linha de informação ─────────────────────────────────────────────────────
function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <span className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {label}
        </span>
        <div className="text-sm font-medium text-slate-700 dark:text-slate-200 break-words leading-snug">
          {children}
        </div>
      </div>
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

  // Título: serviço (notes) → descrição → cliente → tipo
  const title =
    o.notes?.trim() ||
    o.service_description?.trim() ||
    (isClient ? o.client_name?.trim() : "") ||
    (isMaterial ? "Entrega de material" : "Prestação de serviço");

  const materials = o.service_order_items
    .filter((it) => it.product_id || it.description)
    .map(
      (it) =>
        `${fmtQty(it.quantity)} ${it.unit ?? ""} ${
          it.products?.name ?? it.description ?? ""
        }`.trim()
    )
    .filter(Boolean);

  const dateStr = o.delivery_date
    ? new Date(o.delivery_date + "T12:00:00").toLocaleDateString("pt-BR")
    : new Date(o.issue_date + "T12:00:00").toLocaleDateString("pt-BR");

  const isHourmeter =
    o.type === "prestacao_servico" && o.hourmeter_start != null;

  return (
    <div
      className={`rounded-2xl border p-4 space-y-4 ${
        o.status === "em_andamento"
          ? "border-produmar-200 dark:border-produmar-800/60 bg-produmar-50/40 dark:bg-produmar-950/20"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
      }`}
    >
      {/* Cabeçalho: ícone + título + data/status */}
      <div className="flex items-start gap-3">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isClient
              ? "bg-emerald-100 dark:bg-emerald-950/50"
              : "bg-amber-100 dark:bg-amber-950/50"
          }`}
        >
          {isMaterial ? (
            <Truck className={`w-6 h-6 ${isClient ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`} />
          ) : (
            <Wrench className={`w-6 h-6 ${isClient ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2 break-words">
            {title}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="inline-flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 tabular-nums">
              <Calendar className="w-4 h-4 flex-shrink-0" />
              {dateStr}
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[o.status]}`}>
              {osStatusLabel(o.status, o.type)}
            </span>
          </div>
        </div>
      </div>

      {/* Informações operacionais */}
      <div className="space-y-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 p-3">
        {isClient && o.client_name && (
          <InfoRow icon={User} label="Cliente">
            {o.client_name}
            {o.client_phone && (
              <a
                href={`tel:${o.client_phone.replace(/\D/g, "")}`}
                className="ml-2 inline-flex items-center gap-1 text-produmar-600 dark:text-produmar-400 font-semibold"
              >
                <Phone className="w-3.5 h-3.5" />
                {o.client_phone}
              </a>
            )}
          </InfoRow>
        )}

        {isMaterial && materials.length > 0 && (
          <InfoRow icon={Package} label="Material">
            <ul className="space-y-0.5">
              {materials.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </InfoRow>
        )}

        {!isMaterial && o.service_description && (
          <InfoRow icon={Wrench} label="Serviço">
            {o.service_description}
          </InfoRow>
        )}

        {o.machines && (
          <InfoRow icon={Truck} label="Máquina / veículo">
            {o.machines.name}
            {o.machines.plate ? ` — ${o.machines.plate}` : ""}
          </InfoRow>
        )}

        {isMaterial && o.pickup_locations && (
          <InfoRow icon={MapPin} label="Retirar em">
            {o.pickup_locations.name}
          </InfoRow>
        )}

        {o.delivery_address && (
          <InfoRow icon={Navigation} label={isMaterial ? "Entregar em" : "Local do serviço"}>
            {o.delivery_address}
          </InfoRow>
        )}

        {isHourmeter && (
          <InfoRow icon={Clock} label="Horímetro inicial">
            <span className="tabular-nums">
              {o.hourmeter_start?.toString().replace(".", ",")} h
            </span>
          </InfoRow>
        )}
      </div>

      {/* Instrução curta */}
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center">
        {o.status === "pendente"
          ? "Toque em Iniciar quando começar este serviço."
          : "Terminou? Toque em Finalizar para encerrar."}
      </p>

      {/* Botões grandes p/ toque */}
      <div className="flex gap-3">
        {o.status === "pendente" && (
          <Button
            variant="outline"
            className="flex-1 h-14 text-base font-semibold border-produmar-200 text-produmar-700 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-produmar-950/30"
            onClick={() => onIniciar(o)}
          >
            <PlayCircle className="w-5 h-5" />
            Iniciar
          </Button>
        )}
        <Button
          className="flex-1 h-14 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => onFinalizar(o)}
        >
          <CheckCircle2 className="w-5 h-5" />
          Finalizar
        </Button>
      </div>
    </div>
  );
}
