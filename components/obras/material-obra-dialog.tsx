"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { PackageOpen, Plus, X } from "lucide-react";
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
import { MaterialPickerDialog } from "@/components/tecnico/material-picker-dialog";
import { formatQty, localDateISO, upperKeepingCaret } from "@/lib/utils";
import { formatQtyInput, parseQty } from "@/components/almoxarifado/supply-shared";
import { createSupplyMovement } from "@/app/(app)/almoxarifado/actions";
import type {
  SupplyItemWithStock,
  SupplyObraSector,
  SupplyObraUsage,
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  obra: SupplyObraUsage;
  /** O estoque com saldo — é dele que sai o material da obra. */
  items: SupplyItemWithStock[];
  /** Setores de TODAS as obras — o diálogo usa os desta como atalho. */
  sectors?: SupplyObraSector[];
}

/** Uma linha do lançamento: um material e quanto dele foi usado. */
interface Linha {
  /** Chave de render: o índice muda quando se tira um material do meio. */
  key: string;
  itemId: string;
  quantity: string;
}

function novaLinha(itemId: string): Linha {
  return {
    key: typeof crypto !== "undefined" ? crypto.randomUUID() : String(Math.random()),
    itemId,
    quantity: "",
  };
}

/**
 * MATERIAL USADO NA OBRA, lançado pelo chefe.
 *
 * O técnico avisa o material na tela dele, mas nem sempre ele avisa — e aí não
 * havia por onde lançar sem sair de Obras. Aqui a escolha é a mesma que ele
 * faz: um botão abre a lista do estoque, a busca vai afinando, toca no que foi
 * usado (dá para tocar em vários) e cada um vira uma linha com a quantidade,
 * que dá para corrigir antes de salvar.
 *
 * A diferença é que aqui NÃO é recado: cada linha vira uma SAÍDA do estoque na
 * hora, atrelada a esta obra — quem está lançando é quem daria a baixa.
 */
export function MaterialObraDialog({ open, onClose, obra, items, sectors = [] }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [person, setPerson] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState(localDateISO());

  useEffect(() => {
    if (!open) return;
    setLinhas([]);
    setPickerOpen(false);
    // quem toca a obra é quem costuma pegar o material — já vem preenchido
    setPerson(obra.responsavel_name ?? "");
    setDestination("");
    setDate(localDateISO());
    setError(null);
  }, [open, obra.responsavel_name]);

  /** Só o que tem saldo: a saída não pode deixar o estoque negativo. */
  const comSaldo = useMemo(
    () => items.filter((i) => Number(i.current_quantity) > 0),
    [items]
  );
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  /** Os setores desta obra — atalho para o "onde aplicou". */
  const obraSectors = useMemo(
    () => sectors.filter((s) => s.obra_id === obra.id && s.active !== false),
    [sectors, obra.id]
  );

  const escolhidos = useMemo(() => linhas.map((l) => l.itemId), [linhas]);

  /** Tocou no material: entra no lançamento; tocou de novo, sai. */
  function alternarItem(item: { id: string }) {
    setLinhas((prev) => {
      const jaTem = prev.find((l) => l.itemId === item.id);
      if (jaTem) return prev.filter((l) => l.key !== jaTem.key);
      return [...prev, novaLinha(item.id)];
    });
  }

  function patchLinha(key: string, patch: Partial<Linha>) {
    setLinhas((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLinha(key: string) {
    setLinhas((prev) => prev.filter((l) => l.key !== key));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (linhas.length === 0) return setError("Escolha o material que foi usado");
    if (!person.trim()) return setError("Diga quem pegou o material");

    for (const l of linhas) {
      const item = itemById.get(l.itemId);
      const qtd = parseQty(l.quantity);
      if (qtd <= 0)
        return setError(`Informe quanto de ${item?.name ?? "material"} foi usado`);
      const saldo = Number(item?.current_quantity ?? 0);
      if (qtd > saldo)
        return setError(
          `${item?.name ?? "Material"}: o estoque só tem ${formatQty(saldo)} ${
            item?.unit ?? ""
          }`.trim()
        );
    }

    startTransition(async () => {
      // uma saída por material — é assim que o Estoque e o extrato da obra
      // enxergam um separado do outro, igual ao lançamento avulso do Estoque
      const restantes = [...linhas];
      let lancados = 0;

      while (restantes.length > 0) {
        const l = restantes[0];
        const r = await createSupplyMovement({
          item_id: l.itemId,
          type: "saida",
          quantity: parseQty(l.quantity),
          person,
          destination,
          obra_id: obra.id,
          movement_date: date,
        });

        if (r && "error" in r) {
          // o que já entrou não pode entrar de novo: sai da lista, e o que
          // sobrou fica na tela para o chefe corrigir e tentar de novo
          setLinhas(restantes);
          const nome = itemById.get(l.itemId)?.name ?? "material";
          setError(
            lancados > 0
              ? `${lancados} ${
                  lancados === 1 ? "material lançado" : "materiais lançados"
                }, mas ${nome} falhou: ${r.error}`
              : (r.error ?? "Erro ao lançar o material")
          );
          return;
        }

        restantes.shift();
        lancados++;
      }

      onClose();
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 dark:text-slate-100 pr-8">
              <span className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 flex items-center justify-center flex-shrink-0">
                <PackageOpen className="w-4 h-4" />
              </span>
              Material usado
            </DialogTitle>
            <p className="text-[11px] text-slate-400">{obra.name}</p>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Materiais *</Label>
                {linhas.length > 1 && (
                  <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                    {linhas.length} materiais
                  </span>
                )}
              </div>

              {linhas.length === 0 && (
                <p className="text-sm text-slate-400 dark:text-slate-500 py-3 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700 px-4">
                  Toque no botão abaixo e escolha na lista o que foi usado.
                </p>
              )}

              {linhas.map((linha) => {
                const item = itemById.get(linha.itemId);
                return (
                  <MaterialLinha
                    key={linha.key}
                    campoId={`mo_qty_${linha.key}`}
                    nome={item?.name ?? "Material"}
                    unit={item?.unit ?? ""}
                    saldo={Number(item?.current_quantity ?? 0)}
                    quantity={linha.quantity}
                    onChange={(quantity) => patchLinha(linha.key, { quantity })}
                    onRemove={() => removeLinha(linha.key)}
                  />
                );
              })}

              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-lg border-2 border-dashed border-produmar-300 dark:border-produmar-700 text-sm font-semibold text-produmar-600 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Adicionar material
              </button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mo_person">Quem pegou *</Label>
              <Input
                id="mo_person"
                value={person}
                onChange={(e) => setPerson(upperKeepingCaret(e))}
                placeholder="nome de quem retirou"
                className="uppercase placeholder:normal-case placeholder:lowercase"
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mo_destination">Onde aplicou</Label>
              {/* Os setores já cadastrados viram atalho: sem isso cada um
                  escreve o mesmo lugar de um jeito e nada soma junto */}
              {obraSectors.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {obraSectors.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setDestination((atual) => (atual === s.name ? "" : s.name))
                      }
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                        destination === s.name
                          ? "bg-produmar-600 border-produmar-600 text-white"
                          : "bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
              <Input
                id="mo_destination"
                value={destination}
                onChange={(e) => setDestination(upperKeepingCaret(e))}
                placeholder="em que pedaço da obra foi (opcional)"
                className="uppercase placeholder:normal-case placeholder:lowercase"
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mo_date">Dia</Label>
              <Input
                id="mo_date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                {error}
              </p>
            )}

            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Isto dá baixa no estoque na hora e entra no custo desta obra — não é
              recado esperando conferência, como o do técnico.
            </p>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Lançando..." : "Lançar material"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <MaterialPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        items={comSaldo}
        escolhidos={escolhidos}
        onToggle={alternarItem}
        titulo="Qual material foi usado?"
        // o chefe VÊ saldo (o técnico não): é ele quem responde pelo estoque
        getHint={(i) =>
          `${formatQty(Number(itemById.get(i.id)?.current_quantity ?? 0))} ${i.unit}`
        }
      />
    </>
  );
}

/**
 * Um material já escolhido: o nome de um lado, quanto usou do outro. A escolha
 * acontece na caixa da lista — aqui só se acerta a quantidade ou se tira da
 * lista, que é o que muda de uma obra para outra.
 */
function MaterialLinha({
  campoId,
  nome,
  unit,
  saldo,
  quantity,
  onChange,
  onRemove,
}: {
  campoId: string;
  nome: string;
  unit: string;
  saldo: number;
  quantity: string;
  onChange: (quantity: string) => void;
  onRemove: () => void;
}) {
  const passou = parseQty(quantity) > saldo;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 break-words leading-snug">
            {nome}
          </p>
          <p className="text-[11px] text-slate-400 tabular-nums">
            Em estoque: {formatQty(saldo)} {unit}
          </p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Tirar ${nome} da lista`}
          className="w-10 h-10 -mt-1 -mr-1 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1">
        <Label htmlFor={campoId}>Quantidade{unit ? ` (${unit})` : ""} *</Label>
        <Input
          id={campoId}
          value={quantity}
          onChange={(e) => onChange(formatQtyInput(e.target.value))}
          placeholder="0"
          inputMode="decimal"
          className="tabular-nums text-lg font-semibold"
          autoComplete="off"
        />
        {passou && (
          <p className="text-[11px] text-red-600 dark:text-red-400 tabular-nums">
            Passou do saldo: o estoque só tem {formatQty(saldo)} {unit}.
          </p>
        )}
      </div>
    </div>
  );
}
