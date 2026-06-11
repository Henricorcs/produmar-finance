"use client";

import { useEffect, useState, useTransition } from "react";
import { Clock, Gauge, PlayCircle, Loader2 } from "lucide-react";
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
  machines: { name: string; plate: string | null } | null;
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
  const [km, setKm]               = useState("");
  const [time, setTime]           = useState("");
  const [error, setError]         = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isDiaria = order.billing_mode === "diaria";
  const isViagem = order.billing_mode === "viagem";
  const startTitle = isDiaria ? "Iniciar diária" : isViagem ? "Iniciar viagem" : "Iniciar saída";

  // Pré-preenche a hora com agora toda vez que abre
  useEffect(() => {
    if (open) {
      setKm("");
      setTime(nowHHMM());
      setError(null);
    }
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const kmNum = parseFloat(km.replace(",", "."));
    if (!km.trim() || isNaN(kmNum)) {
      setError("Anote o KM que está no painel do veículo");
      return;
    }
    if (!time.trim()) {
      setError("Informe a hora");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await startServiceOrder(order.id, {
        kmStart: kmNum,
        startTime: time,
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
              <Gauge className="w-5 h-5 text-produmar-600" />
              KM do veículo agora
            </Label>
            <Input
              value={km}
              onChange={(e) => setKm(sanitizeKm(e.target.value))}
              placeholder="ex: 154300"
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              className="h-16 text-3xl text-center font-bold tabular-nums"
            />
            {lastKm != null && (
              <button
                type="button"
                onClick={() => setKm(String(lastKm).replace(".", ","))}
                className="w-full h-12 rounded-xl border-2 border-dashed border-produmar-300 dark:border-produmar-700 text-produmar-700 dark:text-produmar-300 font-semibold text-base active:bg-produmar-50 dark:active:bg-produmar-950/30 transition-colors tabular-nums"
              >
                Usar último km: {lastKm.toLocaleString("pt-BR")}
              </button>
            )}
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Copie o número que aparece no painel do veículo
              {lastKm != null ? " ou toque no botão acima" : ""}.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5 text-produmar-600" />
              {isDiaria ? "Hora de início" : "Hora de saída"}
            </Label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="h-16 text-3xl text-center font-bold tabular-nums"
            />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Já preenchemos com a hora de agora — só mude se precisar.
            </p>
          </div>

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
