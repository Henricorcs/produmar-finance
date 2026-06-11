"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, PackageCheck, Clock, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignaturePad } from "./signature-pad";
import type { ServiceOrder } from "@/lib/types";

interface Props {
  order: ServiceOrder;
  open: boolean;
  onClose: () => void;
  /** Registra a entrega; resolve com erro (string) ou null em caso de sucesso. */
  onDeliver: (data: {
    receivedBy: string | null;
    signature: string | null;
    latitude: number | null;
    longitude: number | null;
    locationAccuracy: number | null;
  }) => Promise<string | null>;
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Entrega de uma viagem (frete por viagem): a cada entrega, quem recebeu
 * escreve o nome e assina no celular do técnico. Cliente externo: nome +
 * assinatura obrigatórios (com escape "Entregar sem assinatura" confirmado);
 * frete interno: opcionais. Campos grandes para celular e baixa visão.
 */
export function TripDeliveryDialog({ order, open, onClose, onDeliver }: Props) {
  const isClient = order.freight_type === "cliente";
  const nextTrip = (order.trips_count ?? 0) + 1;

  const [receivedBy, setReceivedBy] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Localização automática (GPS do celular) da entrega — capturada assim que o
  // dialog abre. Best-effort: sem GPS, a entrega é registrada igual.
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"buscando" | "ok" | "erro">("buscando");

  useEffect(() => {
    if (open) {
      setReceivedBy("");
      setSignature(null);
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
    }
  }, [open]);

  function deliver(skipSignature: boolean) {
    if (isClient && !skipSignature) {
      if (!receivedBy.trim()) {
        setError("Escreva o nome de quem recebeu");
        return;
      }
      if (!signature) {
        setError("Peça para quem recebeu assinar no quadro");
        return;
      }
    }
    if (skipSignature) {
      const ok = confirm(
        "Entregar SEM assinatura?\n\nA viagem vai ficar marcada como NÃO ASSINADA no comprovante. Use só quando não tiver ninguém no local para assinar."
      );
      if (!ok) return;
    }
    setError(null);
    startTransition(async () => {
      const err = await onDeliver({
        receivedBy: receivedBy.trim() || null,
        signature: skipSignature ? null : signature,
        latitude: gps?.lat ?? null,
        longitude: gps?.lng ?? null,
        locationAccuracy: gps?.accuracy ?? null,
      });
      if (err) {
        setError(err);
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl dark:text-slate-100">
            <PackageCheck className="w-6 h-6 text-sky-600" />
            Entregar {nextTrip}ª viagem — OS #{order.order_number}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            deliver(false);
          }}
          className="space-y-5"
        >
          <p className="flex items-center gap-2 text-base text-slate-600 dark:text-slate-300">
            <Clock className="w-5 h-5 text-slate-400 flex-shrink-0" />
            Hora da entrega: <span className="font-bold tabular-nums">{nowHHMM()}</span>
          </p>

          <div className="space-y-2">
            <Label htmlFor="trip_received_by" className="text-base font-semibold">
              Nome de quem recebeu
              {isClient && <span className="text-red-500"> *</span>}
            </Label>
            <Input
              id="trip_received_by"
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
              placeholder="ex: JOÃO DA SILVA"
              className="h-14 text-lg uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-base font-semibold">
              Assinatura de quem recebeu
              {isClient && <span className="text-red-500"> *</span>}
            </Label>
            <SignaturePad onChange={setSignature} />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Toque em “Assinar” e entregue o celular para a pessoa assinar.
            </p>
          </div>

          {/* Localização automática — só informativo, não bloqueia nada */}
          <p className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            {gpsStatus === "ok"
              ? "Localização da entrega registrada"
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
              className="h-16 text-xl gap-2 bg-sky-600 hover:bg-sky-700"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <PackageCheck className="w-6 h-6" />
                  CONFIRMAR ENTREGA
                </>
              )}
            </Button>
            {isClient && (
              <Button
                type="button"
                variant="outline"
                className="h-12 text-base text-slate-500"
                onClick={() => deliver(true)}
                disabled={isPending}
              >
                Entregar sem assinatura
              </Button>
            )}
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
