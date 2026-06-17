"use client";

import { useEffect, useState, useTransition } from "react";
import { PauseCircle, Clock, Gauge, MapPin, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { pauseServiceOrder } from "@/app/(app)/operacoes/actions";
import type { ServiceOrder } from "@/lib/types";

type OrderDetails = ServiceOrder & {
  machines: { name: string; plate: string | null; tracking_type?: string | null } | null;
};

interface Props {
  order: OrderDetails;
  open: boolean;
  onClose: () => void;
  onPaused: () => void;
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

/**
 * Pausa de serviço (fim do expediente): o técnico anota a hora, a leitura do
 * veículo/máquina (km/horímetro) e uma observação do dia. A localização (GPS) é
 * capturada automaticamente ao abrir. Campos grandes, pensados para celular e
 * baixa visão.
 */
export function PauseDialog({ order, open, onClose, onPaused }: Props) {
  const hasMachine = order.machine_id != null && !!order.machines;
  const tracksKm = order.machines?.tracking_type === "km";

  const [reading, setReading] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Localização automática (GPS do celular) — capturada ao abrir, sem o técnico
  // fazer nada. Best-effort: sem GPS, pausa igual.
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"buscando" | "ok" | "erro">("buscando");

  useEffect(() => {
    if (!open) return;
    setReading("");
    setTime(nowHHMM());
    setNotes("");
    setError(null);
    setGps(null);
    setGpsStatus("buscando");
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
      setError("Informe a hora da pausa");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await pauseServiceOrder(order.id, {
        pauseDate: nowYYYYMMDD(),
        pauseTime: time,
        reading: hasMachine ? readingNum : null,
        notes: notes.trim() || null,
        latitude: gps?.lat ?? null,
        longitude: gps?.lng ?? null,
        locationAccuracy: gps?.accuracy ?? null,
      });
      if (result && "error" in result) {
        setError(result.error ?? "Não foi possível pausar. Tente de novo.");
      } else {
        onPaused();
        onClose();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl dark:text-slate-100">
            <PauseCircle className="w-6 h-6 text-amber-600" />
            Pausar serviço — OS #{order.order_number}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {order.machines && (
            <p className="text-base text-slate-600 dark:text-slate-300">
              Máquina:{" "}
              <span className="font-semibold">
                {order.machines.name}
                {order.machines.plate ? ` — ${order.machines.plate}` : ""}
              </span>
            </p>
          )}

          {hasMachine && (
            <div className="space-y-2">
              <Label className="text-base font-semibold flex items-center gap-2">
                {tracksKm ? (
                  <><Gauge className="w-5 h-5 text-amber-600" />KM do veículo agora</>
                ) : (
                  <><Clock className="w-5 h-5 text-amber-600" />Horímetro da máquina agora</>
                )}
              </Label>
              <Input
                value={reading}
                onChange={(e) => setReading(sanitizeReading(e.target.value))}
                placeholder={tracksKm ? "ex: 154300" : "ex: 1230,5"}
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                className="h-16 text-3xl text-center font-bold tabular-nums"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-base font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-600" />
              Hora da pausa
            </Label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="h-16 text-3xl text-center font-bold tabular-nums"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-base font-semibold">
              Observação do dia{" "}
              <span className="font-normal text-slate-400 dark:text-slate-500">(opcional)</span>
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ex: FALTOU MATERIAL, CONTINUA AMANHÃ"
              className="min-h-[88px] text-lg uppercase placeholder:normal-case placeholder:lowercase"
            />
          </div>

          {/* Localização automática — só informativo, não bloqueia nada */}
          <p className="flex items-center gap-1.5 text-sm text-slate-400 dark:text-slate-500">
            <MapPin className="w-4 h-4 flex-shrink-0" />
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

          <div className="grid gap-2">
            <Button
              type="submit"
              disabled={isPending}
              className="h-16 text-xl gap-2 bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Pausando...
                </>
              ) : (
                <>
                  <PauseCircle className="w-6 h-6" />
                  PAUSAR AGORA
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
