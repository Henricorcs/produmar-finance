"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Printer, Clock, Package, MapPin, Navigation } from "lucide-react";
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
import type { ServiceOrder, ServiceOrderItem } from "@/lib/types";

type OrderDetails = ServiceOrder & {
  machines: { name: string; plate: string | null; tracking_type?: string | null } | null;
  pickup_locations?: { name: string } | null;
  service_order_items?: (ServiceOrderItem & { products: { name: string } | null })[];
};

interface Props {
  order: OrderDetails;
  open: boolean;
  onClose: () => void;
  onFinalized: (orderId: string) => void;
}

// Horímetro: vírgula automática na última casa (1 decimal).
// O usuário digita só números e a última posição é sempre o decimal.
// ex: "8310" → "831,0" ; "83105" → "8310,5"
function formatHourmeter(raw: string): string {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return "";
  const padded = digits.padStart(2, "0");
  return padded.slice(0, -1) + "," + padded.slice(-1);
}

export function FinalizeOSDialog({ order, open, onClose, onFinalized }: Props) {
  const [receivedBy, setReceivedBy]   = useState("");
  const [hourmeterStart, setHourmeterStart] = useState("");
  const [hourmeterEnd, setHourmeterEnd] = useState("");
  const [error, setError]             = useState<string | null>(null);
  const [done, setDone]               = useState(false);
  const [signature, setSignature]     = useState<string | null>(null);
  const [isPending, startTransition]  = useTransition();

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

  const materials = (order.service_order_items ?? [])
    .filter((it) => it.product_id || it.description)
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
    setSignature(null);
    setError(null);
    setDone(false);
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!receivedBy.trim()) {
      setError("Informe o nome de quem recebeu");
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
    setError(null);
    startTransition(async () => {
      const result = await finalizeServiceOrder(order.id, receivedBy, {
        signature,
        hourmeterStart: needsStart ? startNum : null,
        hourmeterEnd: needsHourmeter ? endNum : null,
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
          <DialogTitle className="dark:text-slate-100">
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
                {order.type === "entrega_material" ? "Entrega de material" : "Prestação de serviço"}
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
                        onChange={(e) => setHourmeterStart(formatHourmeter(e.target.value))}
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
                  onChange={(e) => setHourmeterEnd(formatHourmeter(e.target.value))}
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
              <Label htmlFor="received_by_input">
                Nome de quem recebeu <span className="text-red-500">*</span>
              </Label>
              <Input
                id="received_by_input"
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder="ex: JOÃO DA SILVA"
                className="h-12 uppercase placeholder:normal-case placeholder:lowercase"
                autoComplete="off"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Assinatura de quem recebeu</Label>
              <SignaturePad onChange={setSignature} />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Toque em “Assinar” para abrir o quadro em tela cheia (opcional).
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg border border-red-100 dark:border-red-900/40">
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
                className="bg-emerald-600 hover:bg-emerald-700 h-12"
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
