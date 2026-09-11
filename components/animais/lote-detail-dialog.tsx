"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowDownRight, ArrowUpRight, Lock, LockOpen, Plus, Scale, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, formatBRL, formatDate, formatQty, localDateISO, upperKeepingCaret } from "@/lib/utils";
import {
  createAnimalLoteMovimento,
  deleteAnimalLoteMovimento,
  fecharAnimalLote,
  reabrirAnimalLote,
} from "@/app/(app)/animais/actions";
import {
  ICON_BUTTON,
  formatDecimalInput,
  localLabel,
  parseDecimal,
} from "./animal-shared";
import {
  LOTE_MOVIMENTO_LABEL,
  type AnimalLoteMovimento,
  type AnimalLoteMovimentoKind,
  type AnimalLoteResumo,
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  lote: AnimalLoteResumo | null;
  /** Movimentos de todos os ciclos — o diálogo filtra os deste. */
  movimentos: AnimalLoteMovimento[];
  onLancarVenda: (lote: AnimalLoteResumo) => void;
  onLancarDespesa: (lote: AnimalLoteResumo) => void;
  onEditar: (lote: AnimalLoteResumo) => void;
}

const TIPOS: { value: AnimalLoteMovimentoKind; label: string }[] = [
  { value: "morte", label: "Morte" },
  { value: "entrada", label: "Entrada" },
  { value: "ajuste", label: "Outra saída" },
];

/**
 * O CICLO POR DENTRO: o que está vivo, o que morreu e quanto o tanque deu.
 *
 * A quantidade só muda por MOVIMENTO — entrada nova, morte ou correção de
 * contagem. É o que mantém a conta explicável: dá para apontar cada peixe que
 * saiu do saldo.
 *
 * A venda baixa o saldo sozinha, pela quantidade de cabeças informada nela.
 */
export function LoteDetailDialog({
  open,
  onClose,
  lote,
  movimentos,
  onLancarVenda,
  onLancarDespesa,
  onEditar,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<{ onde: "movimento" | "ciclo"; msg: string } | null>(null);

  const [kind, setKind] = useState<AnimalLoteMovimentoKind>("morte");
  const [quantity, setQuantity] = useState("");
  const [movedOn, setMovedOn] = useState(localDateISO());
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setKind("morte");
    setQuantity("");
    setMovedOn(localDateISO());
    setNotes("");
    setErro(null);
  }, [open, lote?.id]);

  const meus = useMemo(
    () =>
      movimentos
        .filter((m) => m.lote_id === lote?.id)
        .sort((a, b) => b.moved_on.localeCompare(a.moved_on)),
    [movimentos, lote?.id]
  );

  if (!lote) return null;

  const palavra = localLabel(lote.species);
  const fechado = lote.status === "fechado";
  const saldo = Number(lote.saldo ?? 0);

  function handleAddMovimento(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!lote) return;

    const qtd = parseDecimal(quantity);
    if (qtd <= 0) {
      setErro({ onde: "movimento", msg: "Informe a quantidade" });
      return;
    }

    startTransition(async () => {
      const r = await createAnimalLoteMovimento({
        lote_id: lote.id,
        kind,
        moved_on: movedOn,
        // A correção pode ser para menos: o sinal vem do botão, não do teclado.
        quantity: kind === "ajuste" ? -qtd : qtd,
        notes,
      });
      if (r && "error" in r) {
        setErro({ onde: "movimento", msg: r.error ?? "Erro ao lançar" });
        return;
      }
      setQuantity("");
      setNotes("");
    });
  }

  function handleDeleteMovimento(m: AnimalLoteMovimento) {
    if (!confirm(`Apagar este movimento de ${formatQty(Math.abs(Number(m.quantity)))}?`))
      return;
    setErro(null);
    startTransition(async () => {
      const r = await deleteAnimalLoteMovimento(m.id);
      if (r && "error" in r) setErro({ onde: "movimento", msg: r.error ?? "Erro ao apagar" });
    });
  }

  function handleFechar() {
    if (!lote) return;
    const msg =
      `Fechar o ciclo do ${lote.tanque_name}?\n\n` +
      (saldo !== 0
        ? `Sobraram ${formatQty(saldo)} no saldo — isso vira uma correção de contagem e o saldo zera.\n\n`
        : "") +
      `Bruto: ${formatBRL(Number(lote.bruto))}\n` +
      `Custo: ${formatBRL(Number(lote.custo))}\n` +
      `Líquido: ${formatBRL(Number(lote.liquido))}`;
    if (!confirm(msg)) return;

    setErro(null);
    startTransition(async () => {
      const r = await fecharAnimalLote(lote.id, localDateISO());
      if (r && "error" in r) {
        setErro({ onde: "ciclo", msg: r.error ?? "Erro ao fechar o ciclo" });
        return;
      }
      onClose();
    });
  }

  function handleReabrir() {
    if (!lote) return;
    if (!confirm("Reabrir este ciclo? A correção do fechamento continua na lista.")) return;
    setErro(null);
    startTransition(async () => {
      const r = await reabrirAnimalLote(lote.id);
      if (r && "error" in r) setErro({ onde: "ciclo", msg: r.error ?? "Erro ao reabrir" });
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">
            {lote.tanque_name}
            {lote.name ? ` · ${lote.name}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            {palavra} · ciclo aberto em {formatDate(lote.start_date)}
            {fechado && lote.closed_at ? ` · fechado em ${formatDate(lote.closed_at)}` : ""}
          </p>

          {/* O que está vivo */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
            <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800">
              <Numero label="VIVOS" valor={formatQty(saldo)} tom="text-cyan-700 dark:text-cyan-400" />
              <Numero
                label="MORTES"
                valor={`${formatQty(Number(lote.mortes))} · ${formatQty(Number(lote.mortalidade_pct))}%`}
                tom="text-rose-700 dark:text-rose-400"
              />
              <Numero
                label="VENDIDOS"
                valor={formatQty(Number(lote.vendidos))}
                tom="text-slate-700 dark:text-slate-300"
              />
            </div>
            <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
              <Numero
                label="BRUTO"
                valor={formatBRL(Number(lote.bruto))}
                tom="text-emerald-700 dark:text-emerald-400"
              />
              <Numero
                label="CUSTO"
                valor={formatBRL(Number(lote.custo))}
                tom="text-rose-700 dark:text-rose-400"
              />
              <Numero
                label="LÍQUIDO"
                valor={formatBRL(Number(lote.liquido))}
                tom={
                  Number(lote.liquido) < 0
                    ? "text-rose-700 dark:text-rose-400"
                    : "text-emerald-700 dark:text-emerald-400"
                }
              />
            </div>
          </div>

          {Number(lote.kg_vendidos) > 0 && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
              {formatQty(Number(lote.kg_vendidos))} kg vendidos · custo de{" "}
              {formatBRL(Number(lote.custo_por_kg))} por quilo produzido
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              className="h-11 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => onLancarVenda(lote)}
            >
              Lançar venda
            </Button>
            <Button type="button" className="h-11" onClick={() => onLancarDespesa(lote)}>
              Lançar despesa
            </Button>
          </div>

          {/* Onde se conserta o que foi lançado errado. Esta tela mostra só os
              números do ciclo; quem guarda lançamento por lançamento é a
              Ficha, e sem essa linha ninguém descobria isso. */}
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Errou a venda ou a despesa? Abra a aba Ficha e toque no lançamento para
            corrigir ou apagar.
          </p>

          {/* Movimento novo */}
          {!fechado && (
            <form
              onSubmit={handleAddMovimento}
              className="space-y-2 p-3 rounded-xl bg-produmar-50/30 dark:bg-slate-800/40 border border-produmar-100 dark:border-slate-700"
            >
              <div className="grid grid-cols-3 gap-1.5">
                {TIPOS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setKind(t.value)}
                    className={cn(
                      "min-h-[40px] rounded-lg border text-xs font-semibold transition-colors",
                      kind === t.value
                        ? "bg-produmar-600 border-produmar-600 text-white"
                        : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="mv_qtd" className="text-[11px]">
                    Quantidade *
                  </Label>
                  <Input
                    id="mv_qtd"
                    value={quantity}
                    onChange={(e) => setQuantity(formatDecimalInput(e.target.value))}
                    placeholder="0"
                    className="h-11 tabular-nums font-semibold sm:h-10"
                    inputMode="decimal"
                    autoComplete="off"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <Label htmlFor="mv_data" className="text-[11px]">
                    Data
                  </Label>
                  <Input
                    id="mv_data"
                    type="date"
                    value={movedOn}
                    onChange={(e) => setMovedOn(e.target.value)}
                    className="h-11 tabular-nums sm:h-10"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Input
                  value={notes}
                  onChange={(e) => setNotes(upperKeepingCaret(e))}
                  placeholder="motivo (opcional)"
                  autoCapitalize="characters"
                  autoComplete="off"
                />
                <Button type="submit" disabled={isPending || !quantity.trim()}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {kind === "ajuste" && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Tira do saldo o que você digitar. É a saída que não é morte nem
                  venda: peixe passado para outro {palavra.toLowerCase()}, consumo da
                  casa, ou a recontagem quando o número do sistema não bate com o real.
                </p>
              )}

              {erro?.onde === "movimento" && <Aviso>{erro.msg}</Aviso>}
            </form>
          )}

          {/* Os movimentos */}
          {meus.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Movimentos
              </p>
              <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                {meus.map((m) => {
                  const qtd = Number(m.quantity);
                  const soma = m.kind === "entrada" || (m.kind === "ajuste" && qtd > 0);
                  return (
                    <li key={m.id} className="flex items-center gap-2.5 px-3 py-2">
                      <span
                        className={cn(
                          "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0",
                          soma
                            ? "bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400"
                            : "bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400"
                        )}
                      >
                        {soma ? (
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        ) : (
                          <ArrowDownRight className="w-3.5 h-3.5" />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 dark:text-slate-200 truncate">
                          {LOTE_MOVIMENTO_LABEL[m.kind]}
                          {m.notes ? ` · ${m.notes}` : ""}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          {formatDate(m.moved_on)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "text-sm font-semibold tabular-nums flex-shrink-0",
                          soma
                            ? "text-cyan-700 dark:text-cyan-400"
                            : "text-rose-700 dark:text-rose-400"
                        )}
                      >
                        {soma ? "+" : "−"}
                        {formatQty(Math.abs(qtd))}
                      </span>
                      {!fechado && (
                        <button
                          type="button"
                          aria-label="Apagar movimento"
                          onClick={() => handleDeleteMovimento(m)}
                          disabled={isPending}
                          className={cn(ICON_BUTTON, "text-slate-300 hover:text-red-500 -mr-2")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {erro?.onde === "ciclo" && <Aviso>{erro.msg}</Aviso>}

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onEditar(lote)}
              disabled={isPending}
            >
              Editar ciclo
            </Button>
            {fechado ? (
              <Button type="button" variant="outline" onClick={handleReabrir} disabled={isPending}>
                <LockOpen className="w-4 h-4" />
                Reabrir
              </Button>
            ) : (
              <Button type="button" onClick={handleFechar} disabled={isPending}>
                <Lock className="w-4 h-4" />
                Fechar ciclo
              </Button>
            )}
          </div>

          <Button type="button" variant="outline" className="w-full" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Numero({ label, valor, tom }: { label: string; valor: string; tom: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-3 px-1">
      <span className={cn("text-sm font-bold leading-none tabular-nums", tom)}>{valor}</span>
      <span className="text-[10px] text-slate-400 dark:text-slate-500 tracking-wide">
        {label}
      </span>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
      {children}
    </p>
  );
}
