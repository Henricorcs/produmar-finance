"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Printer } from "lucide-react";
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
import type { ServiceOrder } from "@/lib/types";

interface Props {
  order: ServiceOrder & { machines: { name: string; plate: string | null } | null };
  open: boolean;
  onClose: () => void;
  onFinalized: (orderId: string) => void;
}

export function FinalizeOSDialog({ order, open, onClose, onFinalized }: Props) {
  const [receivedBy, setReceivedBy] = useState("");
  const [error, setError]           = useState<string | null>(null);
  const [done, setDone]             = useState(false);
  const [signature, setSignature]   = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClose() {
    setReceivedBy("");
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
    setError(null);
    startTransition(async () => {
      const result = await finalizeServiceOrder(order.id, receivedBy, signature);
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
              className="w-full gap-2"
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
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-4 text-sm space-y-1">
              <p className="text-xs text-slate-400 dark:text-slate-500 uppercase font-semibold">
                Resumo da OS
              </p>
              <p className="font-medium text-slate-700 dark:text-slate-200">
                OS #{order.order_number} —{" "}
                {order.type === "entrega_material" ? "Entrega de material" : "Prestação de serviço"}
              </p>
              {order.client_name && (
                <p className="text-slate-500 dark:text-slate-400">
                  Cliente: {order.client_name}
                </p>
              )}
              {order.machines && (
                <p className="text-slate-500 dark:text-slate-400">
                  Máquina: {order.machines.name}
                  {order.machines.plate ? ` (${order.machines.plate})` : ""}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="received_by_input">
                Nome de quem recebeu <span className="text-red-500">*</span>
              </Label>
              <Input
                id="received_by_input"
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder="ex: JOÃO DA SILVA"
                className="uppercase placeholder:normal-case placeholder:lowercase"
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
              <Button type="submit" disabled={isPending} className="bg-emerald-600 hover:bg-emerald-700">
                {isPending ? "Finalizando..." : "Finalizar OS"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
