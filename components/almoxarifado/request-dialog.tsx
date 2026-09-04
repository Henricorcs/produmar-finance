"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowUpFromLine, PackagePlus } from "lucide-react";
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
import { formatQty, localDateISO, upperKeepingCaret } from "@/lib/utils";
import { approveSupplyRequest } from "@/app/(app)/almoxarifado/actions";
import { ItemDialog } from "./item-dialog";
import { formatQtyInput, num, parseQty } from "./supply-shared";
import type {
  SupplyCategory,
  SupplyItemWithStock,
  SupplyObraSector,
  SupplyObraUsage,
  SupplyRequestRow,
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  request: SupplyRequestRow | null;
  items: SupplyItemWithStock[];
  obras: SupplyObraUsage[];
  /** Setores das obras — para o setor do técnico virar o lugar da saída. */
  sectors?: SupplyObraSector[];
  /** Foto que o técnico mandou (URL assinada). */
  photoUrl: string | null;
  /** Para cadastrar o material que faltava sem sair daqui. */
  categories: SupplyCategory[];
}

/** O que este diálogo precisa saber de um material do estoque. */
interface ItemDoEstoque {
  id: string;
  name: string;
  unit: string;
  current_quantity: number;
}

/**
 * Confere o que o técnico avisou e dá baixa de verdade. Quando ele escreveu o
 * nome do material na mão, o campo tenta casar sozinho com o cadastro — senão o
 * chefe escolhe da lista. Só aqui o saldo cai.
 *
 * E quando o material NÃO EXISTE no cadastro? Esse era o beco sem saída: o
 * chefe largava a conferência no meio, ia ao Estoque cadastrar, voltava e
 * procurava o aviso de novo — quando não desistia e escolhia um item parecido,
 * que é pior, porque suja o saldo do material errado.
 *
 * Agora o cadastro abre por cima daqui, já com o nome que o técnico escreveu e
 * com a quantidade do aviso como saldo de partida. Sem esse saldo o item
 * nasceria zerado e a baixa seguinte esbarraria em "saldo insuficiente" — o
 * cadastro certo levando ao mesmo beco.
 */
export function SupplyRequestDialog({
  open,
  onClose,
  request,
  items,
  obras,
  sectors = [],
  photoUrl,
  categories,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [itemId, setItemId] = useState("");
  const [cadastroOpen, setCadastroOpen] = useState(false);
  /** O que nasceu aqui dentro, para aparecer na lista antes do servidor. */
  const [criados, setCriados] = useState<ItemDoEstoque[]>([]);
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
    // o setor escolhido pelo técnico é o lugar da saída; sem setor, o texto
    // que ele escreveu na mão
    setDestination(
      sectors.find((x) => x.id === request.sector_id)?.name ?? request.destination ?? ""
    );
    setPerson(request.sent_by_name ?? "");
    setDate(request.used_date || localDateISO());
    setError(null);
  }, [open, request, items, typed]);

  /** O estoque somado ao que acabou de nascer — o do servidor manda. */
  const todosItens = useMemo(() => {
    const map = new Map<string, ItemDoEstoque>();
    for (const c of criados) map.set(c.id, c);
    for (const i of items)
      map.set(i.id, {
        id: i.id,
        name: i.name,
        unit: i.unit,
        current_quantity: num(i.current_quantity),
      });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [items, criados]);

  const selected = useMemo(
    () => todosItens.find((i) => i.id === itemId) ?? null,
    [todosItens, itemId]
  );

  /**
   * Cadastrou o material que faltava: ele já entra escolhido, e a conferência
   * continua de onde parou.
   */
  function materialCadastrado(
    novoId: string,
    criado: { name: string; unit: string; quantity: number }
  ) {
    setCriados((prev) => [
      ...prev.filter((c) => c.id !== novoId),
      {
        id: novoId,
        name: criado.name,
        unit: criado.unit,
        current_quantity: criado.quantity,
      },
    ]);
    setItemId(novoId);
    setError(null);
  }

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
    <>
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
                items={todosItens}
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
                    : `O técnico escreveu "${typed}", mas esse material não está no cadastro.`}
                </p>
              )}

              {/* Sem cadastro não há baixa, e antes isso obrigava a largar a
                  conferência no meio. O cadastro abre aqui, já preenchido. */}
              {!selected && (
                <div className="rounded-lg border border-dashed border-produmar-200 dark:border-slate-700 bg-produmar-50/40 dark:bg-slate-800/40 px-3 py-2.5 space-y-1">
                  <button
                    type="button"
                    onClick={() => setCadastroOpen(true)}
                    className="flex items-start gap-1.5 text-[12px] font-semibold text-produmar-700 dark:text-produmar-400 hover:underline text-left"
                  >
                    <PackagePlus className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    {typed ? `Cadastrar "${typed}" no estoque` : "Cadastrar material novo"}
                  </button>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Nasce com a quantidade deste aviso como saldo inicial — ajuste lá se você
                    souber quanto tem no depósito.
                  </p>
                </div>
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
                onChange={(e) => setPerson(upperKeepingCaret(e))}
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
                onChange={(e) => setDestination(upperKeepingCaret(e))}
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

      {/* O cadastro do Estoque por cima da conferência: o material que faltava
          nasce aqui e já volta escolhido, sem perder o aviso de vista. */}
      <ItemDialog
        open={cadastroOpen}
        onClose={() => setCadastroOpen(false)}
        item={null}
        categories={categories}
        defaultName={typed ?? ""}
        defaultInitialQty={parseQty(quantity) || num(request.quantity)}
        onCreated={materialCadastrado}
      />
    </>
  );
}
