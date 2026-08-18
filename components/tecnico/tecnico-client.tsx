"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Clock, HardHat, List, PackageOpen, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { formatDate, formatQty, localDateISO } from "@/lib/utils";
import {
  cancelSupplyUsageRequest,
  requestSupplyUsage,
} from "@/app/(app)/tecnico/actions";
import { PhotoField, formatQtyInput, parseQty } from "@/components/almoxarifado/supply-shared";
import type { SupplyRequestRow } from "@/lib/types";

/** Catálogo enxuto — o técnico não vê saldo, só o nome e a unidade. */
export interface TecnicoItem {
  id: string;
  name: string;
  unit: string;
}

export interface TecnicoObra {
  id: string;
  name: string;
  client: string | null;
}

interface Props {
  items: TecnicoItem[];
  obras: TecnicoObra[];
  /** Recados dele que o chefe ainda não resolveu. */
  pending: SupplyRequestRow[];
}

/**
 * Tela única do técnico: "usei este material aqui". Nada sai do estoque neste
 * momento — o envio é um recado que o chefe confere e transforma em saída na
 * aba "Pendentes" do Estoque.
 */
export function TecnicoClient({ items, obras, pending }: Props) {
  const [isPending, startTransition] = useTransition();
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [itemId, setItemId] = useState("");
  /** O material não estava na lista: o técnico escreve o nome. */
  const [freeItem, setFreeItem] = useState(false);
  const [itemText, setItemText] = useState("");
  const [quantity, setQuantity] = useState("");
  const [obraId, setObraId] = useState("");
  const [destination, setDestination] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);

  const today = localDateISO();
  const selectedItem = useMemo(
    () => items.find((i) => i.id === itemId) ?? null,
    [items, itemId]
  );
  const unit = selectedItem?.unit ?? "";

  function useFreeText() {
    setFreeItem(true);
    setItemId("");
  }

  function useList() {
    setFreeItem(false);
    setItemText("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!itemId && !itemText.trim()) return setError("Diga qual material você usou");
    if (parseQty(quantity) <= 0) return setError("Informe a quantidade que você usou");
    if (!obraId && !destination.trim())
      return setError("Diga a obra ou onde você aplicou o material");

    const nome = selectedItem?.name ?? itemText.trim().toUpperCase();
    const fd = new FormData();
    fd.append("item_id", itemId);
    fd.append("item_text", itemText);
    fd.append("quantity", quantity);
    fd.append("obra_id", obraId);
    fd.append("destination", destination);
    fd.append("notes", notes);
    if (photo) fd.append("photo", photo);

    startTransition(async () => {
      const r = await requestSupplyUsage(fd);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao enviar");
        return;
      }
      // A obra e o lugar ficam: quem está numa obra manda vários materiais
      // seguidos. Só o material, a quantidade e a foto são zerados.
      setItemId("");
      setItemText("");
      setFreeItem(false);
      setQuantity("");
      setNotes("");
      setPhoto(null);
      setSuccess(`${nome} enviado! O chefe confere e dá baixa no estoque.`);
    });
  }

  function handleCancel(r: SupplyRequestRow) {
    const nome = r.supply_items?.name ?? r.item_text ?? "material";
    if (!confirm(`Cancelar o envio de ${nome}? O chefe não vai mais ver este recado.`)) return;
    setCancelingId(r.id);
    startTransition(async () => {
      const res = await cancelSupplyUsageRequest(r.id);
      setCancelingId(null);
      if (res && "error" in res) setError(res.error ?? "Erro ao cancelar");
    });
  }

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-3 pt-1">
        <div className="w-11 h-11 rounded-xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center flex-shrink-0">
          <PackageOpen className="w-6 h-6 text-sky-600 dark:text-sky-400" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Material usado
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Hoje, {formatDate(today)}</p>
        </div>
      </div>

      {success && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
          <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{success}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">O que você usou</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="tc_item">Material *</Label>
                {freeItem ? (
                  <button
                    type="button"
                    onClick={useList}
                    className="flex items-center gap-1 min-h-[44px] px-2 -my-2 text-[11px] font-medium text-produmar-600 dark:text-produmar-400 hover:underline"
                  >
                    <List className="w-3 h-3" />
                    Escolher da lista
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={useFreeText}
                    className="flex items-center gap-1 min-h-[44px] px-2 -my-2 text-[11px] font-medium text-produmar-600 dark:text-produmar-400 hover:underline"
                  >
                    <Pencil className="w-3 h-3" />
                    Não achei na lista
                  </button>
                )}
              </div>

              {freeItem ? (
                <>
                  <Input
                    id="tc_item"
                    value={itemText}
                    onChange={(e) => setItemText(e.target.value.toUpperCase())}
                    placeholder="ex: cano 50mm"
                    className="h-12 text-lg uppercase placeholder:normal-case placeholder:text-base placeholder:lowercase"
                    autoComplete="off"
                  />
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Escreva do jeito que você chama — o chefe acha no cadastro.
                  </p>
                </>
              ) : (
                <SearchableSelect
                  items={items}
                  value={itemId}
                  onChange={setItemId}
                  getId={(i) => i.id}
                  getLabel={(i) => i.name}
                  renderItem={(i) => (
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <span className="truncate">{i.name}</span>
                      <span className="text-[10px] text-slate-400 flex-shrink-0">{i.unit}</span>
                    </div>
                  )}
                  placeholder="Toque para escolher..."
                  searchPlaceholder="Buscar material..."
                  emptyMessage="Nenhum material cadastrado"
                  onCreateNew={useFreeText}
                  createNewLabel="Não achei — escrever o nome"
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tc_qty">Quantidade{unit ? ` (${unit})` : ""} *</Label>
              <Input
                id="tc_qty"
                value={quantity}
                onChange={(e) => setQuantity(formatQtyInput(e.target.value))}
                placeholder="0"
                inputMode="decimal"
                className="h-12 text-lg font-semibold tabular-nums"
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
                placeholder="Toque para escolher a obra..."
                searchPlaceholder="Buscar obra..."
                emptyMessage="Nenhuma obra cadastrada"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tc_dest">Onde você aplicou</Label>
              <Input
                id="tc_dest"
                value={destination}
                onChange={(e) => setDestination(e.target.value.toUpperCase())}
                placeholder="ex: poste da esquina, casa do cliente"
                className="h-12 uppercase placeholder:normal-case placeholder:lowercase"
                autoComplete="off"
              />
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Se a obra não estiver na lista, escreva aqui onde foi.
              </p>
            </div>

            <PhotoField
              label="Foto (se quiser)"
              hint="Foto do serviço ou do material que você usou."
              file={photo}
              onChange={setPhoto}
            />

            <div className="space-y-1.5">
              <Label htmlFor="tc_notes">Observação</Label>
              <Input
                id="tc_notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value.toUpperCase())}
                placeholder="opcional"
                className="h-12 uppercase placeholder:normal-case placeholder:lowercase"
                autoComplete="off"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={isPending}
              className="w-full h-14 text-base font-semibold"
            >
              {isPending ? "Enviando..." : "Enviar"}
            </Button>

            <p className="text-[11px] text-center text-slate-400 dark:text-slate-500">
              Isso não tira do estoque agora — o chefe confere e dá baixa.
            </p>
          </form>
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            Aguardando o chefe ({pending.length})
          </Label>
          <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            {pending.map((r) => {
              const nome = r.supply_items?.name ?? r.item_text ?? "—";
              const un = r.supply_items?.unit ?? "";
              const lugar = r.supply_obras?.name ?? r.destination ?? "";
              const at = new Date(r.created_at).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              });
              return (
                <li key={r.id} className="flex items-center gap-2.5 px-4 py-2.5">
                  <span className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                    <HardHat className="w-4 h-4 text-amber-500" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate tabular-nums">
                      {formatQty(Number(r.quantity))} {un} · {nome}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {lugar ? `${lugar} · ` : ""}
                      {at}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCancel(r)}
                    disabled={isPending && cancelingId === r.id}
                    aria-label="Cancelar envio"
                    className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 flex-shrink-0 -mr-2 transition-colors disabled:opacity-40"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Some da lista quando o chefe dá baixa no estoque.
          </p>
        </div>
      )}
    </div>
  );
}
