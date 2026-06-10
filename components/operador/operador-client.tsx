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
  Gauge,
  Route,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FinalizeOSDialog } from "./finalize-os-dialog";
import { StartOSDialog } from "./start-os-dialog";
import { updateServiceOrderStatus } from "@/app/(app)/operacoes/actions";
import { osStatusLabel } from "@/lib/utils";
import type {
  ServiceBillingMode,
  ServiceOrder,
  ServiceOrderItem,
  ServiceOrderStatus,
} from "@/lib/types";

type OrderWithDetails = ServiceOrder & {
  machines: { name: string; plate: string | null; tracking_type?: string | null } | null;
  pickup_locations: { name: string } | null;
  service_order_items: (ServiceOrderItem & { products: { name: string } | null })[];
};

interface Props {
  orders: OrderWithDetails[];
  operadorName: string;
}

const STATUS_STYLE: Record<ServiceOrderStatus, string> = {
  pendente:     "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400",
  em_andamento: "bg-produmar-100 dark:bg-produmar-900/40 text-produmar-700 dark:text-produmar-400",
  entregue:     "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400",
  cancelado:    "bg-slate-100 dark:bg-slate-800 text-slate-500",
};

// Badge do modo de cobrança — cores fortes e distintas (baixa visão)
const BILLING_BADGE: Record<ServiceBillingMode, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  className: string;
}> = {
  viagem: {
    label: "POR VIAGEM",
    icon: Route,
    className: "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800",
  },
  km: {
    label: "POR KM",
    icon: Gauge,
    className: "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800",
  },
  diaria: {
    label: "POR DIÁRIA",
    icon: CalendarDays,
    className: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800",
  },
};

function fmtQty(n: number): string {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function fmtKm(n: number): string {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export function OperadorClient({ orders: initialOrders, operadorName }: Props) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [finalizeTarget, setFinalizeTarget] = useState<OrderWithDetails | null>(null);
  const [startTarget, setStartTarget] = useState<OrderWithDetails | null>(null);
  const [, startTransition] = useTransition();

  // Reconcilia o estado local com os dados do servidor (após revalidação/refresh).
  useEffect(() => setOrders(initialOrders), [initialOrders]);

  const pending     = orders.filter((o) => o.status === "pendente");
  const emAndamento = orders.filter((o) => o.status === "em_andamento");

  function handleFinalized(orderId: string) {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
  }

  function markStarted(orderId: string) {
    setOrders((prev) =>
      prev.map((x) => (x.id === orderId ? { ...x, status: "em_andamento" } : x))
    );
    // Recarrega para trazer km/hora gravados no banco
    router.refresh();
  }

  async function handleIniciar(o: OrderWithDetails) {
    // Viagem e diária começam anotando km + hora; km e OS antigas são 1 toque.
    const needsStartData =
      o.type === "entrega_material" &&
      (o.billing_mode === "viagem" || o.billing_mode === "diaria");
    if (needsStartData) {
      setStartTarget(o);
      return;
    }
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
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Minhas tarefas
        </h1>
        <p className="text-base text-slate-500 dark:text-slate-400">
          Olá, {operadorName.split(" ")[0]}! Veja abaixo o que precisa ser feito.
        </p>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-200 dark:border-amber-900/50 rounded-2xl p-4">
          <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">A fazer</p>
          <p className="text-3xl font-black text-amber-700 dark:text-amber-400 mt-0.5 tabular-nums">
            {pending.length}
          </p>
        </div>
        <div className="bg-produmar-50 dark:bg-produmar-950/30 border-2 border-produmar-200 dark:border-produmar-900/50 rounded-2xl p-4">
          <p className="text-sm font-semibold text-produmar-600 dark:text-produmar-400">Em andamento</p>
          <p className="text-3xl font-black text-produmar-700 dark:text-produmar-400 mt-0.5 tabular-nums">
            {emAndamento.length}
          </p>
        </div>
      </div>

      {/* Empty state */}
      {orders.length === 0 && (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <p className="text-lg font-semibold text-slate-700 dark:text-slate-200">Tudo em dia!</p>
            <p className="text-base text-slate-400 dark:text-slate-500 mt-1">
              Você não tem nenhuma tarefa em aberto agora.
            </p>
          </div>
        </Card>
      )}

      {/* Em andamento — priority section */}
      {emAndamento.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-bold text-produmar-700 dark:text-produmar-400 flex items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Em andamento
          </h2>
          <div className="space-y-4">
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
          <h2 className="text-base font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2">
            <ClipboardList className="w-5 h-5" />
            A fazer
          </h2>
          <div className="space-y-4">
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

      {/* Start dialog (viagem/diária) */}
      {startTarget && (
        <StartOSDialog
          order={startTarget}
          open={!!startTarget}
          onClose={() => setStartTarget(null)}
          onStarted={markStarted}
        />
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
    <div className="flex items-start gap-3">
      <Icon className="w-5 h-5 text-slate-400 dark:text-slate-500 flex-shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <span className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500 font-semibold">
          {label}
        </span>
        <div className="text-base font-medium text-slate-700 dark:text-slate-200 break-words leading-snug">
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Instrução curta por modo/status ──────────────────────────────────────────
function instruction(o: OrderWithDetails): string {
  const mode = o.type === "entrega_material" ? o.billing_mode : null;
  if (o.status === "pendente") {
    if (mode === "viagem") return "Vai sair? Toque em INICIAR e anote o km e a hora.";
    if (mode === "diaria") return "Vai começar? Toque em INICIAR e anote o km e a hora.";
    if (mode === "km")     return "Toque em INICIAR quando sair. Os km você anota no final.";
    return "Toque em INICIAR quando começar este serviço.";
  }
  if (mode === "viagem") return "Chegou? Toque em FINALIZAR: anote o km e peça a assinatura.";
  if (mode === "km")     return "Terminou? Toque em FINALIZAR: anote os km e peça a assinatura.";
  if (mode === "diaria") return "Fim do dia? Toque em FINALIZAR: km, viagens e assinatura.";
  return "Terminou? Toque em FINALIZAR para encerrar.";
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
  const billing    = isMaterial && o.billing_mode ? BILLING_BADGE[o.billing_mode] : null;

  // Título: serviço (notes) → descrição → cliente → tipo
  const title =
    o.notes?.trim() ||
    o.service_description?.trim() ||
    (isClient ? o.client_name?.trim() : "") ||
    (isMaterial ? "Entrega de material" : "Prestação de serviço");

  const materials = o.service_order_items
    .filter((it) => !it.is_freight && (it.product_id || it.description))
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

  // Saída anotada no Iniciar (viagem/diária em andamento)
  const showStartInfo =
    o.status === "em_andamento" && isMaterial && o.km_start != null;

  return (
    <div
      className={`rounded-2xl border-2 p-4 space-y-4 ${
        o.status === "em_andamento"
          ? "border-produmar-300 dark:border-produmar-700 bg-produmar-50/40 dark:bg-produmar-950/20"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
      }`}
    >
      {/* Cabeçalho: ícone + título + data/status */}
      <div className="flex items-start gap-3">
        <div
          className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isClient
              ? "bg-emerald-100 dark:bg-emerald-950/50"
              : "bg-amber-100 dark:bg-amber-950/50"
          }`}
        >
          {isMaterial ? (
            <Truck className={`w-7 h-7 ${isClient ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`} />
          ) : (
            <Wrench className={`w-7 h-7 ${isClient ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-lg font-bold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2 break-words">
            {title}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {billing && (
              <span
                className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${billing.className}`}
              >
                <billing.icon className="w-3.5 h-3.5" />
                {billing.label}
              </span>
            )}
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
      <div className="space-y-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 p-3">
        {isClient && o.client_name && (
          <InfoRow icon={User} label="Cliente">
            {o.client_name}
            {o.client_phone && (
              <a
                href={`tel:${o.client_phone.replace(/\D/g, "")}`}
                className="ml-2 inline-flex items-center gap-1 text-produmar-600 dark:text-produmar-400 font-semibold"
              >
                <Phone className="w-4 h-4" />
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

        {showStartInfo && (
          <InfoRow icon={Gauge} label="Saída">
            <span className="tabular-nums">
              {fmtKm(o.km_start!)} km
              {o.start_time ? ` às ${o.start_time.slice(0, 5)}` : ""}
            </span>
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
      <p className="text-sm font-medium text-slate-500 dark:text-slate-400 text-center">
        {instruction(o)}
      </p>

      {/* Botões grandes p/ toque */}
      <div className="flex gap-3">
        {o.status === "pendente" && (
          <Button
            variant="outline"
            className="flex-1 h-16 text-lg font-bold border-2 border-produmar-300 text-produmar-700 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-produmar-950/30"
            onClick={() => onIniciar(o)}
          >
            <PlayCircle className="w-6 h-6" />
            INICIAR
          </Button>
        )}
        <Button
          className="flex-1 h-16 text-lg font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => onFinalizar(o)}
        >
          <CheckCircle2 className="w-6 h-6" />
          FINALIZAR
        </Button>
      </div>
    </div>
  );
}
