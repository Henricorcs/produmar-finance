"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
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
import { formatMoneyInput, formatQty, localDateISO, parseMoney } from "@/lib/utils";
import {
  createSupplyMovement,
  uploadSupplyMovementPhoto,
} from "@/app/(app)/almoxarifado/actions";
import { PhotoField, formatQtyInput, parseQty } from "./supply-shared";
import type { SupplyItemWithStock } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** "entrada" = chegou material. "saida" = alguém levou pra usar. */
  type: "entrada" | "saida";
  items: SupplyItemWithStock[];
  /** Pré-seleciona o item (quando aberto pelo card ou pelo detalhe). */
  presetItemId?: string | null;
  /** Abre o cadastro de item sem sair do lançamento. */
  onCreateItem?: () => void;
}

export function MovementDialog({
  open,
  onClose,
  type,
  items,
  presetItemId,
  onCreateItem,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [person, setPerson] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState(localDateISO());
  const [photo, setPhoto] = useState<File | null>(null);

  const isSaida = type === "saida";

  // Na saída só faz sentido oferecer o que tem saldo
  const selectableItems = useMemo(
    () => (isSaida ? items.filter((i) => i.current_quantity > 0) : items),
    [items, isSaida]
  );

  useEffect(() => {
    if (!open) return;
    setItemId(presetItemId ?? "");
    setQuantity("");
    setUnitCost("");
    setPerson("");
    setDestination("");
    setDate(localDateISO());
    setPhoto(null);
    setError(null);
  }, [open, presetItemId]);

  const selected = items.find((i) => i.id === itemId) ?? null;
  const available = selected?.current_quantity ?? 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!itemId) {
      setError("Selecione o item");
      return;
    }
    const qty = parseQty(quantity);
    if (qty <= 0) {
      setError("Informe a quantidade");
      return;
    }
    if (isSaida && qty > available) {
      setError(`Só tem ${formatQty(available)} ${selected?.unit ?? ""} em estoque`);
      return;
    }
    if (isSaida && !person.trim()) {
      setError("Informe quem está levando");
      return;
    }

    startTransition(async () => {
      const r = await createSupplyMovement({
        item_id: itemId,
        type,
        quantity: qty,
        unit_cost: isSaida ? null : parseMoney(unitCost),
        person,
        destination: isSaida ? destination : null,
        movement_date: date,
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao registrar");
        return;
      }

      // a foto é opcional — sobe depois do lançamento
      const movementId = (r as { movementId?: string }).movementId;
      if (photo && movementId) {
        const fd = new FormData();
        fd.append("file", photo);
        const up = await uploadSupplyMovementPhoto(movementId, fd);
        if (up && "error" in up) {
          setError(`Lançamento registrado, mas a foto falhou: ${up.error}`);
          return;
        }
      }
      onClose();
    });
  }

  const Icon = isSaida ? ArrowUpFromLine : ArrowDownToLine;
  const total = !isSaida ? parseQty(quantity) * parseMoney(unitCost) : 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span
              className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                isSaida
                  ? "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                  : "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
              }`}
            >
              <Icon className="w-4 h-4" />
            </span>
            {isSaida ? "Saída de material" : "Entrada de material"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Item *</Label>
            {presetItemId && selected ? (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2.5">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                  {selected.name}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5 tabular-nums">
                  {formatQty(selected.current_quantity)} {selected.unit} em estoque
                </p>
              </div>
            ) : (
              <SearchableSelect
                items={selectableItems}
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
                placeholder="Selecione o item..."
                searchPlaceholder="Buscar item..."
                emptyMessage={
                  isSaida ? "Nenhum item com saldo em estoque" : "Nenhum item cadastrado"
                }
                onCreateNew={onCreateItem}
                createNewLabel="Cadastrar item novo"
              />
            )}
          </div>

          <div className={!isSaida ? "grid grid-cols-2 gap-2" : ""}>
            <div className="space-y-1.5">
              <Label htmlFor="mv_qty">
                Quantidade{selected ? ` (${selected.unit})` : ""} *
              </Label>
              <Input
                id="mv_qty"
                value={quantity}
                onChange={(e) => setQuantity(formatQtyInput(e.target.value))}
                placeholder="0"
                inputMode="decimal"
                className="tabular-nums text-lg font-semibold"
                autoComplete="off"
                autoFocus
              />
              {isSaida && selected && (
                <p className="text-[11px] text-slate-400 tabular-nums">
                  Em estoque: {formatQty(available)} {selected.unit}
                </p>
              )}
            </div>

            {!isSaida && (
              <div className="space-y-1.5">
                <Label htmlFor="mv_cost">Custo por {selected?.unit ?? "un"} (R$)</Label>
                <Input
                  id="mv_cost"
                  value={unitCost}
                  onChange={(e) => setUnitCost(formatMoneyInput(e.target.value))}
                  placeholder="0,00"
                  inputMode="decimal"
                  className="tabular-nums"
                  autoComplete="off"
                />
              </div>
            )}
          </div>

          {!isSaida && total > 0 && (
            <p className="-mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              Total da entrada:{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="mv_person">{isSaida ? "Quem está levando *" : "De quem veio"}</Label>
            <Input
              id="mv_person"
              value={person}
              onChange={(e) => setPerson(e.target.value.toUpperCase())}
              placeholder={isSaida ? "nome de quem pegou" : "fornecedor (opcional)"}
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          {isSaida && (
            <div className="space-y-1.5">
              <Label htmlFor="mv_destination">Pra onde vai</Label>
              <Input
                id="mv_destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value.toUpperCase())}
                placeholder="obra / cliente / local (opcional)"
                className="uppercase placeholder:normal-case placeholder:lowercase"
                autoComplete="off"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="mv_date">Data</Label>
            <Input
              id="mv_date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <PhotoField
            label="Foto"
            hint={
              isSaida
                ? "Quem levou, o material saindo — o que ajudar a lembrar depois."
                : "Nota fiscal ou o material que chegou."
            }
            file={photo}
            onChange={setPhoto}
          />


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
              {isPending ? "Registrando..." : isSaida ? "Registrar saída" : "Registrar entrada"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
