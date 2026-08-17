"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowUpFromLine } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatQty, localDateISO } from "@/lib/utils";
import { approveSupplyRequest } from "@/app/(app)/almoxarifado/actions";
import { formatQtyInput, parseQty } from "./supply-shared";
import type { SupplyItemWithStock, SupplyObraUsage, SupplyRequestRow } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  request: SupplyRequestRow | null;
  items: SupplyItemWithStock[];
  obras: SupplyObraUsage[];
  /** Foto que o técnico mandou (URL assinada). */
  photoUrl: string | null;
}

/**
 * Confere o que o técnico avisou e dá baixa de verdade. Quando ele escreveu o
 * nome do material na mão, o campo tenta casar sozinho com o cadastro — senão o
 * chefe escolhe da lista. Só aqui o saldo cai.
 */
export function SupplyRequestDialog({ open, onClose, request, items, obras, photoUrl }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [obraId, setObraId] = useState("");
  const [destination, setDestination] = useState("");
  const [person, setPerson] = useState("");
  const [date, setDate] = useState(localDateISO());

  /** O que o técnico escreveu na mão, quando não escolheu da lista. */
  const typed = request?.item_text?.trim().toUpperCase() ?? null;

  /**
   * Preenche uma vez por envio. Os dados da página recarregam a cada ação do
   * servidor — sem essa trava, o que o chefe estivesse corrigindo voltaria ao
   * valor original no meio da conferência.
   */
  const filledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      filledFor.current = null;
      return;
    }
    if (!request || filledFor.current === request.id) return;
    filledFor.current = request.id;

    const match = typed ? items.find((i) => i.name.trim().toUpperCase() === typed) : null;
    setItemId(request.item_id ?? match?.id ?? "");
    setQuantity(String(Number(request.quantity)).replace(".", ","));
    setObraId(request.obra_id ?? "");
    setDestination(request.destination ?? "");
    setPerson(request.sent_by_name ?? "");
    setDate(request.used_date || localDateISO());
    setError(null);
  }, [open, request, items, typed]);

  const selected = useMemo(
    () => items.find((i) => i.id === itemId) ?? null,
    [items, itemId]
  );

  if (!request) return null;

  const available = selected?.current_quantity ?? 0;
  const qty = parseQty(quantity);
  const falta = selected ? qty - available : 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!itemId) return setError("Escolha o material do cadastro");
    if (qty <= 0) return setError("Informe a quantidade");
    if (qty > available)
      return setError(
        `Saldo insuficiente (disponível: ${formatQty(available)} ${selected?.unit ?? ""})`
      );

    startTransition(async () => {
      const r = await approveSupplyRequest(request!.id, {
        item_id: itemId,
        quantity: qty,
        obra_id: obraId || null,
        destination,
        person,
        movement_date: date,
        notes: request!.notes,
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao dar baixa");
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400">
              <ArrowUpFromLine className="w-4 h-4" />
            </span>
            Dar baixa no material
          </DialogTitle>
          {request.sent_by_name && (
            <p className="text-[11px] text-slate-400">Enviado por {request.sent_by_name}</p>
          )}
        </DialogHeader>

        {photoUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photoUrl}
            alt="Foto do técnico"
            className="w-full h-40 object-cover rounded-xl border border-slate-200 dark:border-slate-700 mb-4"
          />
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Material *</Label>
            <SearchableSelect
              items={items}
              value={itemId}
              onChange={setItemId}
              getId={(i) => i.id}
              getLabel={(i) => i.name}
              renderItem={(i) => (
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="truncate">{i.name}</span>
                  <span className="text-[10px] text-slate-400 flex-shrink-0 tabular-nums">
                    {formatQty(i.current_quantity)} {i.unit}
                  </span>
                </div>
              )}
              placeholder="Escolha o material..."
              searchPlaceholder="Buscar material..."
              emptyMessage="Nenhum item cadastrado"
            />
            {typed && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {selected
                  ? `O técnico escreveu "${typed}" — já casou com o cadastro.`
                  : `O técnico escreveu "${typed}", mas esse material não está no cadastro — escolha o certo.`}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sr_qty">Quantidade{selected ? ` (${selected.unit})` : ""} *</Label>
            <Input
              id="sr_qty"
              value={quantity}
              onChange={(e) => setQuantity(formatQtyInput(e.target.value))}
              placeholder="0"
              inputMode="decimal"
              className="tabular-nums text-lg font-semibold"
              autoComplete="off"
            />
            {selected && (
              <p
                className={`text-[11px] tabular-nums ${
                  falta > 0 ? "text-red-500 font-medium" : "text-slate-400"
                }`}
              >
                {falta > 0
                  ? `Em estoque só tem ${formatQty(available)} ${selected.unit} — faltam ${formatQty(falta)}.`
                  : `Em estoque: ${formatQty(available)} ${selected.unit}`}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sr_person">Retirado por</Label>
            <Input
              id="sr_person"
              value={person}
              onChange={(e) => setPerson(e.target.value.toUpperCase())}
              placeholder="quem usou o material"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Obra</Label>
            <SearchableSelect
              items={obras}
              value={obraId}
              onChange={setObraId}
              getId={(o) => o.id}
              getLabel={(o) => o.name}
              renderItem={(o) => (
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="truncate">{o.name}</span>
                  {o.client && (
                    <span className="text-[10px] text-slate-400 flex-shrink-0 truncate max-w-[7rem]">
                      {o.client}
                    </span>
                  )}
                </div>
              )}
              placeholder="Nenhuma obra (opcional)"
              searchPlaceholder="Buscar obra..."
              emptyMessage="Nenhuma obra cadastrada"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sr_dest">Uso</Label>
            <Input
              id="sr_dest"
              value={destination}
              onChange={(e) => setDestination(e.target.value.toUpperCase())}
              placeholder="onde foi aplicado (opcional)"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sr_date">Data</Label>
            <Input
              id="sr_date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {request.notes && (
            <p className="text-xs text-slate-500 dark:text-slate-400 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
              {request.notes}
            </p>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Dando baixa..." : "Dar baixa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
