"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { PackageOpen, Plus, Trash2, X } from "lucide-react";
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
import { ItemDialog } from "@/components/almoxarifado/item-dialog";
import { formatQty, localDateISO, upperKeepingCaret } from "@/lib/utils";
import { formatQtyInput, num, parseQty } from "@/components/almoxarifado/supply-shared";
import {
  createSupplyMovement,
  deleteSupplyMovement,
  updateSupplyMovement,
} from "@/app/(app)/almoxarifado/actions";
import type {
  SupplyCategory,
  SupplyItemWithStock,
  SupplyObraExtrato,
  SupplyObraSector,
  SupplyObraUsage,
} from "@/lib/types";

/** O que esta tela precisa saber de um material do estoque. */
interface ItemDoEstoque {
  id: string;
  name: string;
  unit: string;
  current_quantity: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  obra: SupplyObraUsage;
  /** O estoque com saldo — é dele que sai o material da obra. */
  items: SupplyItemWithStock[];
  /** Setores de TODAS as obras — o diálogo usa os desta como atalho. */
  sectors?: SupplyObraSector[];
  /** Categorias do Estoque — só para o cadastro rápido de material. */
  categories?: SupplyCategory[];
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
 *
 * Faltou o material no cadastro? O "Cadastrar material" abre o mesmo cadastro
 * do Estoque por cima desta caixa: o item nasce com o saldo inicial e já entra
 * na lista, sem ter que sair da obra e voltar para dar a baixa.
 */
export function MaterialObraDialog({
  open,
  onClose,
  obra,
  items,
  sectors = [],
  categories = [],
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cadastroOpen, setCadastroOpen] = useState(false);
  const [person, setPerson] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState(localDateISO());
  /**
   * O material recém-cadastrado, do jeito que foi digitado. Serve só até os
   * dados novos chegarem do servidor: sem isso a linha nasceria sem nome, e
   * quem acabou de cadastrar acharia que se perdeu.
   */
  const [criados, setCriados] = useState<ItemDoEstoque[]>([]);

  useEffect(() => {
    if (!open) return;
    setLinhas([]);
    setPickerOpen(false);
    setCadastroOpen(false);
    setCriados([]);
    // quem toca a obra é quem costuma pegar o material — já vem preenchido
    setPerson(obra.responsavel_name ?? "");
    setDestination("");
    setDate(localDateISO());
    setError(null);
  }, [open, obra.responsavel_name]);

  /** O estoque somado ao que acabou de nascer — o do servidor manda. */
  const todos = useMemo(() => {
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

  const itemById = useMemo(() => new Map(todos.map((i) => [i.id, i])), [todos]);
  const escolhidos = useMemo(() => linhas.map((l) => l.itemId), [linhas]);

  /**
   * A lista que a caixa mostra: o que tem saldo, mais o que já foi escolhido e
   * o que acabou de ser cadastrado (esse pode nascer zerado, e sumir da lista
   * bem na hora seria o pior momento possível).
   */
  const paraEscolher = useMemo(
    () =>
      todos.filter(
        (i) =>
          i.current_quantity > 0 ||
          escolhidos.includes(i.id) ||
          criados.some((c) => c.id === i.id)
      ),
    [todos, escolhidos, criados]
  );

  /** Os setores desta obra — atalho para o "onde aplicou". */
  const obraSectors = useMemo(
    () => sectors.filter((s) => s.obra_id === obra.id && s.active !== false),
    [sectors, obra.id]
  );

  /** Tocou no material: entra no lançamento; tocou de novo, sai. */
  function alternarItem(item: { id: string }) {
    setLinhas((prev) => {
      const jaTem = prev.find((l) => l.itemId === item.id);
      if (jaTem) return prev.filter((l) => l.key !== jaTem.key);
      return [...prev, novaLinha(item.id)];
    });
  }

  /** Cadastrou o material que faltava: ele já entra na lista, sem procurar. */
  function itemCadastrado(
    itemId: string,
    criado: { name: string; unit: string; quantity: number }
  ) {
    setCriados((prev) => [
      ...prev,
      {
        id: itemId,
        name: criado.name,
        unit: criado.unit,
        current_quantity: criado.quantity,
      },
    ]);
    setLinhas((prev) =>
      prev.some((l) => l.itemId === itemId) ? prev : [...prev, novaLinha(itemId)]
    );
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
      const saldo = item?.current_quantity ?? 0;
      if (qtd > saldo)
        return setError(
          saldo <= 0
            ? `${item?.name ?? "Material"} está zerado no estoque — dê entrada dele antes de baixar`
            : `${item?.name ?? "Material"}: o estoque só tem ${formatQty(saldo)} ${
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
                    saldo={item?.current_quantity ?? 0}
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
                autoCapitalize="characters"
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
                autoCapitalize="characters"
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
              recado esperando conferência, como o do encarregado de obra.
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
        items={paraEscolher}
        escolhidos={escolhidos}
        onToggle={alternarItem}
        titulo="Qual material foi usado?"
        onCadastrar={() => setCadastroOpen(true)}
        // o chefe VÊ saldo (o técnico não): é ele quem responde pelo estoque
        getHint={(i) =>
          `${formatQty(itemById.get(i.id)?.current_quantity ?? 0)} ${i.unit}`
        }
      />

      {/* O cadastro do Estoque, aberto por cima: o material que faltava nasce
          aqui mesmo e já entra na lista, sem ida e volta até o outro módulo */}
      <ItemDialog
        open={cadastroOpen}
        onClose={() => setCadastroOpen(false)}
        item={null}
        categories={categories}
        onCreated={itemCadastrado}
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
            {saldo <= 0
              ? "Este material está zerado no estoque — dê entrada dele antes de baixar."
              : `Passou do saldo: o estoque só tem ${formatQty(saldo)} ${unit}.`}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * CORRIGIR UM MATERIAL JÁ LANÇADO na obra — baixou 10 e eram 8, errou quem
 * pegou, errou o dia.
 *
 * Mexer na quantidade mexe no estoque: o que muda é só a DIFERENÇA, então
 * aumentar só passa se o que falta ainda estiver na prateleira. Trocar o
 * material em si não tem por aqui — para isso apaga e lança de novo, senão o
 * histórico do estoque passa a contar outra história.
 */
export function CorrigirMaterialDialog({
  open,
  onClose,
  obraNome,
  linha,
}: {
  open: boolean;
  onClose: () => void;
  obraNome: string;
  /** A linha do extrato, que é uma saída de estoque (v_supply_obra_extrato). */
  linha: SupplyObraExtrato;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [quantity, setQuantity] = useState("");
  const [person, setPerson] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState(localDateISO());

  useEffect(() => {
    if (!open) return;
    setQuantity(String(num(linha.quantity)).replace(".", ","));
    setPerson(linha.person ?? "");
    setDestination(linha.detail ?? "");
    setDate(linha.entry_date ?? localDateISO());
    setError(null);
  }, [open, linha]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const qtd = parseQty(quantity);
    if (qtd <= 0) return setError("Informe quanto foi usado");

    startTransition(async () => {
      const r = await updateSupplyMovement(linha.id, {
        quantity: qtd,
        person,
        destination,
        movement_date: date,
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao corrigir");
        return;
      }
      onClose();
    });
  }

  function handleDelete() {
    if (
      !confirm(
        `Apagar a baixa de ${formatQty(num(linha.quantity))} ${linha.unit ?? ""} de ${
          linha.description
        }? O material volta para o estoque.`
      )
    )
      return;
    startTransition(async () => {
      const r = await deleteSupplyMovement(linha.id);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao apagar");
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100 pr-8">
            <span className="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 flex items-center justify-center flex-shrink-0">
              <PackageOpen className="w-4 h-4" />
            </span>
            Corrigir material
          </DialogTitle>
          <p className="text-[11px] text-slate-400">
            {linha.description} · {obraNome}
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cm_qty">
              Quantidade{linha.unit ? ` (${linha.unit})` : ""} *
            </Label>
            <Input
              id="cm_qty"
              value={quantity}
              onChange={(e) => setQuantity(formatQtyInput(e.target.value))}
              placeholder="0"
              inputMode="decimal"
              className="tabular-nums text-lg font-semibold"
              autoComplete="off"
            />
            <p className="text-[11px] text-slate-400 tabular-nums">
              Estava {formatQty(num(linha.quantity))} {linha.unit ?? ""}. Diminuir devolve
              o material ao estoque; aumentar tira mais de lá.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cm_person">Quem pegou</Label>
            <Input
              id="cm_person"
              value={person}
              onChange={(e) => setPerson(upperKeepingCaret(e))}
              placeholder="nome de quem retirou"
              autoCapitalize="characters"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cm_destination">Onde aplicou</Label>
            <Input
              id="cm_destination"
              value={destination}
              onChange={(e) => setDestination(upperKeepingCaret(e))}
              placeholder="em que pedaço da obra foi (opcional)"
              autoCapitalize="characters"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cm_date">Dia</Label>
            <Input
              id="cm_date"
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
            Errou o material em si? Apague aqui e lance o certo — trocar por outro
            deixaria o histórico do estoque contando outra história.
          </p>

          <DialogFooter>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              aria-label="Apagar a baixa deste material"
              className="h-10 px-4 rounded-md border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 transition-colors mr-auto"
            >
              <Trash2 className="w-4 h-4 inline" />
            </button>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
