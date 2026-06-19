"use client";

import { useEffect } from "react";
import { osBillingLabel, osStatusLabel, osTypeLabel } from "@/lib/utils";
import type {
  ServiceOrder,
  ServiceOrderAttachment,
  ServiceOrderForward,
  ServiceOrderItem,
  ServiceOrderTrip,
  ServiceOrderPause,
} from "@/lib/types";

type PrintOrder = ServiceOrder & {
  machines: {
    name: string;
    plate: string | null;
    type: string | null;
    tracking_type?: "hourmeter" | "km";
  } | null;
  pickup_locations: { name: string; address: string | null } | null;
  service_order_items: (ServiceOrderItem & { products: { name: string } | null })[];
  service_order_trips?: ServiceOrderTrip[];
  service_order_pauses?: ServiceOrderPause[];
  service_order_attachments?: ServiceOrderAttachment[];
  service_order_forwards?: ServiceOrderForward[];
};

interface Props {
  order: PrintOrder;
  /** Se verdadeiro, dispara window.print() automaticamente ao carregar */
  autoPrint?: boolean;
}

function formatBRL(n: number) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(s: string | null | undefined) {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}/${m}/${y}`;
}

function dec(n: number, places = 1) {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: places });
}

const STATUS_BADGE: Record<string, React.CSSProperties> = {
  pendente: { background: "#fef3c7", color: "#b45309" },
  em_andamento: { background: "#e0e7ff", color: "#4338ca" },
  entregue: { background: "#dcfce7", color: "#15803d" },
  cancelado: { background: "#f1f5f9", color: "#64748b" },
};

export function OrcamentoPrint({ order, autoPrint }: Props) {
  useEffect(() => {
    if (autoPrint) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [autoPrint]);

  const items = order.service_order_items ?? [];
  const isMaterial = order.type === "entrega_material";
  const isFrete = order.type === "frete";
  const isQuick = order.type === "servico_rapido";
  const isClient = order.freight_type === "cliente";

  const docLabel = isMaterial
    ? "Ordem de Entrega"
    : isFrete
      ? "Ordem de Frete"
      : isQuick
        ? "Ordem de Serviço Rápido"
        : "Ordem de Serviço";
  const typeLabel = osTypeLabel(order.type);

  const hourmeterDiff =
    order.hourmeter_start != null && order.hourmeter_end != null
      ? order.hourmeter_end - order.hourmeter_start
      : null;
  const kmDiff =
    order.km_start != null && order.km_end != null && order.km_end > order.km_start
      ? order.km_end - order.km_start
      : null;

  // Log das entregas do modo "por viagem": horário + quem recebeu + assinatura
  // colhida na hora de cada entrega (migration 020).
  const tripLog = (order.service_order_trips ?? [])
    .filter((t) => t.trip_time || t.received_by || t.signature)
    .sort((a, b) => a.trip_number - b.trip_number);
  const isViagemAssinada = order.billing_mode === "viagem" && tripLog.length > 0;

  // Diário de pausas/retomadas (serviço interno que durou vários dias).
  const pauseLog = (order.service_order_pauses ?? [])
    .slice()
    .sort((a, b) => a.pause_number - b.pause_number);
  const readingUnit = order.machines?.tracking_type === "km" ? "km" : "h";

  // ── Métricas operacionais (só o que existe) ────────────────────────────────
  const metrics: { label: string; value: string }[] = [];
  if (order.type === "prestacao_servico") {
    if (order.hourmeter_start != null)
      metrics.push({ label: "Horímetro inicial", value: `${dec(order.hourmeter_start)} h` });
    if (order.hourmeter_end != null)
      metrics.push({ label: "Horímetro final", value: `${dec(order.hourmeter_end)} h` });
    if (hourmeterDiff != null)
      metrics.push({ label: "Horas trabalhadas", value: `${dec(hourmeterDiff)} h` });
    if (order.hourly_rate != null)
      metrics.push({ label: "Valor da hora", value: `R$ ${formatBRL(order.hourly_rate)}` });
  }
  if (order.km_start != null) metrics.push({ label: "KM inicial", value: `${dec(order.km_start)} km` });
  if (order.km_end != null) metrics.push({ label: "KM final", value: `${dec(order.km_end)} km` });
  if (kmDiff != null) metrics.push({ label: "KM rodado", value: `${dec(kmDiff)} km` });
  if (order.billing_mode) {
    if (order.freight_value != null) {
      const lbl =
        order.billing_mode === "viagem"
          ? "Valor da viagem"
          : order.billing_mode === "km"
            ? "Valor do km"
            : "Valor da diária";
      metrics.push({ label: lbl, value: `R$ ${formatBRL(order.freight_value)}` });
    }
    if (order.billing_mode === "viagem" && order.trips_count != null)
      metrics.push({ label: "Viagens", value: String(order.trips_count) });
  }
  if (order.start_time)
    metrics.push({
      label: isMaterial || isFrete ? "Hora de saída" : "Início",
      value: order.start_time.slice(0, 5),
    });
  if (order.end_time)
    metrics.push({
      label: isMaterial || isFrete ? "Hora de chegada" : "Fim",
      value: order.end_time.slice(0, 5),
    });

  // ── Barra de meta-informação (frete não tem previsão) ──────────────────────
  const showDeliveryDate = order.status === "entregue" || !isFrete;
  const meta: { label: string; value: string }[] = [
    { label: "Emissão", value: formatDate(order.issue_date) },
  ];
  if (showDeliveryDate) {
    meta.push({
      label:
        order.status === "entregue"
          ? isMaterial || isFrete
            ? "Entregue em"
            : "Concluído em"
          : "Previsão",
      value: formatDate(order.delivery_date),
    });
  }
  meta.push({ label: "Tipo", value: typeLabel });
  if (order.billing_mode) meta.push({ label: "Cobrança", value: osBillingLabel(order.billing_mode) });
  meta.push({ label: "Status", value: osStatusLabel(order.status, order.type) });

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          html, body { background: white !important; }
          @page { size: A4; margin: 12mm; }
          .doc { box-shadow: none !important; margin: 0 !important; }
          .avoid-break { break-inside: avoid; }
        }
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; color: #0f172a; }
        .doc { background: white; }
        table { border-collapse: collapse; }
      `}</style>

      {/* Toolbar (hidden on print) */}
      <div className="no-print fixed top-0 inset-x-0 z-50 bg-produmar-700 text-white flex items-center justify-between px-6 py-3 shadow-lg">
        <span className="font-semibold text-sm">{docLabel}</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              // O comprovante abre em nova aba (window.open): fecha a aba. Se foi
              // navegação no mesmo separador (tem histórico), volta a página.
              if (window.history.length > 1) window.history.back();
              else window.close();
            }}
            className="text-sm opacity-80 hover:opacity-100 transition-opacity"
          >
            ← Voltar
          </button>
          <button
            onClick={() => window.print()}
            className="bg-white text-produmar-700 font-semibold text-sm px-4 py-1.5 rounded-lg shadow hover:bg-produmar-50 transition-colors"
          >
            🖨 Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      <div className="no-print h-14" />

      {/* Document */}
      <div className="doc max-w-[794px] mx-auto my-6 shadow-xl text-[12px] leading-relaxed text-slate-800">
        <div className="p-8 space-y-4">

          {/* ── Header ─────────────────────────────────────────────── */}
          <div className="flex items-start justify-between border-b-2 border-produmar-600 pb-4">
            <div>
              <h1 className="text-[26px] font-black text-produmar-700 tracking-tight leading-none">
                PRODUMAR
              </h1>
              <p className="text-[11px] text-slate-500 mt-1">
                Materiais de Construção, Frete e Serviços
              </p>
            </div>
            <div className="text-right">
              <p className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.15em]">
                {docLabel}
              </p>
              <span
                className="inline-block mt-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide"
                style={STATUS_BADGE[order.status]}
              >
                {osStatusLabel(order.status, order.type)}
              </span>
            </div>
          </div>

          {/* ── Meta bar ───────────────────────────────────────────── */}
          <div
            className="grid border border-slate-200 rounded-lg overflow-hidden avoid-break"
            style={{ gridTemplateColumns: `repeat(${meta.length}, minmax(0, 1fr))` }}
          >
            {meta.map((f, i) => (
              <div
                key={f.label}
                className={`px-3 py-2 ${i < meta.length - 1 ? "border-r border-slate-200" : ""}`}
              >
                <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wide">{f.label}</p>
                <p className="font-semibold text-slate-700 mt-0.5 text-[11px]">{f.value}</p>
              </div>
            ))}
          </div>

          {/* ── Counterpart + Serviço ──────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3 avoid-break">
            <div
              className={`rounded-lg border p-3 ${
                isClient ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"
              }`}
            >
              <p
                className={`text-[9px] font-bold uppercase tracking-wider mb-1.5 ${
                  isClient ? "text-emerald-700" : "text-amber-700"
                }`}
              >
                {isClient ? "Cliente" : "Consumo interno"}
              </p>
              {isClient ? (
                <div className="space-y-0.5 text-[11px]">
                  <p className="font-bold text-slate-800 text-[13px]">{order.client_name ?? "—"}</p>
                  {order.client_document && (
                    <p className="text-slate-600">CPF/CNPJ: {order.client_document}</p>
                  )}
                  {order.client_phone && <p className="text-slate-600">Tel: {order.client_phone}</p>}
                </div>
              ) : (
                <p className="text-[11px] text-amber-700 font-medium">
                  Uso interno — sem destinatário externo
                </p>
              )}
            </div>

            {/* Serviço (texto livre) ou descrição do serviço */}
            {(order.notes || order.service_description) && (
              <div className="rounded-lg border-2 border-produmar-200 bg-produmar-50/60 p-3">
                <p className="text-[9px] font-bold uppercase tracking-wider text-produmar-700 mb-1.5">
                  {order.notes ? "Serviço" : "Descrição do serviço"}
                </p>
                <p className="text-[12px] font-semibold text-slate-800 whitespace-pre-line">
                  {order.notes || order.service_description}
                </p>
                {order.notes && order.service_description && (
                  <p className="text-[11px] text-slate-600 mt-1">{order.service_description}</p>
                )}
              </div>
            )}

            {/* O que foi feito (preenchido no fechamento — serviço rápido) */}
            {order.completion_notes && (
              <div className="rounded-lg border-2 border-emerald-200 bg-emerald-50/60 p-3">
                <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 mb-1.5">
                  O que foi feito
                </p>
                <p className="text-[12px] font-semibold text-slate-800 whitespace-pre-line">
                  {order.completion_notes}
                </p>
              </div>
            )}

            {/* Encaminhamentos — de quem → para quem, quando e motivo. */}
            {(order.service_order_forwards?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3">
                <p className="text-[9px] font-bold uppercase tracking-wider text-sky-700 mb-1.5">
                  Encaminhamentos
                </p>
                <ul className="text-[11px] text-slate-700 space-y-0.5">
                  {order.service_order_forwards!.map((f) => (
                    <li key={f.id}>
                      <span className="font-semibold">{f.from_name ?? "—"}</span> →{" "}
                      <span className="font-semibold">{f.to_name ?? "—"}</span>
                      <span className="text-slate-400">
                        {" "}· {new Date(f.created_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {f.note ? <span className="text-slate-600"> — {f.note}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Comprovantes anexados (nomes — os arquivos abrem no sistema) */}
            {(order.service_order_attachments?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Comprovantes anexados ({order.service_order_attachments!.length})
                </p>
                <ul className="text-[11px] text-slate-700 list-disc pl-4 space-y-0.5">
                  {order.service_order_attachments!.map((a) => (
                    <li key={a.id}>{a.file_name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ── Logística (máquina / origem / destino) ─────────────── */}
          {(order.machines ||
            order.pickup_locations ||
            order.origin_address ||
            order.delivery_address) && (
            <div className="grid grid-cols-3 gap-3 text-[11px] avoid-break">
              {order.machines && (
                <Field label="Máquina / Veículo">
                  {order.machines.name}
                  {order.machines.plate ? ` — ${order.machines.plate}` : ""}
                </Field>
              )}
              {order.origin_address ? (
                <Field label="De onde">{order.origin_address}</Field>
              ) : (
                order.pickup_locations && (
                  <Field label="Local de retirada">
                    {order.pickup_locations.name}
                    {order.pickup_locations.address && (
                      <span className="block text-slate-400 font-normal">
                        {order.pickup_locations.address}
                      </span>
                    )}
                  </Field>
                )
              )}
              {order.delivery_address && (
                <Field
                  label={
                    isFrete
                      ? "Onde foi entregue"
                      : isMaterial
                        ? "Local de entrega"
                        : "Local do serviço"
                  }
                >
                  {order.delivery_address}
                </Field>
              )}
            </div>
          )}

          {/* ── Métricas operacionais ──────────────────────────────── */}
          {metrics.length > 0 && (
            <div className="rounded-lg border border-slate-200 p-3 avoid-break">
              <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wide mb-2">
                {isFrete ? `Frete — ${osBillingLabel(order.billing_mode)}` : "Medição"}
              </p>
              <div className="grid grid-cols-4 gap-y-2 gap-x-3">
                {metrics.map((m) => (
                  <div key={m.label}>
                    <p className="text-[9px] text-slate-400">{m.label}</p>
                    <p className="font-bold text-slate-700 tabular-nums text-[12px]">{m.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Entregas por viagem (rota + quem recebeu + assinatura) ── */}
          {tripLog.length > 0 && (
            <div className="rounded-lg border border-slate-200 overflow-hidden avoid-break">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-500">
                    <th className="text-left px-3 py-1.5 font-bold uppercase tracking-wide w-10">Nº</th>
                    <th className="text-left px-3 py-1.5 font-bold uppercase tracking-wide">Rota (de → para)</th>
                    <th className="text-left px-3 py-1.5 font-bold uppercase tracking-wide w-24">Recebido por</th>
                    <th className="text-left px-3 py-1.5 font-bold uppercase tracking-wide w-32">Assinatura</th>
                  </tr>
                </thead>
                <tbody>
                  {tripLog.map((t) => (
                    <tr key={t.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-1.5 font-bold text-slate-600 tabular-nums">{t.trip_number}ª</td>
                      <td className="px-3 py-1.5 text-slate-700">
                        <span className="font-semibold">
                          {t.origin ? `${t.origin} → ` : ""}
                          {t.destination ?? "—"}
                        </span>
                        <span className="block text-[9px] text-slate-400 tabular-nums">
                          {t.start_time ? `saída ${t.start_time.slice(0, 5)} · ` : ""}
                          {t.trip_time ? `entrega ${t.trip_time.slice(0, 5)}` : ""}
                          {t.latitude != null && t.longitude != null && (
                            <a
                              href={`https://maps.google.com/?q=${t.latitude},${t.longitude}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-produmar-700 underline ml-1"
                            >
                              ver mapa
                            </a>
                          )}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-semibold text-slate-700">
                        {t.received_by ?? "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        {t.signature ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={t.signature} alt={`Assinatura da ${t.trip_number}ª viagem`} className="h-7 object-contain" />
                        ) : (
                          <span className="text-[9px] font-bold text-amber-600 uppercase">Não assinada</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Diário de trabalho (pausas e retomadas do serviço) ───── */}
          {pauseLog.length > 0 && (
            <div className="rounded-lg border border-slate-200 overflow-hidden avoid-break">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-500">
                    <th className="text-left px-3 py-1.5 font-bold uppercase tracking-wide w-32">Pausa</th>
                    <th className="text-left px-3 py-1.5 font-bold uppercase tracking-wide w-32">Retomada</th>
                    <th className="text-left px-3 py-1.5 font-bold uppercase tracking-wide">Observação do dia</th>
                  </tr>
                </thead>
                <tbody>
                  {pauseLog.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-1.5 text-slate-700 tabular-nums">
                        <span className="font-semibold">
                          {formatDate(p.pause_date)}
                          {p.pause_time ? ` ${p.pause_time.slice(0, 5)}` : ""}
                        </span>
                        {p.pause_reading != null && (
                          <span className="block text-slate-500">
                            {dec(p.pause_reading)} {readingUnit}
                          </span>
                        )}
                        {p.latitude != null && p.longitude != null && (
                          <a
                            href={`https://maps.google.com/?q=${p.latitude},${p.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-[9px] text-produmar-700 underline"
                          >
                            ver mapa
                          </a>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700 tabular-nums">
                        {p.resume_time ? (
                          <>
                            <span className="font-semibold">
                              {formatDate(p.resume_date)} {p.resume_time.slice(0, 5)}
                            </span>
                            {p.resume_reading != null && (
                              <span className="block text-slate-500">
                                {dec(p.resume_reading)} {readingUnit}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-[9px] font-bold text-amber-600 uppercase">
                            Não retomada
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700 whitespace-pre-line">
                        {p.pause_notes ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Itens ──────────────────────────────────────────────── */}
          <div className="avoid-break">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-produmar-700 text-white">
                  <th className="text-left px-3 py-2 rounded-tl-md font-semibold">
                    {isMaterial ? "Material" : isFrete ? "Frete" : "Item / Serviço"}
                  </th>
                  <th className="text-right px-3 py-2 font-semibold w-16">Qtd</th>
                  <th className="text-center px-3 py-2 font-semibold w-16">Un.</th>
                  <th className="text-right px-3 py-2 font-semibold w-24">Vl. unit.</th>
                  <th className="text-right px-3 py-2 rounded-tr-md font-semibold w-28">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-3 text-center text-slate-400 border-b border-slate-100">
                      Sem itens lançados
                    </td>
                  </tr>
                )}
                {items.map((it, i) => (
                  <tr key={it.id} className={i % 2 === 0 ? "" : "bg-slate-50"}>
                    <td className="px-3 py-2 font-medium text-slate-700 border-b border-slate-100">
                      {it.products?.name ?? it.description ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600 border-b border-slate-100">
                      {dec(it.quantity, 3)}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-500 border-b border-slate-100">
                      {it.unit ?? ""}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600 border-b border-slate-100">
                      R$ {formatBRL(it.unit_price)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-700 border-b border-slate-100">
                      R$ {formatBRL(it.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Total */}
            <div className="flex justify-end mt-2">
              <div
                className={`rounded-lg px-5 py-2.5 text-right ${
                  isClient ? "bg-emerald-600" : "bg-amber-600"
                }`}
              >
                <p className="text-[9px] text-white/80 uppercase font-bold tracking-wide">Valor total</p>
                <p className="text-[20px] font-black text-white tabular-nums leading-none mt-0.5">
                  R$ {formatBRL(order.total_amount)}
                </p>
              </div>
            </div>
          </div>

          {/* ── GPS (informativo) ──────────────────────────────────── */}
          {order.end_latitude != null && order.end_longitude != null && (
            <p className="text-[10px] text-slate-500 avoid-break">
              <span className="font-semibold text-slate-600">Local da finalização (GPS): </span>
              {Number(order.end_latitude).toFixed(6)}, {Number(order.end_longitude).toFixed(6)}
              {order.end_location_accuracy != null && (
                <span className="text-slate-400"> (±{Math.round(Number(order.end_location_accuracy))} m)</span>
              )}
              <a
                href={`https://maps.google.com/?q=${order.end_latitude},${order.end_longitude}`}
                target="_blank"
                rel="noreferrer"
                className="no-print ml-2 text-produmar-700 underline"
              >
                Ver no mapa
              </a>
            </p>
          )}

          {/* ── Assinatura / Recebimento ───────────────────────────── */}
          <div className="border-t border-slate-200 pt-4 avoid-break">
            {isViagemAssinada ? (
              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <p>
                  <span className="font-semibold text-slate-600">Recebimento: </span>
                  cada viagem foi assinada na entrega — ver tabela de viagens acima.
                </p>
                {order.status === "entregue" && (
                  <p>Data: {formatDate(order.delivery_date)}</p>
                )}
              </div>
            ) : order.received_by ? (
              <div className="flex items-end justify-between gap-6">
                <div>
                  {order.signature && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={order.signature} alt="Assinatura" className="h-14 object-contain mb-1" />
                  )}
                  <div className="border-t border-slate-400 w-56 pt-1">
                    <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wide">
                      Recebido por
                    </p>
                    <p className="font-semibold text-slate-700 text-[12px]">{order.received_by}</p>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">Data: {formatDate(order.delivery_date)}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-10 text-[10px] text-slate-500 pt-6">
                <div className="border-t border-dashed border-slate-400 pt-1">
                  Assinatura / Nome do recebedor
                </div>
                <div className="border-t border-dashed border-slate-400 pt-1">Data de recebimento</div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 pt-2 text-[9px] text-slate-400 text-center">
            Documento gerado em{" "}
            {new Date().toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            — PRODUMAR — {docLabel}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 rounded-lg p-2.5">
      <p className="text-[9px] text-slate-400 uppercase font-bold tracking-wide mb-0.5">{label}</p>
      <p className="font-semibold text-slate-700 leading-snug">{children}</p>
    </div>
  );
}
