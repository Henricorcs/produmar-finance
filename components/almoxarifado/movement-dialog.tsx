"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Pencil } from "lucide-react";
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
import { formatBRLInput, formatQty, localDateISO, parseMoney, upperKeepingCaret } from "@/lib/utils";
import {
  createSupplyMovement,
  uploadSupplyMovementPhoto,
} from "@/app/(app)/almoxarifado/actions";
import { PhotoField, formatQtyInput, parseQty } from "./supply-shared";
import type { SupplyItemWithStock, SupplyObraUsage } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** "entrada" = chegou material. "saida" = alguém levou pra usar. */
  type: "entrada" | "saida";
  items: SupplyItemWithStock[];
  /** Obras do módulo — a saída pode ser atrelada a uma delas. */
  obras?: SupplyObraUsage[];
  /** Pré-seleciona o item (quando aberto pelo card ou pelo detalhe). */
  presetItemId?: string | null;
  /** Pré-seleciona a obra (quando aberto pela aba Obras). */
  presetObraId?: string | null;
  /** Abre o cadastro de item sem sair do lançamento. */
  onCreateItem?: () => void;
  /** Abre o cadastro de obra sem sair do lançamento. */
  onCreateObra?: () => void;
  /** Abre a edição da obra escolhida sem sair do lançamento. */
  onEditObra?: (obra: SupplyObraUsage) => void;
}

export function MovementDialog({
  open,
  onClose,
  type,
  items,
  obras = [],
  presetItemId,
  presetObraId,
  onCreateItem,
  onCreateObra,
  onEditObra,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [person, setPerson] = useState("");
  const [destination, setDestination] = useState("");
  const [obraId, setObraId] = useState("");
  const [date, setDate] = useState(localDateISO());
  const [photo, setPhoto] = useState<File | null>(null);
  /** Item travado: o lançamento foi aberto a partir de um item específico. */
  const [lockedItemId, setLockedItemId] = useState<string | null>(null);

  const isSaida = type === "saida";

  // Na saída só faz sentido oferecer o que tem saldo
  const selectableItems = useMemo(
    () => (isSaida ? items.filter((i) => i.current_quantity > 0) : items),
    [items, isSaida]
  );

  /**
   * O formulário só é zerado quando o lançamento ABRE. Cadastrar um item ou uma
   * obra no meio do caminho muda o preset — e isso não pode apagar o que a
   * pessoa já tinha digitado: só entra selecionado o que acabou de nascer.
   */
  const wasOpen = useRef(false);
  useEffect(() => {
    const justOpened = open && !wasOpen.current;
    wasOpen.current = open;
    if (!open) return;

    if (justOpened) {
      setItemId(presetItemId ?? "");
      setLockedItemId(presetItemId ?? null);
      setObraId(presetObraId ?? "");
      setQuantity("");
      setUnitCost("");
      setPerson("");
      setDestination("");
      setDate(localDateISO());
      setPhoto(null);
      setError(null);
      return;
    }

    if (presetItemId) setItemId(presetItemId);
    if (presetObraId) setObraId(presetObraId);
  }, [open, presetItemId, presetObraId]);

  const selected = items.find((i) => i.id === itemId) ?? null;
  const selectedObra = obras.find((o) => o.id === obraId) ?? null;
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
      setError(`Saldo insuficiente (disponível: ${formatQty(available)} ${selected?.unit ?? ""})`);
      return;
    }
    if (isSaida && !person.trim()) {
      setError("Informe quem retirou o material");
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
        obra_id: isSaida ? obraId || null : null,
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
            {lockedItemId && selected ? (
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
                createNewLabel="Cadastrar novo item"
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
                  onChange={(e) => setUnitCost(formatBRLInput(e.target.value))}
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
            <Label htmlFor="mv_person">{isSaida ? "Retirado por *" : "Fornecedor"}</Label>
            <Input
              id="mv_person"
              value={person}
              onChange={(e) => setPerson(upperKeepingCaret(e))}
              placeholder={isSaida ? "nome de quem retirou" : "opcional"}
              autoCapitalize="characters"
              autoComplete="off"
            />
          </div>

          {isSaida && (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label>Obra</Label>
                  {/* Errou o nome/cliente da obra? Conserta aqui mesmo. */}
                  {selectedObra && onEditObra && (
                    <button
                      type="button"
                      onClick={() => onEditObra(selectedObra)}
                      className="flex items-center gap-1 min-h-[44px] px-2 -my-2 text-[11px] font-medium text-produmar-600 dark:text-produmar-400 hover:underline"
                    >
                      <Pencil className="w-3 h-3" />
                      Editar obra
                    </button>
                  )}
                </div>
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
                  telaCheia
                  titulo="Escolher obra"
                  lembrarRecentes="obras"
                  getDetalhe={(o) => o.client}
                  emptyMessage="Nenhuma obra cadastrada"
                  onCreateNew={onCreateObra}
                  createNewLabel="Cadastrar nova obra"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mv_destination">Uso</Label>
                <Input
                  id="mv_destination"
                  value={destination}
                  onChange={(e) => setDestination(upperKeepingCaret(e))}
                  placeholder="onde ou em que foi aplicado (opcional)"
                  autoCapitalize="characters"
                  autoComplete="off"
                />
              </div>
            </>
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
            label={isSaida ? "Comprovante" : "Nota fiscal"}
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
