"use client";

import { useEffect, useState, useTransition } from "react";
import { Forward, Loader2, HardHat } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { forwardServiceOrder } from "@/app/(app)/operacoes/actions";
import { AvisoDoCelular } from "@/components/operador/aviso-do-celular";
import { avisoNaoEntregue, recadoDoAvisoNaoEntregue } from "@/lib/aviso-do-envio";
import type { ServiceOrder } from "@/lib/types";

interface Props {
  order: ServiceOrder;
  /** Para quem dá para encaminhar (já sem o usuário atual). */
  operators: { id: string; name: string }[];
  open: boolean;
  onClose: () => void;
  /** Chamado após encaminhar (a OS sai deste painel). */
  onForwarded: (orderId: string) => void;
}

/**
 * Encaminhar uma OS para outra pessoa — outro operador, o encarregado ou o
 * escritório. Registra de quem → para quem (+ uma observação opcional). Ao
 * confirmar, a OS muda de dono, some deste painel e o celular dela apita.
 */
export function ForwardDialog({ order, operators, open, onClose, onForwarded }: Props) {
  const [toId, setToId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setToId("");
    setNote("");
    setError(null);
  }, [open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!toId) {
      setError("Escolha para quem encaminhar.");
      return;
    }
    const toName = operators.find((op) => op.id === toId)?.name ?? null;
    setError(null);
    startTransition(async () => {
      const result = await forwardServiceOrder(order.id, toId, {
        toName,
        note: note.trim() || null,
      });
      if (result && "error" in result) {
        setError(result.error ?? "Não foi possível encaminhar. Tente de novo.");
        return;
      }
      // Encaminhou. Se o celular de quem recebeu não tocou, quem passou a OS
      // adiante precisa saber agora — senão os dois acham que está avisado.
      const semAviso = avisoNaoEntregue(result);
      if (semAviso) alert(recadoDoAvisoNaoEntregue(semAviso, toName));
      onForwarded(order.id);
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl dark:text-slate-100">
            <Forward className="w-6 h-6 text-produmar-600" />
            Encaminhar OS #{order.order_number}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            A OS sai do seu painel e vai para o painel da pessoa escolhida. Fica
            registrado quem encaminhou, para quem e quando.
          </p>

          <div className="space-y-1.5">
            <Label className="text-base font-semibold flex items-center gap-2">
              <HardHat className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              Encaminhar para
            </Label>
            {operators.length === 0 ? (
              <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-lg px-3 py-2.5">
                Ninguém mais cadastrado para receber.
              </p>
            ) : (
              <SearchableSelect
                items={operators}
                value={toId}
                onChange={setToId}
                getId={(op) => op.id}
                getLabel={(op) => op.name}
                placeholder="Escolha quem vai receber..."
                searchPlaceholder="Buscar pelo nome..."
                emptyMessage="Ninguém com esse nome"
              />
            )}
            {/* ...e diz na hora quando o celular daquela pessoa NÃO vai tocar */}
            <AvisoDoCelular
              userId={toId || null}
              nome={operators.find((op) => op.id === toId)?.name}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-base font-semibold">
              Motivo / observação{" "}
              <span className="font-normal text-slate-400 dark:text-slate-500">(opcional)</span>
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ex: ESTOU LONGE, NÃO CONSIGO HOJE"
              autoCapitalize="characters"
              data-caixa="uppercase"
              className="min-h-[72px] text-base"
            />
          </div>

          {error && (
            <p className="text-base text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-3 py-2.5 rounded-lg border border-red-100 dark:border-red-900/40">
              {error}
            </p>
          )}

          <div className="grid gap-2">
            <Button
              type="submit"
              disabled={isPending || operators.length === 0}
              className="h-16 text-xl gap-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  Encaminhando...
                </>
              ) : (
                <>
                  <Forward className="w-6 h-6" />
                  ENCAMINHAR
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
