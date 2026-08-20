"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, PlayCircle, Clock, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ServiceOrder } from "@/lib/types";

interface Props {
  order: ServiceOrder;
  open: boolean;
  onClose: () => void;
  /** Inicia a viagem; resolve com erro (string) ou null em caso de sucesso. */
  onStart: (data: { origin: string | null }) => Promise<string | null>;
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * Início de UMA viagem (frete por viagem): o operador escreve de onde vai sair
 * e toca em iniciar. A entrega (onde foi entregue + assinatura) é registrada
 * depois, ao finalizar a viagem. Campos grandes para celular e baixa visão.
 */
export function TripStartDialog({ order, open, onClose, onStart }: Props) {
  const nextTrip = (order.trips_count ?? 0) + 1;

  const [origin, setOrigin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (open) {
      setOrigin("");
      setError(null);
    }
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!origin.trim()) {
      setError("Escreva de onde você vai sair");
      return;
    }
    setError(null);
    startTransition(async () => {
      const err = await onStart({ origin: origin.trim() || null });
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
            <PlayCircle className="w-6 h-6 text-produmar-600" />
            Iniciar {nextTrip}ª viagem — OS #{order.order_number}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <p className="flex items-center gap-2 text-base text-slate-600 dark:text-slate-300">
            <Clock className="w-5 h-5 text-slate-400 flex-shrink-0" />
            Hora da saída: <span className="font-bold tabular-nums">{nowHHMM()}</span>
          </p>

          <div className="space-y-2">
            <Label htmlFor="trip_origin" className="text-base font-semibold flex items-center gap-2">
              <MapPin className="w-5 h-5 text-produmar-600" />
              De onde você vai sair?
            </Label>
            <Input
              id="trip_origin"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="ex: PEDREIRA NORTE"
              className="h-14 text-lg uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
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
                  Iniciando...
                </>
              ) : (
                <>
                  <PlayCircle className="w-6 h-6" />
                  INICIAR VIAGEM
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
