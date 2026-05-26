"use client";

import { useEffect } from "react";
import { osStatusLabel } from "@/lib/utils";
import type { ServiceOrder, ServiceOrderItem } from "@/lib/types";

type PrintOrder = ServiceOrder & {
  machines: {
    name: string;
    plate: string | null;
    type: string | null;
    tracking_type?: "hourmeter" | "km";
  } | null;
  pickup_locations: { name: string; address: string | null } | null;
  service_order_items: ServiceOrderItem[];
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


export function OrcamentoPrint({ order, autoPrint }: Props) {
  useEffect(() => {
    if (autoPrint) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [autoPrint]);

  const items = order.service_order_items ?? [];
  const isMaterial = order.type === "entrega_material";
  const isClient   = order.freight_type === "cliente";

  const hourmeterDiff =
    order.type === "prestacao_servico" &&
    order.hourmeter_start != null &&
    order.hourmeter_end   != null
      ? (order.hourmeter_end - order.hourmeter_start).toFixed(1).replace(".", ",")
      : null;

  return (
    <>
      {/* ── Print-specific global styles ─────────────────────────────── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { size: A4; margin: 1.5cm; }
        }
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; }
        .doc { background: white; }
      `}</style>

      {/* ── Toolbar (hidden on print) ──────────────────────────────────── */}
      <div className="no-print fixed top-0 inset-x-0 z-50 bg-produmar-700 text-white flex items-center justify-between px-6 py-3 shadow-lg">
        <span className="font-semibold text-sm">
          Ordem de Serviço #{order.order_number}
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.history.back()}
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

      {/* ── Document ──────────────────────────────────────────────────── */}
      <div className="no-print pt-14" />
      <div
        className="doc max-w-[794px] mx-auto my-6 print:my-0 shadow-xl print:shadow-none"
        style={{ minHeight: "1123px" }}
      >
        {/* Header */}
        <div className="border-b-4 border-produmar-600 px-10 pt-8 pb-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-extrabold text-produmar-700 tracking-tight">
                PRODUMAR
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Materiais de Construção e Serviços
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                {isMaterial ? "Ordem de Entrega" : "Ordem de Serviço"}
              </p>
              <p className="text-3xl font-black text-produmar-700 tabular-nums mt-0.5">
                #{String(order.order_number).padStart(4, "0")}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-10 py-6 space-y-5">

          {/* Info bar */}
          <div className="grid grid-cols-4 gap-0 border border-slate-200 rounded-lg overflow-hidden text-xs">
            {[
              { label: "Emissão",   value: formatDate(order.issue_date) },
              { label: "Entrega",   value: formatDate(order.delivery_date) },
              { label: "Tipo",      value: isMaterial ? "Entrega de material" : "Prestação de serviço" },
              { label: "Status",    value: osStatusLabel(order.status, order.type) },
            ].map((f) => (
              <div key={f.label} className="px-3 py-2.5 border-r last:border-r-0 border-slate-200">
                <p className="text-[10px] text-slate-400 uppercase font-semibold">{f.label}</p>
                <p className="font-semibold text-slate-700 mt-0.5">{f.value}</p>
              </div>
            ))}
          </div>

          {/* Counterpart (client or internal) */}
          <div className={`rounded-lg border p-4 ${
            isClient
              ? "bg-emerald-50 border-emerald-200"
              : "bg-amber-50 border-amber-200"
          }`}>
            <p className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${
              isClient ? "text-emerald-600" : "text-amber-600"
            }`}>
              {isClient ? "Dados do Cliente" : "Consumo Interno"}
            </p>
            {isClient ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <Row label="Nome" value={order.client_name ?? "—"} />
                <Row label="CPF/CNPJ" value={order.client_document ?? "—"} />
                <Row label="Telefone" value={order.client_phone ?? "—"} />
                {order.delivery_address && (
                  <Row label="End. de entrega" value={order.delivery_address} full />
                )}
              </div>
            ) : (
              <p className="text-sm text-amber-700 font-medium">
                Uso interno — sem destinatário externo
              </p>
            )}
          </div>

          {/* Machine + Pickup */}
          {(order.machines || order.pickup_locations) && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              {order.machines && (
                <div className="border border-slate-200 rounded-lg p-3">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">
                    Máquina / Veículo
                  </p>
                  <p className="font-semibold text-slate-700">
                    {order.machines.name}
                    {order.machines.plate ? ` — ${order.machines.plate}` : ""}
                  </p>
                  {order.machines.type && (
                    <p className="text-slate-400 mt-0.5">{order.machines.type}</p>
                  )}
                </div>
              )}
              {order.pickup_locations && (
                <div className="border border-slate-200 rounded-lg p-3">
                  <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">
                    Local de Retirada
                  </p>
                  <p className="font-semibold text-slate-700">{order.pickup_locations.name}</p>
                  {order.pickup_locations.address && (
                    <p className="text-slate-400 mt-0.5">{order.pickup_locations.address}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Hourmeter (prestacao_servico only) */}
          {order.type === "prestacao_servico" &&
            (order.hourmeter_start != null || order.hourmeter_end != null) && (
            <div className="border border-slate-200 rounded-lg p-3 text-xs">
              <p className="text-[10px] text-slate-400 uppercase font-semibold mb-2">Horímetro</p>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <p className="text-slate-400">Inicial</p>
                  <p className="font-semibold text-slate-700 tabular-nums">
                    {order.hourmeter_start?.toString().replace(".", ",") ?? "—"} h
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">Final</p>
                  <p className="font-semibold text-slate-700 tabular-nums">
                    {order.hourmeter_end?.toString().replace(".", ",") ?? "—"} h
                  </p>
                </div>
                {hourmeterDiff && (
                  <div>
                    <p className="text-slate-400">Total trabalhado</p>
                    <p className="font-bold text-produmar-700 tabular-nums">{hourmeterDiff} h</p>
                  </div>
                )}
                {order.hourly_rate != null && (
                  <div>
                    <p className="text-slate-400">Valor da hora</p>
                    <p className="font-bold text-produmar-700 tabular-nums">
                      R$ {formatBRL(order.hourly_rate)}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* KM (hodômetro) */}
          {(order.km_start != null || order.km_end != null) && (
            <div className="border border-slate-200 rounded-lg p-3 text-xs">
              <p className="text-[10px] text-slate-400 uppercase font-semibold mb-2">Hodômetro</p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-slate-400">KM inicial</p>
                  <p className="font-semibold text-slate-700 tabular-nums">
                    {order.km_start?.toString().replace(".", ",") ?? "—"} km
                  </p>
                </div>
                <div>
                  <p className="text-slate-400">KM final</p>
                  <p className="font-semibold text-slate-700 tabular-nums">
                    {order.km_end?.toString().replace(".", ",") ?? "—"} km
                  </p>
                </div>
                {order.km_start != null && order.km_end != null && order.km_end > order.km_start && (
                  <div>
                    <p className="text-slate-400">Total rodado</p>
                    <p className="font-bold text-produmar-700 tabular-nums">
                      {(order.km_end - order.km_start).toFixed(1).replace(".", ",")} km
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Service description */}
          {order.service_description && (
            <div className="text-xs">
              <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">
                Descrição do Serviço
              </p>
              <p className="text-slate-700">{order.service_description}</p>
            </div>
          )}

          {/* Items table */}
          <div>
            <p className="text-[10px] text-slate-400 uppercase font-semibold mb-2">
              {isMaterial ? "Materiais" : "Itens / Serviços"}
            </p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-600">
                  <th className="text-left px-3 py-2 rounded-tl-lg">Descrição</th>
                  <th className="text-right px-3 py-2">Qtd</th>
                  <th className="text-center px-3 py-2">Un.</th>
                  <th className="text-right px-3 py-2">Vl. Unit.</th>
                  <th className="text-right px-3 py-2 rounded-tr-lg">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr
                    key={it.id}
                    className={`border-b border-slate-100 ${
                      i % 2 === 0 ? "" : "bg-slate-50/60"
                    }`}
                  >
                    <td className="px-3 py-2 font-medium text-slate-700">
                      {it.description ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {it.quantity.toString().replace(".", ",")}
                    </td>
                    <td className="px-3 py-2 text-center text-slate-500">{it.unit ?? ""}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      R$ {formatBRL(it.unit_price)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-700">
                      R$ {formatBRL(it.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Total */}
            <div className="flex justify-end mt-2">
              <div className={`rounded-lg px-5 py-3 text-right ${
                isClient
                  ? "bg-emerald-600"
                  : "bg-amber-600"
              }`}>
                <p className="text-[10px] text-white/80 uppercase font-semibold">Valor Total</p>
                <p className="text-xl font-black text-white tabular-nums mt-0.5">
                  R$ {formatBRL(order.total_amount)}
                </p>
              </div>
            </div>
          </div>

          {/* Notes */}
          {order.notes && (
            <div className="text-xs border-t border-slate-100 pt-4">
              <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Observações</p>
              <p className="text-slate-600">{order.notes}</p>
            </div>
          )}

          {/* Signature / Received by */}
          <div className="border-t border-slate-200 pt-5 mt-4">
            {order.received_by ? (
              <div className="text-xs">
                <p className="text-[10px] text-slate-400 uppercase font-semibold mb-1">
                  Recebido por
                </p>
                <p className="font-semibold text-slate-700 text-sm">{order.received_by}</p>
                <p className="text-slate-400 mt-0.5">Data: {formatDate(order.delivery_date)}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-8 text-xs text-slate-500">
                <div>
                  <div className="h-10 border-b border-dashed border-slate-400 mb-1" />
                  <p>Assinatura / Nome do recebedor</p>
                </div>
                <div>
                  <div className="h-10 border-b border-dashed border-slate-400 mb-1" />
                  <p>Data de recebimento</p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 pt-3 text-[10px] text-slate-400 text-center">
            Documento gerado em {new Date().toLocaleDateString("pt-BR", {
              day: "2-digit", month: "long", year: "numeric",
              hour: "2-digit", minute: "2-digit",
            })} — PRODUMAR — OS #{String(order.order_number).padStart(4, "0")}
          </div>

        </div>
      </div>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Row({
  label,
  value,
  full,
}: {
  label: string;
  value: string;
  full?: boolean;
}) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <span className="text-[10px] text-slate-400 block">{label}</span>
      <span className="font-semibold text-slate-700">{value || "—"}</span>
    </div>
  );
}
