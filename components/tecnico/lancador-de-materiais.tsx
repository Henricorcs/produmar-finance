"use client";

import { useMemo, useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MaterialPickerDialog, type MaterialPickerItem } from "./material-picker-dialog";
import { formatQtyInput, parseQty } from "@/components/almoxarifado/supply-shared";
import { cn, formatBRLInput, formatQty, upperKeepingCaret } from "@/lib/utils";

/** Um material da lista: o que foi, quanto, e (se foi comprado) o preço. */
export interface MaterialLancado {
  key: string;
  itemId: string;
  /** O material não estava na lista: o nome foi escrito na mão. */
  freeText: boolean;
  itemText: string;
  quantity: string;
  /** Preço de UMA unidade, do jeito que foi digitado ("1.250,00"). */
  unitCost: string;
}

const QUADRO_VAZIO: MaterialLancado = {
  key: "",
  itemId: "",
  freeText: false,
  itemText: "",
  quantity: "",
  unitCost: "",
};

function novaChave(): string {
  return typeof crypto !== "undefined" ? crypto.randomUUID() : String(Math.random());
}

interface Opcoes {
  /** O cadastro onde se busca o nome e a unidade de cada material. */
  items: MaterialPickerItem[];
  /** Só em Obras: o saldo do estoque — a quantidade não pode passar dele. */
  saldoDe?: (itemId: string) => number;
}

/**
 * O estado do lançamento: a lista já confirmada e o quadro que está sendo
 * preenchido. Fica com a tela (e não dentro do componente) porque é a tela que
 * envia, e na hora de enviar o que ficou no quadro sem confirmar entra junto.
 */
export function useLancadorDeMateriais({ items, saldoDe }: Opcoes) {
  const [linhas, setLinhas] = useState<MaterialLancado[]>([]);
  const [quadro, setQuadro] = useState<MaterialLancado>(QUADRO_VAZIO);
  /** A linha da lista que voltou para o quadro para ser corrigida. */
  const [editando, setEditando] = useState<string | null>(null);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  function nomeDe(l: MaterialLancado): string {
    return l.freeText ? l.itemText.trim() : (itemById.get(l.itemId)?.name ?? "Material");
  }

  function unidadeDe(l: MaterialLancado): string {
    return l.freeText ? "" : (itemById.get(l.itemId)?.unit ?? "");
  }

  const quadroAberto = quadro.freeText || !!quadro.itemId;

  function validar(l: MaterialLancado): string | null {
    if (l.freeText && !l.itemText.trim()) return "Escreva o nome do material";
    if (!l.freeText && !l.itemId) return "Escolha o material";
    const nome = nomeDe(l);
    const qtd = parseQty(l.quantity);
    if (qtd <= 0) return `Informe a quantidade de ${nome}`;
    if (saldoDe && !l.freeText) {
      const saldo = saldoDe(l.itemId);
      if (qtd > saldo)
        return saldo <= 0
          ? `${nome} está zerado no estoque — dê entrada dele antes de baixar`
          : `${nome}: o estoque só tem ${formatQty(saldo)} ${unidadeDe(l)}`.trim();
    }
    return null;
  }

  /** Passa o quadro para a lista — ou para o lugar da linha que estava sendo corrigida. */
  function confirmar(): { error: string } | { linhas: MaterialLancado[] } {
    const erro = validar(quadro);
    if (erro) return { error: erro };
    const pronto = { ...quadro, key: editando ?? novaChave(), itemText: quadro.itemText.trim() };
    const novas = editando
      ? linhas.map((l) => (l.key === editando ? pronto : l))
      : [...linhas, pronto];
    setLinhas(novas);
    setQuadro(QUADRO_VAZIO);
    setEditando(null);
    return { linhas: novas };
  }

  /** Na hora de enviar: o que ficou no quadro sem confirmar entra junto. */
  function finalizar(): { error: string } | { linhas: MaterialLancado[] } {
    return quadroAberto ? confirmar() : { linhas };
  }

  function editar(key: string) {
    const l = linhas.find((x) => x.key === key);
    if (!l) return;
    setEditando(key);
    setQuadro({ ...l });
  }

  /** Escolheu na lista do estoque. Se o material já foi lançado, abre ele para corrigir em vez de repetir. */
  function escolher(itemId: string) {
    const jaLancado = linhas.find((l) => !l.freeText && l.itemId === itemId && l.key !== editando);
    if (jaLancado) return editar(jaLancado.key);
    setQuadro((q) => ({ ...q, itemId, freeText: false, itemText: "" }));
  }

  function escrever() {
    setQuadro((q) => ({ ...q, itemId: "", freeText: true, itemText: "" }));
  }

  function remover(key: string) {
    setLinhas((prev) => prev.filter((l) => l.key !== key));
    if (editando === key) {
      setEditando(null);
      setQuadro(QUADRO_VAZIO);
    }
  }

  function cancelar() {
    setQuadro(QUADRO_VAZIO);
    setEditando(null);
  }

  function limpar() {
    setLinhas([]);
    cancelar();
  }

  return {
    items,
    saldoDe,
    linhas,
    setLinhas,
    quadro,
    setQuadro,
    editando,
    quadroAberto,
    nomeDe,
    unidadeDe,
    confirmar,
    finalizar,
    editar,
    escolher,
    escrever,
    remover,
    cancelar,
    limpar,
  };
}

export type Lancador = ReturnType<typeof useLancadorDeMateriais>;

interface Props {
  lancador: Lancador;
  /** Prefixo dos ids dos campos — cada tela tem o seu. */
  idPrefixo: string;
  /** O que a lista do estoque mostra. Padrão: todo o cadastro do lançador. */
  itensParaEscolher?: MaterialPickerItem[];
  /** Técnico e operador podem escrever na mão o que não acharam na lista. */
  permitirEscrever?: boolean;
  /** Obras: cadastrar o material que faltava sem sair da tela. */
  onCadastrar?: () => void;
  getHint?: (item: MaterialPickerItem) => string;
  tituloPicker?: string;
  /** Pergunta o preço de uma unidade (só quem comprou o material preenche). */
  comPreco?: boolean;
  placeholderEscrito?: string;
  dicaEscrito?: string;
  dicaQuantidade?: string;
}

/**
 * LANÇAR MATERIAIS: um quadro só, e a lista do que já foi confirmado em cima.
 *
 * Antes cada material abria um quadro novo com a quantidade dele, e com quatro
 * ou cinco materiais a tela virava um rolo. Agora o quadro é um só: escolhe o
 * material, diz quanto, confirma — ele desce para a lista em cima, numa linha
 * curta, e o quadro volta vazio para o próximo. Errou? O lápis devolve a linha
 * para o quadro; o X tira da lista.
 */
export function LancadorDeMateriais({
  lancador,
  idPrefixo,
  itensParaEscolher,
  permitirEscrever = false,
  onCadastrar,
  getHint,
  tituloPicker,
  comPreco = false,
  placeholderEscrito = "ex: cano 50mm",
  dicaEscrito,
  dicaQuantidade,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const { linhas, quadro, setQuadro, editando, quadroAberto, saldoDe } = lancador;
  const nomeQuadro = lancador.nomeDe(quadro);
  const unidadeQuadro = lancador.unidadeDe(quadro);
  const saldoQuadro = saldoDe && quadro.itemId ? saldoDe(quadro.itemId) : null;
  const passouDoSaldo = saldoQuadro !== null && parseQty(quadro.quantity) > saldoQuadro;

  const escolhidos = useMemo(
    () =>
      [...linhas.filter((l) => !l.freeText).map((l) => l.itemId), quadro.itemId].filter(Boolean),
    [linhas, quadro.itemId]
  );

  function confirmar() {
    const r = lancador.confirmar();
    setErro("error" in r ? r.error : null);
  }

  function cancelar() {
    lancador.cancelar();
    setErro(null);
  }

  /** O "Ir" do teclado do celular confirma o material em vez de enviar a tela toda. */
  function enterConfirma(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    confirmar();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>Materiais *</Label>
        {linhas.length > 1 && (
          <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
            {linhas.length} materiais
          </span>
        )}
      </div>

      {linhas.length > 0 && (
        <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {linhas.map((l) => {
            const nome = lancador.nomeDe(l);
            const corrigindo = editando === l.key;
            return (
              <li
                key={l.key}
                className={cn(
                  "flex items-center gap-1 pl-3 pr-1 py-1.5",
                  corrigindo && "bg-produmar-50 dark:bg-produmar-950/40"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 break-words leading-snug">
                    {nome}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {formatQty(parseQty(l.quantity))} {lancador.unidadeDe(l)}
                    {l.unitCost ? ` · R$ ${l.unitCost} cada` : ""}
                    {corrigindo ? " · corrigindo" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    lancador.editar(l.key);
                    setErro(null);
                  }}
                  aria-label={`Corrigir ${nome}`}
                  className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-produmar-600 hover:bg-produmar-50 dark:hover:bg-slate-800 transition-colors flex-shrink-0"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => lancador.remover(l.key)}
                  aria-label={`Tirar ${nome} da lista`}
                  className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!quadroAberto ? (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="w-full flex items-center justify-center gap-2 min-h-[52px] rounded-lg border-2 border-dashed border-produmar-300 dark:border-produmar-700 text-base font-semibold text-produmar-600 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-slate-800 transition-colors"
        >
          <Plus className="w-5 h-5" />
          {linhas.length > 0 ? "Adicionar outro material" : "Adicionar material"}
        </button>
      ) : (
        <div className="rounded-xl border-2 border-produmar-300 dark:border-produmar-700 p-3 space-y-2.5">
          {quadro.freeText ? (
            <div className="space-y-1">
              <Label htmlFor={`${idPrefixo}_nome`}>Material *</Label>
              <Input
                id={`${idPrefixo}_nome`}
                value={quadro.itemText}
                onChange={(e) => {
                  setQuadro((q) => ({ ...q, itemText: upperKeepingCaret(e) }));
                  setErro(null);
                }}
                placeholder={placeholderEscrito}
                autoCapitalize="characters"
                className="h-12 text-lg placeholder:text-base"
                autoComplete="off"
                onKeyDown={enterConfirma}
              />
              {dicaEscrito && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500">{dicaEscrito}</p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="w-full flex items-center justify-between gap-2 text-left rounded-lg -mx-1 px-1 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <span className="min-w-0">
                <span className="block text-base font-semibold text-slate-800 dark:text-slate-100 break-words leading-snug">
                  {nomeQuadro}
                </span>
                {saldoQuadro !== null && (
                  <span className="block text-[11px] text-slate-400 tabular-nums">
                    Em estoque: {formatQty(saldoQuadro)} {unidadeQuadro}
                  </span>
                )}
              </span>
              <span className="text-xs font-medium text-produmar-600 dark:text-produmar-400 flex-shrink-0">
                Trocar
              </span>
            </button>
          )}

          <div className="space-y-1">
            <Label htmlFor={`${idPrefixo}_qty`}>
              Quantidade{unidadeQuadro ? ` (${unidadeQuadro})` : ""} *
            </Label>
            <Input
              id={`${idPrefixo}_qty`}
              value={quadro.quantity}
              onChange={(e) => {
                setQuadro((q) => ({ ...q, quantity: formatQtyInput(e.target.value) }));
                setErro(null);
              }}
              placeholder="0"
              inputMode="decimal"
              className="h-12 text-lg font-semibold tabular-nums"
              autoComplete="off"
              onKeyDown={enterConfirma}
            />
            {passouDoSaldo && saldoQuadro !== null && (
              <p className="text-[11px] text-red-600 dark:text-red-400 tabular-nums">
                {saldoQuadro <= 0
                  ? "Este material está zerado no estoque — dê entrada dele antes de baixar."
                  : `Passou do saldo: o estoque só tem ${formatQty(saldoQuadro)} ${unidadeQuadro}.`}
              </p>
            )}
            {dicaQuantidade && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">{dicaQuantidade}</p>
            )}
          </div>

          {comPreco && (
            <div className="space-y-1">
              <Label htmlFor={`${idPrefixo}_cost`}>
                Preço de {unidadeQuadro ? `1 ${unidadeQuadro}` : "cada um"} (R$)
              </Label>
              <Input
                id={`${idPrefixo}_cost`}
                value={quadro.unitCost}
                onChange={(e) =>
                  setQuadro((q) => ({ ...q, unitCost: formatBRLInput(e.target.value) }))
                }
                placeholder="0,00"
                inputMode="decimal"
                className="h-12 text-lg tabular-nums"
                autoComplete="off"
                onKeyDown={enterConfirma}
              />
              {/* opcional de propósito: obrigar preço faz o pessoal parar de avisar */}
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Só se você comprou. Material que já era da casa deixa em branco.
              </p>
            </div>
          )}

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {erro}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1 h-12" onClick={cancelar}>
              Cancelar
            </Button>
            <Button type="button" className="flex-[2] h-12 font-semibold" onClick={confirmar}>
              <Check className="w-4 h-4" />
              {editando ? "Salvar correção" : "Confirmar"}
            </Button>
          </div>
        </div>
      )}

      <MaterialPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        items={itensParaEscolher ?? lancador.items}
        escolhidos={escolhidos}
        onToggle={(item) => {
          lancador.escolher(item.id);
          setErro(null);
          setPickerOpen(false);
        }}
        onEscrever={permitirEscrever ? lancador.escrever : undefined}
        onCadastrar={onCadastrar}
        getHint={getHint}
        titulo={tituloPicker}
        umPorVez
      />
    </div>
  );
}
