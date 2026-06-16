"use client";

import { useEffect, useState, useTransition } from "react";
import { Clock, Gauge, PlayCircle, Loader2, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startServiceOrder } from "@/app/(app)/operacoes/actions";
import type { ServiceOrder } from "@/lib/types";

type OrderDetails = ServiceOrder & {
  machines: { name: string; plate: string | null; tracking_type?: string | null } | null;
};

interface Props {
  order: OrderDetails;
  open: boolean;
  onClose: () => void;
  onStarted: (orderId: string) => void;
  /** Último km conhecido deste veículo (da OS mais recente com km anotado). */
  lastKm?: number | null;
}

// KM do veículo: dígitos + uma vírgula com 1 casa no máximo.
// Converte ponto em vírgula (teclado de celular costuma enviar ".").
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

/**
 * Início de OS por viagem/diária: o técnico anota o KM do veículo e a hora
 * de saída/início. Campos grandes, pensados para celular e baixa visão.
 */
export function StartOSDialog({ order, open, onClose, onStarted, lastKm }: Props) {
  const [reading, setReading]     = useState("");
  const [time, setTime]           = useState("");
  const [origin, setOrigin]       = useState("");
  const [error, setError]         = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDiaria  = order.billing_mode === "diaria";
  const isViagem  = order.billing_mode === "viagem";
  const isService = order.type === "prestacao_servico";
  // O que o operador anota na saída: frete é sempre km (caminhão/caçamba);
  // serviço segue a medição da máquina (km = hodômetro, senão horímetro).
  const tracksKm = !!order.billing_mode || order.machines?.tracking_type === "km";
  const startTitle = isService
    ? "Iniciar serviço"
    : isDiaria
      ? "Iniciar diária"
      : isViagem
        ? "Iniciar viagem"
        : "Iniciar saída";
  // "De onde" é da OS inteira na diária e no km do frete; no modo viagem cada
  // viagem tem o seu próprio "de onde". Serviço não pergunta origem.
  const showOrigin = isDiaria || order.billing_mode === "km";

  // Pré-preenche a hora com agora toda vez que abre
  useEffect(() => {
    if (open) {
      setReading("");
      setTime(nowHHMM());
      setOrigin("");
      setError(null);
    }
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const readingNum = parseFloat(reading.replace(",", "."));
    if (!reading.trim() || isNaN(readingNum)) {
      setError(
        tracksKm
          ? "Anote o KM que está no painel do veículo"
          : "Anote o horímetro da máquina"
      );
      return;
    }
    if (!time.trim()) {
      setError("Informe a hora");
      return;
    }
    if (showOrigin && !origin.trim()) {
      setError("Escreva de onde você vai sair");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await startServiceOrder(order.id, {
        kmStart: tracksKm ? readingNum : null,
        hourmeterStart: tracksKm ? null : readingNum,
        startTime: time,
        origin: showOrigin ? origin.trim() || null : null,
      });
      if (result && "error" in result) {
        setError(result.error ?? "Erro ao iniciar");
      } else {
        onStarted(order.id);
        onClose();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl dark:text-slate-100">
            <PlayCircle className="w-6 h-6 text-produmar-600" />
            {startTitle} — OS #{order.order_number}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {order.machines && (
            <p className="text-base text-slate-600 dark:text-slate-300">
              Veículo:{" "}
              <span className="font-semibold">
                {order.machines.name}
                {order.machines.plate ? ` — ${order.machines.plate}` : ""}
              </span>
            </p>
          )}

          <div className="space-y-2">
            <Label className="text-base font-semibold flex items-center gap-2">
              {tracksKm ? (
                <><Gauge className="w-5 h-5 text-produmar-600" />KM do veículo agora</>
              ) : (
                <><Clock className="w-5 h-5 text-produmar-600" />Horímetro da máquina agora</>
              )}
            </Label>
            <Input
              value={reading}
              onChange={(e) => setReading(sanitizeKm(e.target.value))}
              placeholder={tracksKm ? "ex: 154300" : "ex: 1230,5"}
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              className="h-16 text-3xl text-center font-bold tabular-nums"
            />
            {tracksKm && lastKm != null && (
              <button
                type="button"
                onClick={() => setReading(String(lastKm).replace(".", ","))}
                className="w-full h-12 rounded-xl border-2 border-dashed border-produmar-300 dark:border-produmar-700 text-produmar-700 dark:text-produmar-300 font-semibold text-base active:bg-produmar-50 dark:active:bg-produmar-950/30 transition-colors tabular-nums"
              >
                Usar último km: {lastKm.toLocaleString("pt-BR")}
              </button>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5 text-produmar-600" />
              {isDiaria || isService ? "Hora de início" : "Hora de saída"}
            </Label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="h-16 text-3xl text-center font-bold tabular-nums"
            />
          </div>

          {showOrigin && (
            <div className="space-y-2">
              <Label className="text-base font-semibold flex items-center gap-2">
                <MapPin className="w-5 h-5 text-produmar-600" />
                De onde você vai sair?
              </Label>
              <Input
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="ex: PEDREIRA NORTE"
                className="h-14 text-lg uppercase placeholder:normal-case placeholder:lowercase"
                autoComplete="off"
              />
            </div>
          )}

          {error && (
            <p className="text-base text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2.5 rounded-lg border border-red-100 dark:border-red-900/40">
              {error}
            </p>
          )}

          <div className="grid gap-2">
            <Button type="submit" disabled={isPending} className="h-16 text-xl gap-2">
              {isPending ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Iniciando...
                </>
              ) : (
                <>
                  <PlayCircle className="w-6 h-6" />
                  COMEÇAR AGORA
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-12 text-base"
              onClick={onClose}
              disabled={isPending}
            >
              Voltar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
