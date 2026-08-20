"use client";

import { useEffect, useState, useTransition } from "react";
import { PlayCircle, Clock, Gauge, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resumeServiceOrder } from "@/app/(app)/operacoes/actions";
import { formatHourmeter } from "@/lib/utils";
import type { ServiceOrder, ServiceOrderPause } from "@/lib/types";

type OrderDetails = ServiceOrder & {
  machines: { name: string; plate: string | null; tracking_type?: string | null } | null;
};

interface Props {
  order: OrderDetails;
  /** Pausa em aberto a ser retomada (referência da leitura/hora de quando pausou). */
  openPause: ServiceOrderPause;
  open: boolean;
  onClose: () => void;
  onResumed: () => void;
}

// km/horímetro: dígitos + uma vírgula com 1 casa no máximo (vírgula manual).
function sanitizeReading(raw: string): string {
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

function nowYYYYMMDD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function fmtReading(n: number): string {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function fmtDate(s: string | null): string {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return d && m && y ? `${d}/${m}` : s;
}

/**
 * Retomada de serviço (dia seguinte): o técnico volta a trabalhar e anota a
 * hora de início e a leitura (km/horímetro) ao retomar.
 */
export function ResumeDialog({ order, openPause, open, onClose, onResumed }: Props) {
  const hasMachine = order.machine_id != null && !!order.machines;
  const tracksKm = order.machines?.tracking_type === "km";

  const [reading, setReading] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setReading("");
    setTime(nowHHMM());
    setError(null);
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const readingNum = parseFloat(reading.replace(",", "."));
    if (hasMachine && (!reading.trim() || isNaN(readingNum))) {
      setError(
        tracksKm
          ? "Anote o KM que está no painel do veículo"
          : "Anote o horímetro da máquina"
      );
      return;
    }
    if (!time.trim()) {
      setError("Informe a hora de início");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await resumeServiceOrder(order.id, {
        resumeDate: nowYYYYMMDD(),
        resumeTime: time,
        reading: hasMachine ? readingNum : null,
      });
      if (result && "error" in result) {
        setError(result.error ?? "Não foi possível continuar. Tente de novo.");
      } else {
        onResumed();
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
            Continuar serviço — OS #{order.order_number}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Referência de quando pausou */}
          <p className="text-base text-slate-600 dark:text-slate-300 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-lg px-3 py-2.5">
            Pausado{openPause.pause_date ? ` em ${fmtDate(openPause.pause_date)}` : ""}
            {openPause.pause_time ? ` às ${openPause.pause_time.slice(0, 5)}` : ""}
            {hasMachine && openPause.pause_reading != null && (
              <>
                {" "}
                com{" "}
                <span className="font-bold tabular-nums">
                  {fmtReading(openPause.pause_reading)} {tracksKm ? "km" : "h"}
                </span>
              </>
            )}
          </p>

          {hasMachine && (
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
                onChange={(e) =>
                  setReading(tracksKm ? sanitizeReading(e.target.value) : formatHourmeter(e.target.value))
                }
                placeholder={tracksKm ? "ex: 154300" : "ex: 1230,5"}
                inputMode="decimal"
                autoComplete="off"
                className="h-16 text-3xl text-center font-bold tabular-nums"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5 text-produmar-600" />
              Hora de início
            </Label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="h-16 text-3xl text-center font-bold tabular-nums"
            />
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
                  Continuando...
                </>
              ) : (
                <>
                  <PlayCircle className="w-6 h-6" />
                  CONTINUAR AGORA
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
