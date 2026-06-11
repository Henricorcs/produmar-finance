"use client";

import { useEffect, useState, useTransition } from "react";
import {
  CheckCircle2, Printer, Clock, Package, MapPin, Navigation,
  Gauge, Minus, Plus, Route, CalendarDays,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignaturePad } from "./signature-pad";
import { finalizeServiceOrder } from "@/app/(app)/operacoes/actions";
import { formatBRL } from "@/lib/utils";
import type { ServiceOrder, ServiceOrderItem, ServiceOrderTrip } from "@/lib/types";

type OrderDetails = ServiceOrder & {
  machines: { name: string; plate: string | null; tracking_type?: string | null } | null;
  pickup_locations?: { name: string } | null;
  service_order_items?: (ServiceOrderItem & { products: { name: string } | null })[];
  service_order_trips?: ServiceOrderTrip[];
};

interface Props {
  order: OrderDetails;
  open: boolean;
  onClose: () => void;
  onFinalized: (orderId: string) => void;
}

// Horímetro: vírgula MANUAL — o técnico digita o número como aparece no relógio
// e coloca a vírgula se precisar (1 casa decimal). Não força decimal automático.
function sanitizeHourmeter(raw: string): string {
  const cleaned = raw.replace(/\./g, ",").replace(/[^\d,]/g, "");
  const parts = cleaned.split(",");
  if (parts.length > 2) return parts[0] + "," + parts.slice(1).join("");
  if (parts[1]?.length > 1) return parts[0] + "," + parts[1].slice(0, 1);
  return cleaned;
}

function nowYYYYMMDD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// KM do veículo: dígitos + uma vírgula com 1 casa no máximo.
function sanitizeKm(raw: string): string {
  const cleaned = raw.replace(/\./g, ",").replace(/[^\d,]/g, "");
  const parts = cleaned.split(",");
  if (parts.length > 2) return parts[0] + "," + parts.slice(1).join("");
  if (parts[1]?.length > 1) return parts[0] + "," + parts[1].slice(0, 1);
  return cleaned;
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtKm(n: number): string {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

export function FinalizeOSDialog({ order, open, onClose, onFinalized }: Props) {
  // Modo de cobrança do frete (OS de frete; cobre também OS antigas de
  // entrega de material que usavam cobrança): viagem | km | diaria.
  const billingMode = order.type !== "prestacao_servico" ? order.billing_mode : null;
  // O km de saída é anotado no Iniciar (em todos os modos de frete). Só pedimos
  // o km inicial aqui quando ele faltar — OS antiga ou iniciada pelo escritório.
  const showKmStartInput = !!billingMode && order.km_start == null;
  const isClient = order.freight_type === "cliente";

  const [receivedBy, setReceivedBy]   = useState("");
  const [hourmeterStart, setHourmeterStart] = useState("");
  const [hourmeterEnd, setHourmeterEnd] = useState("");
  const [kmStart, setKmStart] = useState(
    order.km_start != null ? order.km_start.toString().replace(".", ",") : ""
  );
  const [kmEnd, setKmEnd]     = useState("");
  // Viagens já marcadas pelo técnico durante a OS (modo "por viagem") — aqui
  // ele só confere e corrige se precisar.
  const [trips, setTrips]     = useState(order.trips_count ?? 0);
  const [error, setError]             = useState<string | null>(null);
  const [done, setDone]               = useState(false);
  const [signature, setSignature]     = useState<string | null>(null);
  const [isPending, startTransition]  = useTransition();

  // Localização automática (GPS do celular) — capturada assim que o dialog
  // abre, sem o técnico fazer nada. Best-effort: sem GPS, finaliza igual.
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"buscando" | "ok" | "erro">("buscando");

  useEffect(() => {
    if (!open) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsStatus("erro");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setGpsStatus("ok");
      },
      () => setGpsStatus("erro"),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }, [open]);

  // Serviço por horímetro ainda em aberto. O técnico informa o horímetro final
  // ao fechar; quando o inicial não foi informado no cadastro, ele informa os
  // dois (inicial e final). Detecta pela máquina (tracking por horímetro).
  const isHourmeterService =
    order.type === "prestacao_servico" &&
    order.machine_id != null &&
    order.machines?.tracking_type !== "km";
  const needsHourmeter = isHourmeterService && order.hourmeter_end == null;
  const needsStart = needsHourmeter && order.hourmeter_start == null;

  const startNum = needsStart
    ? parseFloat(hourmeterStart.replace(",", "."))
    : order.hourmeter_start ?? 0;
  const endNum = parseFloat(hourmeterEnd.replace(",", "."));
  const hours = !isNaN(endNum) && endNum > startNum ? endNum - startNum : 0;
  const rate = order.hourly_rate ?? 0;
  const previewTotal = hours * rate;

  // ── Frete (viagem/km/diária) ───────────────────────────────────────────────
  const ksNum = showKmStartInput
    ? parseFloat(kmStart.replace(",", "."))
    : order.km_start ?? NaN;
  const keNum = parseFloat(kmEnd.replace(",", "."));
  const kmDelta = !isNaN(ksNum) && !isNaN(keNum) && keNum > ksNum ? keNum - ksNum : 0;

  const freightRate = order.freight_value ?? 0;
  const freightPreview =
    billingMode === "viagem"
      ? trips * freightRate
      : billingMode === "km"
        ? kmDelta * freightRate
        : billingMode === "diaria"
          ? freightRate
          : 0;
  const materialsTotal = (order.service_order_items ?? [])
    .filter((it) => !it.is_freight)
    .reduce((s, it) => s + Number(it.total), 0);

  const materials = (order.service_order_items ?? [])
    .filter((it) => !it.is_freight && (it.product_id || it.description))
    .map(
      (it) =>
        `${Number(it.quantity).toLocaleString("pt-BR", {
          maximumFractionDigits: 3,
        })} ${it.unit ?? ""} ${it.products?.name ?? it.description ?? ""}`.trim()
    )
    .filter(Boolean);

  function handleClose() {
    setReceivedBy("");
    setHourmeterStart("");
    setHourmeterEnd("");
    setKmStart(order.km_start != null ? order.km_start.toString().replace(".", ",") : "");
    setKmEnd("");
    setTrips(order.trips_count ?? 0);
    setSignature(null);
    setError(null);
    setDone(false);
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!receivedBy.trim()) {
      setError("Escreva o nome de quem recebeu");
      return;
    }
    if (needsHourmeter) {
      if (needsStart && (!hourmeterStart.trim() || isNaN(startNum))) {
        setError("Informe o horímetro inicial");
        return;
      }
      if (!hourmeterEnd.trim() || isNaN(endNum)) {
        setError("Informe o horímetro final");
        return;
      }
      if (endNum <= startNum) {
        setError("O horímetro final deve ser maior que o inicial");
        return;
      }
    }
    if (billingMode) {
      if (showKmStartInput && (!kmStart.trim() || isNaN(ksNum))) {
        setError(billingMode === "km" ? "Anote o KM inicial" : "Anote o KM de saída");
        return;
      }
      if (!kmEnd.trim() || isNaN(keNum)) {
        setError("Anote o KM de chegada");
        return;
      }
      if (!isNaN(ksNum) && keNum <= ksNum) {
        setError("O KM de chegada tem que ser maior que o KM de saída");
        return;
      }
      if (billingMode === "viagem" && trips < 1) {
        setError("Conte quantas viagens você fez — toque no botão +");
        return;
      }
      // Assinatura obrigatória só quando é cliente externo recebendo.
      if (isClient && !signature) {
        setError("Peça para quem recebeu assinar no quadro");
        return;
      }
    }
    setError(null);
    startTransition(async () => {
      const result = await finalizeServiceOrder(order.id, receivedBy, {
        signature,
        hourmeterStart: needsStart ? startNum : null,
        hourmeterEnd: needsHourmeter ? endNum : null,
        kmStart: billingMode && showKmStartInput ? ksNum : null,
        kmEnd: billingMode ? keNum : null,
        tripsCount: billingMode === "viagem" ? trips : null,
        // Hora e data de fechamento do relógio do celular (servidor é UTC)
        endTime: nowHHMM(),
        finishedDate: nowYYYYMMDD(),
        // Localização automática (quando o GPS respondeu)
        latitude: gps?.lat ?? null,
        longitude: gps?.lng ?? null,
        locationAccuracy: gps?.accuracy ?? null,
      });
      if ("error" in result) {
        setError(result.error ?? "Erro ao finalizar");
      } else {
        setDone(true);
        onFinalized(order.id);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl dark:text-slate-100">
            Finalizar OS #{order.order_number}
          </DialogTitle>
        </DialogHeader>

        {done ? (
          /* ── Success state ─────────────────────────────────────── */
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-100">
                  OS #{order.order_number} finalizada!
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  Recebido por: <span className="font-medium">{receivedBy.toUpperCase()}</span>
                </p>
              </div>
              {signature && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signature}
                  alt="Assinatura"
                  className="h-16 object-contain rounded-md border border-slate-200 dark:border-slate-700 bg-white"
                />
              )}
            </div>

            <Button
              className="w-full gap-2 h-12"
              onClick={() => window.open(`/imprimir/os/${order.id}`, "_blank")}
            >
              <Printer className="w-4 h-4" />
              Abrir comprovante para imprimir
            </Button>

            <Button variant="outline" className="w-full" onClick={handleClose}>
              Fechar
            </Button>
          </div>
        ) : (
          /* ── Form ──────────────────────────────────────────────── */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4 text-sm space-y-2">
              <p className="text-xs text-slate-400 dark:text-slate-500 uppercase font-semibold">
                Resumo
              </p>
              <p className="font-medium text-slate-700 dark:text-slate-200">
                OS #{order.order_number} —{" "}
                {order.type === "entrega_material"
                  ? "Entrega de material"
                  : order.type === "frete"
                    ? "Frete"
                    : "Prestação de serviço"}
              </p>
              {order.client_name && (
                <p className="text-slate-500 dark:text-slate-400">Cliente: {order.client_name}</p>
              )}
              {materials.length > 0 && (
                <p className="text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
                  <Package className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{materials.join(" · ")}</span>
                </p>
              )}
              {order.machines && (
                <p className="text-slate-500 dark:text-slate-400">
                  Máquina: {order.machines.name}
                  {order.machines.plate ? ` (${order.machines.plate})` : ""}
                </p>
              )}
              {order.pickup_locations && (
                <p className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 flex-shrink-0" />
                  Retirada: {order.pickup_locations.name}
                </p>
              )}
              {order.delivery_address && (
                <p className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Navigation className="w-4 h-4 flex-shrink-0" />
                  {order.delivery_address}
                </p>
              )}
            </div>

            {/* ── Frete: viagem / km / diária ─────────────────────── */}
            {billingMode && (
              <div className="rounded-xl border border-produmar-200 dark:border-produmar-800/60 bg-produmar-50/50 dark:bg-produmar-950/20 p-4 space-y-3">
                <Label className="flex items-center gap-2 text-base font-semibold text-produmar-700 dark:text-produmar-400">
                  {billingMode === "viagem" ? (
                    <><Route className="w-5 h-5" />Chegou? Anote o KM</>
                  ) : billingMode === "km" ? (
                    <><Gauge className="w-5 h-5" />Anote os KMs</>
                  ) : (
                    <><CalendarDays className="w-5 h-5" />Fim da diária</>
                  )}
                </Label>

                {/* Referência da saída (quando o técnico já anotou no Iniciar) */}
                {!showKmStartInput && order.km_start != null && (
                  <p className="text-base text-slate-600 dark:text-slate-300 tabular-nums">
                    Saída:{" "}
                    <span className="font-bold">{fmtKm(order.km_start)} km</span>
                    {order.start_time ? ` às ${order.start_time.slice(0, 5)}` : ""}
                  </p>
                )}

                {showKmStartInput && (
                  <div className="space-y-1.5">
                    <Label className="text-sm text-slate-600 dark:text-slate-300">
                      {billingMode === "km" ? "KM inicial" : "KM de saída"}{" "}
                      <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={kmStart}
                      onChange={(e) => setKmStart(sanitizeKm(e.target.value))}
                      placeholder="ex: 154300"
                      inputMode="decimal"
                      autoComplete="off"
                      className="h-14 text-2xl text-center font-bold tabular-nums"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-sm text-slate-600 dark:text-slate-300">
                    {billingMode === "km" ? "KM final" : "KM de chegada"}{" "}
                    <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    value={kmEnd}
                    onChange={(e) => setKmEnd(sanitizeKm(e.target.value))}
                    placeholder="ex: 154350"
                    inputMode="decimal"
                    autoComplete="off"
                    className="h-14 text-2xl text-center font-bold tabular-nums"
                  />
                </div>

                {/* Nº de viagens (por viagem) — botões grandes − / + */}
                {billingMode === "viagem" && (
                  <div className="space-y-1.5">
                    <Label className="text-sm text-slate-600 dark:text-slate-300">
                      Quantas viagens você fez? <span className="text-red-500">*</span>
                    </Label>
                    {(order.trips_count ?? 0) > 0 && (
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        Já contamos as viagens que você marcou — confira e corrija se precisar.
                        {(() => {
                          const times = (order.service_order_trips ?? [])
                            .filter((t) => t.trip_time)
                            .sort((a, b) => a.trip_number - b.trip_number)
                            .map((t) => t.trip_time!.slice(0, 5));
                          return times.length > 0 ? ` Horários: ${times.join(" · ")}.` : "";
                        })()}
                      </p>
                    )}
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setTrips((t) => Math.max(0, t - 1))}
                        aria-label="Menos uma viagem"
                        className="w-16 h-16 rounded-2xl border-2 border-slate-300 dark:border-slate-600 flex items-center justify-center text-slate-600 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-700 disabled:opacity-40"
                        disabled={trips === 0}
                      >
                        <Minus className="w-8 h-8" />
                      </button>
                      <div className="flex-1 text-center">
                        <p className="text-4xl font-black tabular-nums text-slate-800 dark:text-slate-100">
                          {trips}
                        </p>
                        <p className="text-xs text-slate-400">
                          {trips === 1 ? "viagem" : "viagens"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setTrips((t) => t + 1)}
                        aria-label="Mais uma viagem"
                        className="w-16 h-16 rounded-2xl bg-produmar-600 hover:bg-produmar-700 flex items-center justify-center text-white active:scale-95 transition-transform"
                      >
                        <Plus className="w-8 h-8" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Prévia do cálculo */}
                {kmDelta > 0 && (
                  <p className="text-base text-slate-600 dark:text-slate-300 tabular-nums">
                    Rodou <span className="font-bold">{fmtKm(kmDelta)} km</span>
                    {billingMode === "km" && freightRate > 0 && (
                      <>
                        {" "}× {formatBRL(freightRate)} ={" "}
                        <span className="font-bold text-produmar-700 dark:text-produmar-400">
                          {formatBRL(kmDelta * freightRate)}
                        </span>
                      </>
                    )}
                  </p>
                )}
                {billingMode === "viagem" && trips > 0 && freightRate > 0 && (
                  <p className="text-base text-slate-600 dark:text-slate-300 tabular-nums">
                    {trips} {trips === 1 ? "viagem" : "viagens"} × {formatBRL(freightRate)} ={" "}
                    <span className="font-bold text-produmar-700 dark:text-produmar-400">
                      {formatBRL(trips * freightRate)}
                    </span>
                  </p>
                )}
                {billingMode === "diaria" && freightRate > 0 && (
                  <p className="text-base text-slate-600 dark:text-slate-300 tabular-nums">
                    Valor da diária:{" "}
                    <span className="font-bold text-produmar-700 dark:text-produmar-400">
                      {formatBRL(freightRate)}
                    </span>
                  </p>
                )}
                {freightPreview > 0 && materialsTotal > 0 && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
                    Total da OS (materiais + frete):{" "}
                    <span className="font-semibold">{formatBRL(materialsTotal + freightPreview)}</span>
                  </p>
                )}
              </div>
            )}

            {/* Horímetro (serviço por hora em aberto) */}
            {needsHourmeter && (
              <div className="rounded-xl border border-produmar-200 dark:border-produmar-800/60 bg-produmar-50/50 dark:bg-produmar-950/20 p-4 space-y-2">
                <Label className="flex items-center gap-1.5 text-produmar-700 dark:text-produmar-400">
                  <Clock className="w-4 h-4" />
                  Horímetro
                </Label>
                {needsStart ? (
                  <>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      O horímetro inicial não foi informado no cadastro — informe
                      o inicial e o final.
                    </p>
                    <div>
                      <Label className="text-[11px] text-slate-500 dark:text-slate-400">
                        Horímetro inicial <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        value={hourmeterStart}
                        onChange={(e) => setHourmeterStart(sanitizeHourmeter(e.target.value))}
                        placeholder="ex: 1230,0"
                        inputMode="decimal"
                        autoComplete="off"
                        className="h-12 text-lg tabular-nums"
                      />
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Horímetro inicial:{" "}
                    <span className="font-semibold tabular-nums">
                      {startNum.toString().replace(".", ",")} h
                    </span>
                  </p>
                )}
                <Label className="text-[11px] text-slate-500 dark:text-slate-400">
                  Horímetro final <span className="text-red-500">*</span>
                </Label>
                <Input
                  value={hourmeterEnd}
                  onChange={(e) => setHourmeterEnd(sanitizeHourmeter(e.target.value))}
                  placeholder="ex: 1250,5"
                  inputMode="decimal"
                  autoComplete="off"
                  className="h-12 text-lg tabular-nums"
                />
                {hours > 0 && (
                  <p className="text-sm text-slate-600 dark:text-slate-300 tabular-nums">
                    {hours.toFixed(2).replace(".", ",")} h trabalhadas
                    {rate > 0 && (
                      <>
                        {" "}
                        × {formatBRL(rate)} ={" "}
                        <span className="font-bold text-produmar-700 dark:text-produmar-400">
                          {formatBRL(previewTotal)}
                        </span>
                      </>
                    )}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="received_by_input" className="text-base">
                Nome de quem recebeu <span className="text-red-500">*</span>
              </Label>
              <Input
                id="received_by_input"
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder="ex: JOÃO DA SILVA"
                className="h-14 text-lg uppercase placeholder:normal-case placeholder:lowercase"
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-base">
                Assinatura de quem recebeu
                {billingMode && isClient ? <span className="text-red-500"> *</span> : null}
              </Label>
              <SignaturePad onChange={setSignature} />
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {billingMode && isClient
                  ? "Obrigatória: toque em “Assinar” e entregue o celular para a pessoa assinar."
                  : "Toque em “Assinar” para abrir o quadro em tela cheia (opcional)."}
              </p>
            </div>

            {/* Localização automática — só informativo, não bloqueia nada */}
            <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              {gpsStatus === "ok"
                ? "Localização registrada automaticamente"
                : gpsStatus === "buscando"
                  ? "Buscando localização..."
                  : "Sem localização (GPS desligado ou sem permissão)"}
            </p>

            {error && (
              <p className="text-base text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2.5 rounded-lg border border-red-100 dark:border-red-900/40">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={isPending}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="bg-emerald-600 hover:bg-emerald-700 h-14 text-lg"
              >
                {isPending ? "Finalizando..." : "Finalizar OS"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
