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
  PauseCircle,
  Gauge,
  Route,
  CalendarDays,
  Minus,
  Zap,
  Forward,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FinalizeOSDialog } from "./finalize-os-dialog";
import { StartOSDialog } from "./start-os-dialog";
import { TripStartDialog } from "./trip-start-dialog";
import { TripFinishDialog } from "./trip-finish-dialog";
import { PauseDialog } from "./pause-dialog";
import { ResumeDialog } from "./resume-dialog";
import { ForwardDialog } from "./forward-dialog";
import {
  startTrip,
  finishTrip,
  cancelOpenTrip,
  removeLastTrip,
  startServiceOrder,
} from "@/app/(app)/operacoes/actions";
import { osStatusLabel } from "@/lib/utils";
import type {
  ServiceBillingMode,
  ServiceOrder,
  ServiceOrderAttachment,
  ServiceOrderForward,
  ServiceOrderItem,
  ServiceOrderStatus,
  ServiceOrderTrip,
  ServiceOrderPause,
} from "@/lib/types";

type OrderWithDetails = ServiceOrder & {
  machines: { name: string; plate: string | null; tracking_type?: string | null } | null;
  pickup_locations: { name: string } | null;
  service_order_items: (ServiceOrderItem & { products: { name: string } | null })[];
  service_order_trips?: ServiceOrderTrip[];
  service_order_pauses?: ServiceOrderPause[];
  service_order_attachments?: ServiceOrderAttachment[];
  service_order_forwards?: ServiceOrderForward[];
};

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface Props {
  orders: OrderWithDetails[];
  operadorName: string;
  /** Último km conhecido de cada veículo (facilita anotar o km no Iniciar). */
  lastKmByMachine?: Record<string, number>;
  /** Outros operadores (para encaminhar a OS). */
  operators?: { id: string; name: string }[];
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

function fmtDateShort(s: string | null): string {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return d && m && y ? `${d}/${m}` : s;
}

function fmtForwardWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function OperadorClient({
  orders: initialOrders,
  operadorName,
  lastKmByMachine = {},
  operators = [],
}: Props) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [finalizeTarget, setFinalizeTarget] = useState<OrderWithDetails | null>(null);
  const [forwardTarget, setForwardTarget] = useState<OrderWithDetails | null>(null);
  const [startTarget, setStartTarget] = useState<OrderWithDetails | null>(null);
  const [tripStartTarget, setTripStartTarget] = useState<OrderWithDetails | null>(null);
  const [tripFinishTarget, setTripFinishTarget] = useState<{
    order: OrderWithDetails;
    openTrip: ServiceOrderTrip;
  } | null>(null);
  const [pauseTarget, setPauseTarget] = useState<OrderWithDetails | null>(null);
  const [resumeTarget, setResumeTarget] = useState<{
    order: OrderWithDetails;
    openPause: ServiceOrderPause;
  } | null>(null);
  const [, startTransition] = useTransition();

  // Reconcilia o estado local com os dados do servidor (após revalidação/refresh).
  useEffect(() => setOrders(initialOrders), [initialOrders]);

  const pending     = orders.filter((o) => o.status === "pendente");
  const emAndamento = orders.filter((o) => o.status === "em_andamento");

  function handleFinalized(orderId: string) {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
  }

  // Encaminhada: a OS passou para outro operador — sai deste painel.
  function handleForwarded(orderId: string) {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
    router.refresh();
  }

  function markStarted(orderId: string) {
    setOrders((prev) =>
      prev.map((x) => (x.id === orderId ? { ...x, status: "em_andamento" } : x))
    );
    // Recarrega para trazer km/hora gravados no banco
    router.refresh();
  }

  async function handleIniciar(o: OrderWithDetails) {
    // Todo frete (viagem/km/diária) anota o km do veículo + a hora na saída —
    // o km de chegada no fim é o que fecha o cálculo. A prestação de serviço
    // com máquina também anota a leitura (km/horímetro) no início, salvo se já
    // veio preenchida do escritório. OS sem máquina inicia em 1 toque.
    const tracksKm = o.machines?.tracking_type === "km";
    const serviceNeedsReading =
      o.type === "prestacao_servico" &&
      o.machine_id != null &&
      (tracksKm ? o.km_start == null : o.hourmeter_start == null);
    if (o.billing_mode || serviceNeedsReading) {
      setStartTarget(o);
      return;
    }
    const startTime = nowHHMM();
    startTransition(async () => {
      const result = await startServiceOrder(o.id, { startTime });
      if (result && "error" in result) {
        alert(result.error ?? "Não foi possível iniciar. Tente de novo.");
        return;
      }
      setOrders((prev) =>
        prev.map((x) =>
          x.id === o.id ? { ...x, status: "em_andamento", start_time: startTime } : x
        )
      );
    });
  }

  // Modo "por viagem": cada viagem tem início e fim.
  // Iniciar viagem (de onde) — chamado pelo TripStartDialog.
  async function handleStartTrip(
    o: OrderWithDetails,
    data: { origin: string | null }
  ): Promise<string | null> {
    const result = await startTrip(o.id, { origin: data.origin, startTime: nowHHMM() });
    if ("error" in result) {
      return result.error ?? "Não foi possível iniciar a viagem. Tente de novo.";
    }
    router.refresh();
    return null;
  }

  // Finalizar viagem (onde foi entregue + assinatura) — pelo TripFinishDialog.
  async function handleFinishTrip(
    o: OrderWithDetails,
    data: {
      destination: string | null;
      receivedBy: string | null;
      signature: string | null;
      latitude: number | null;
      longitude: number | null;
      locationAccuracy: number | null;
    }
  ): Promise<string | null> {
    const result = await finishTrip(o.id, { ...data, finishTime: nowHHMM() });
    if ("error" in result) {
      return result.error ?? "Não foi possível finalizar a viagem. Tente de novo.";
    }
    if (result.trips != null) {
      const trips = result.trips;
      setOrders((prev) =>
        prev.map((x) => (x.id === o.id ? { ...x, trips_count: trips } : x))
      );
    }
    router.refresh();
    return null;
  }

  // Cancela a viagem em andamento (não conta) — com confirmação.
  function handleCancelTrip(o: OrderWithDetails) {
    const ok = confirm("Cancelar a viagem em andamento?\n\nO registro dela será apagado.");
    if (!ok) return;
    startTransition(async () => {
      const result = await cancelOpenTrip(o.id);
      if ("error" in result) {
        alert(result.error ?? "Não foi possível cancelar. Tente de novo.");
        return;
      }
      router.refresh();
    });
  }

  // "−" remove a última viagem ENTREGUE (e sua assinatura) — com confirmação.
  function handleRemoveTrip(o: OrderWithDetails) {
    const ok = confirm(
      "Tirar a última viagem entregue?\n\nO registro dela (assinatura e local) será apagado."
    );
    if (!ok) return;
    const prevTrips = o.trips_count ?? 0;
    setOrders((prev) =>
      prev.map((x) =>
        x.id === o.id
          ? { ...x, trips_count: Math.max(0, (x.trips_count ?? 0) - 1) }
          : x
      )
    );
    startTransition(async () => {
      const result = await removeLastTrip(o.id);
      if ("error" in result) {
        setOrders((prev) =>
          prev.map((x) => (x.id === o.id ? { ...x, trips_count: prevTrips } : x))
        );
        alert(result.error ?? "Não foi possível corrigir. Tente de novo.");
        return;
      }
      router.refresh();
    });
  }

  // Antes de fechar a OS por viagem, exige que não haja viagem em andamento.
  function handleFinalizar(o: OrderWithDetails) {
    const openTrip = (o.service_order_trips ?? []).find((t) => !t.trip_time);
    if (o.billing_mode === "viagem" && openTrip) {
      alert(
        "Há uma viagem em andamento. Finalize ou cancele essa viagem antes de fechar a OS."
      );
      return;
    }
    setFinalizeTarget(o);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
          Minhas tarefas
        </h1>
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
                onFinalizar={handleFinalizar}
                onStartTrip={setTripStartTarget}
                onFinishTrip={(order, openTrip) =>
                  setTripFinishTarget({ order, openTrip })
                }
                onCancelTrip={handleCancelTrip}
                onRemoveTrip={handleRemoveTrip}
                onPause={setPauseTarget}
                onResume={(order, openPause) =>
                  setResumeTarget({ order, openPause })
                }
                onForward={setForwardTarget}
                canForward={operators.length > 0}
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
                onFinalizar={handleFinalizar}
                onStartTrip={setTripStartTarget}
                onFinishTrip={(order, openTrip) =>
                  setTripFinishTarget({ order, openTrip })
                }
                onCancelTrip={handleCancelTrip}
                onRemoveTrip={handleRemoveTrip}
                onPause={setPauseTarget}
                onResume={(order, openPause) =>
                  setResumeTarget({ order, openPause })
                }
                onForward={setForwardTarget}
                canForward={operators.length > 0}
              />
            ))}
          </div>
        </section>
      )}

      {/* Start dialog (frete: viagem/km/diária) */}
      {startTarget && (
        <StartOSDialog
          order={startTarget}
          open={!!startTarget}
          onClose={() => setStartTarget(null)}
          onStarted={markStarted}
          lastKm={
            startTarget.machine_id != null
              ? lastKmByMachine[startTarget.machine_id] ?? null
              : null
          }
        />
      )}

      {/* Iniciar viagem (modo "por viagem") */}
      {tripStartTarget && (
        <TripStartDialog
          order={tripStartTarget}
          open={!!tripStartTarget}
          onClose={() => setTripStartTarget(null)}
          onStart={(data) => handleStartTrip(tripStartTarget, data)}
        />
      )}

      {/* Finalizar viagem (modo "por viagem") */}
      {tripFinishTarget && (
        <TripFinishDialog
          order={tripFinishTarget.order}
          openTrip={tripFinishTarget.openTrip}
          open={!!tripFinishTarget}
          onClose={() => setTripFinishTarget(null)}
          onFinish={(data) => handleFinishTrip(tripFinishTarget.order, data)}
        />
      )}

      {/* Finalize dialog */}
      {finalizeTarget && (
        <FinalizeOSDialog
          order={finalizeTarget}
          open={!!finalizeTarget}
          onClose={() => setFinalizeTarget(null)}
          onFinalized={handleFinalized}
          onPauseInstead={() => {
            // Usa o alvo do closure (OrderWithDetails completo) — o parâmetro do
            // diálogo tem um tipo mais frouxo (pickup_locations opcional).
            setPauseTarget(finalizeTarget);
            setFinalizeTarget(null);
          }}
        />
      )}

      {/* Pausar serviço (prestação de serviço interno) */}
      {pauseTarget && (
        <PauseDialog
          order={pauseTarget}
          open={!!pauseTarget}
          onClose={() => setPauseTarget(null)}
          onPaused={() => router.refresh()}
        />
      )}

      {/* Continuar serviço (retomada no dia seguinte) */}
      {resumeTarget && (
        <ResumeDialog
          order={resumeTarget.order}
          openPause={resumeTarget.openPause}
          open={!!resumeTarget}
          onClose={() => setResumeTarget(null)}
          onResumed={() => router.refresh()}
        />
      )}

      {/* Encaminhar a OS para outro operador */}
      {forwardTarget && (
        <ForwardDialog
          order={forwardTarget}
          operators={operators}
          open={!!forwardTarget}
          onClose={() => setForwardTarget(null)}
          onForwarded={handleForwarded}
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

// ── OS Card ───────────────────────────────────────────────────────────────────
function OSCard({
  order: o,
  onIniciar,
  onFinalizar,
  onStartTrip,
  onFinishTrip,
  onCancelTrip,
  onRemoveTrip,
  onPause,
  onResume,
  onForward,
  canForward,
}: {
  order: OrderWithDetails;
  onIniciar: (o: OrderWithDetails) => void;
  onFinalizar: (o: OrderWithDetails) => void;
  onStartTrip: (o: OrderWithDetails) => void;
  onFinishTrip: (o: OrderWithDetails, openTrip: ServiceOrderTrip) => void;
  onCancelTrip: (o: OrderWithDetails) => void;
  onRemoveTrip: (o: OrderWithDetails) => void;
  onPause: (o: OrderWithDetails) => void;
  onResume: (o: OrderWithDetails, openPause: ServiceOrderPause) => void;
  onForward: (o: OrderWithDetails) => void;
  canForward: boolean;
}) {
  const isClient   = o.freight_type === "cliente";
  const isMaterial = o.type === "entrega_material";
  const isFrete    = o.type === "frete";
  // Serviço rápido: tarefa/errand de funcionário (ex.: comprar diesel).
  const isQuick    = o.type === "servico_rapido";
  // Pausa/retomada — prestação de serviço interno (serviço que pode durar vários
  // dias) e serviço rápido (a tarefa pode ficar pendente). Pausa em aberto (sem
  // retomada) = serviço pausado.
  const isServiceInterno = o.type === "prestacao_servico" && o.freight_type === "interno";
  const isPausable = isServiceInterno || isQuick;
  // Encaminhar (passar a OS para outro operador) — disponível no serviço rápido.
  const canForwardThis = isQuick && o.status !== "entregue" && o.status !== "cancelado";
  const forwards = (o.service_order_forwards ?? [])
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const lastForward = forwards.length > 0 ? forwards[forwards.length - 1] : null;
  const pauses = (o.service_order_pauses ?? [])
    .slice()
    .sort((a, b) => a.pause_number - b.pause_number);
  const openPause = pauses.find((p) => !p.resume_time) ?? null;
  const isPaused =
    o.status === "em_andamento" && isPausable && !!openPause;
  const showWorkLog =
    isPausable && o.status === "em_andamento" && pauses.length > 0;
  // Frete (ou OS antiga de entrega com cobrança) tem badge do modo
  const billing    = o.billing_mode ? BILLING_BADGE[o.billing_mode] : null;
  // Contador de viagens no cartão (modo "por viagem" em andamento)
  const showTripCounter =
    o.status === "em_andamento" && o.billing_mode === "viagem";
  const allTrips = (o.service_order_trips ?? [])
    .slice()
    .sort((a, b) => a.trip_number - b.trip_number);
  // Viagem em andamento = linha sem hora de chegada (trip_time NULL).
  const openTrip = allTrips.find((t) => !t.trip_time) ?? null;
  // Viagens já entregues (finalizadas).
  const finishedTrips = allTrips.filter((t) => t.trip_time);
  const tripsDone = o.trips_count ?? finishedTrips.length;

  // Título: serviço (notes) → descrição → cliente → tipo
  const title =
    o.notes?.trim() ||
    o.service_description?.trim() ||
    (isClient ? o.client_name?.trim() : "") ||
    (isMaterial
      ? "Entrega de material"
      : isFrete
        ? "Frete"
        : isQuick
          ? "Serviço rápido"
          : "Prestação de serviço");

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

  // Saída/início anotado no Iniciar — km (quando houver) e hora, em todos os
  // modos: agora a hora é registrada mesmo no início de 1 toque.
  const tracksKm = o.machines?.tracking_type === "km";
  const startInfo = (() => {
    if (o.status !== "em_andamento") return null;
    const parts: string[] = [];
    // KM de saída: frete/entrega e também serviço medido por hodômetro.
    if ((isMaterial || isFrete || tracksKm) && o.km_start != null) {
      parts.push(`${fmtKm(o.km_start)} km`);
    }
    if (o.start_time) parts.push(`às ${o.start_time.slice(0, 5)}`);
    return parts.length > 0 ? parts.join(" ") : null;
  })();

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
          {isMaterial || isFrete ? (
            <Truck className={`w-7 h-7 ${isClient ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`} />
          ) : isQuick ? (
            <Zap className="w-7 h-7 text-amber-600 dark:text-amber-400" />
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

        {(isMaterial || isFrete) && materials.length > 0 && (
          <InfoRow icon={Package} label="Material">
            <ul className="space-y-0.5">
              {materials.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </InfoRow>
        )}

        {!isMaterial && !isFrete && !isQuick && o.service_description && (
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

        {(isMaterial || isFrete) && o.pickup_locations && (
          <InfoRow icon={MapPin} label="Retirar em">
            {o.pickup_locations.name}
          </InfoRow>
        )}

        {o.delivery_address && (
          <InfoRow
            icon={Navigation}
            label={isMaterial || isFrete ? "Entregar em" : "Local do serviço"}
          >
            {o.delivery_address}
          </InfoRow>
        )}

        {startInfo && (
          <InfoRow
            icon={o.km_start != null ? Gauge : Clock}
            label={isMaterial || isFrete ? "Saída" : "Início"}
          >
            <span className="tabular-nums">{startInfo}</span>
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

      {/* Histórico de encaminhamentos — de quem → para quem, quando e motivo. */}
      {forwards.length > 0 && (
        <div className="rounded-xl border-2 border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-950/20 p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <Forward className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <span className="text-sm font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">
              {forwards.length === 1 ? "Encaminhamento" : "Encaminhamentos"}
            </span>
          </div>
          <ul className="space-y-1.5">
            {forwards.map((f) => (
              <li key={f.id} className="text-sm text-slate-600 dark:text-slate-300">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {f.from_name ?? "—"}
                  </span>
                  <span className="text-slate-400">→</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {f.to_name ?? "—"}
                  </span>
                  <span className="text-slate-400 dark:text-slate-500 tabular-nums">
                    · {fmtForwardWhen(f.created_at)}
                  </span>
                </div>
                {f.note && (
                  <p className="text-slate-700 dark:text-slate-200 break-words">{f.note}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Viagens (modo "por viagem" em andamento): início → fim por viagem */}
      {showTripCounter && (
        <div className="rounded-xl border-2 border-sky-200 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-950/20 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-sky-700 dark:text-sky-300 uppercase tracking-wide">
              Viagens entregues
            </span>
            <span className="text-3xl font-black tabular-nums text-sky-800 dark:text-sky-200">
              {tripsDone}
            </span>
          </div>

          {openTrip ? (
            // Viagem em andamento: mostra de onde saiu + botão FINALIZAR
            <div className="space-y-2">
              <p className="text-sm text-sky-700 dark:text-sky-300">
                {openTrip.trip_number}ª viagem em andamento
                {openTrip.origin ? (
                  <> — saiu de <span className="font-semibold">{openTrip.origin}</span></>
                ) : null}
                {openTrip.start_time ? ` às ${openTrip.start_time.slice(0, 5)}` : ""}
              </p>
              <button
                type="button"
                onClick={() => onFinishTrip(o, openTrip)}
                className="w-full min-w-0 h-14 px-2 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white text-base sm:text-lg font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                FINALIZAR VIAGEM
              </button>
              <button
                type="button"
                onClick={() => onCancelTrip(o)}
                className="w-full h-10 rounded-xl text-sm text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-800"
              >
                Cancelar viagem
              </button>
            </div>
          ) : (
            // Sem viagem aberta: botão INICIAR + correção da última entregue
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => onRemoveTrip(o)}
                disabled={tripsDone === 0}
                aria-label="Tirar a última viagem entregue"
                className="w-14 h-14 rounded-2xl border-2 border-slate-300 dark:border-slate-600 flex items-center justify-center text-slate-600 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-700 disabled:opacity-40 flex-shrink-0"
              >
                <Minus className="w-7 h-7" />
              </button>
              <button
                type="button"
                onClick={() => onStartTrip(o)}
                className="flex-1 min-w-0 h-14 px-2 rounded-2xl bg-produmar-600 hover:bg-produmar-700 text-white text-base sm:text-lg font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
              >
                <PlayCircle className="w-5 h-5 shrink-0" />
                INICIAR VIAGEM
              </button>
            </div>
          )}

          {finishedTrips.length > 0 && (
            <ul className="space-y-0.5 pt-1">
              {finishedTrips.map((t) => (
                <li
                  key={t.id}
                  className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5"
                >
                  <span className="font-semibold text-slate-600 dark:text-slate-300 flex-shrink-0">
                    {t.trip_number}ª
                  </span>
                  <span className="truncate">
                    {t.origin ? `${t.origin} → ` : ""}
                    {t.destination ?? "—"}
                  </span>
                  {t.trip_time && (
                    <span className="tabular-nums flex-shrink-0">{t.trip_time.slice(0, 5)}</span>
                  )}
                  {t.signature ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 flex-shrink-0 whitespace-nowrap">
                      sem assin.
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Diário de trabalho (serviço interno em andamento): pausas e retomadas
          já registradas, com leitura e observação do dia. */}
      {showWorkLog && (
        <div
          className={`rounded-xl border-2 p-3 space-y-2 ${
            isPaused
              ? "border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20"
              : "border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40"
          }`}
        >
          <div className="flex items-center gap-2">
            {isPaused ? (
              <PauseCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            ) : (
              <ClipboardList className="w-5 h-5 text-slate-400 dark:text-slate-500 shrink-0" />
            )}
            <span
              className={`text-sm font-bold uppercase tracking-wide ${
                isPaused
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {isPaused ? "Serviço pausado" : "Diário de trabalho"}
            </span>
          </div>
          <ul className="space-y-2">
            {pauses.map((p) => (
              <li
                key={p.id}
                className="text-sm text-slate-600 dark:text-slate-300 border-t border-slate-200/70 dark:border-slate-700/70 pt-2 first:border-t-0 first:pt-0"
              >
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <PauseCircle className="w-4 h-4 text-amber-500 self-center shrink-0" />
                  <span className="font-semibold tabular-nums">
                    {fmtDateShort(p.pause_date)} {p.pause_time?.slice(0, 5) ?? ""}
                  </span>
                  {p.pause_reading != null && (
                    <span className="tabular-nums text-slate-500 dark:text-slate-400">
                      · {fmtKm(p.pause_reading)} {tracksKm ? "km" : "h"}
                    </span>
                  )}
                </div>
                {p.pause_notes && (
                  <p className="mt-0.5 pl-5 text-slate-700 dark:text-slate-200 break-words">
                    {p.pause_notes}
                  </p>
                )}
                {p.resume_time ? (
                  <div className="mt-0.5 pl-5 flex items-baseline gap-1.5 flex-wrap text-produmar-700 dark:text-produmar-400">
                    <PlayCircle className="w-4 h-4 self-center shrink-0" />
                    <span className="font-semibold tabular-nums">
                      Voltou {fmtDateShort(p.resume_date)} {p.resume_time.slice(0, 5)}
                    </span>
                    {p.resume_reading != null && (
                      <span className="tabular-nums">
                        · {fmtKm(p.resume_reading)} {tracksKm ? "km" : "h"}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="mt-0.5 pl-5 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                    Aguardando retomada
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pausar / continuar — prestação de serviço interno e serviço rápido em
          andamento. */}
      {isPausable && o.status === "em_andamento" && (
        openPause ? (
          <Button
            className="w-full h-16 px-2 text-base sm:text-lg font-bold bg-produmar-600 hover:bg-produmar-700 text-white"
            onClick={() => onResume(o, openPause)}
          >
            <PlayCircle className="w-5 h-5 shrink-0" />
            CONTINUAR SERVIÇO
          </Button>
        ) : (
          <Button
            variant="outline"
            className="w-full h-14 px-2 text-base sm:text-lg font-bold border-2 border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
            onClick={() => onPause(o)}
          >
            <PauseCircle className="w-5 h-5 shrink-0" />
            PAUSAR
          </Button>
        )
      )}

      {/* Botões grandes p/ toque — min-w-0 deixa encolher e não estoura o card
          em celulares estreitos; ícone shrink-0 + texto responsivo. */}
      <div className="flex gap-2 sm:gap-3">
        {o.status === "pendente" && (
          <Button
            variant="outline"
            className="flex-1 min-w-0 h-16 px-2 text-base sm:text-lg font-bold border-2 border-produmar-300 text-produmar-700 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-produmar-950/30"
            onClick={() => onIniciar(o)}
          >
            <PlayCircle className="w-5 h-5 shrink-0" />
            INICIAR
          </Button>
        )}
        <Button
          className="flex-1 min-w-0 h-16 px-2 text-base sm:text-lg font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => onFinalizar(o)}
        >
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          FINALIZAR
        </Button>
      </div>

      {/* Encaminhar para outro operador — serviço rápido. */}
      {canForwardThis && canForward && (
        <Button
          variant="outline"
          className="w-full h-12 px-2 text-base font-bold border-2 border-sky-300 text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/30"
          onClick={() => onForward(o)}
        >
          <Forward className="w-5 h-5 shrink-0" />
          ENCAMINHAR PARA OUTRO
        </Button>
      )}
    </div>
  );
}
