"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowDownLeft, ArrowUpRight, Minus, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { actionError } from "@/lib/action-result";
import { cn, formatQty, machineCategoryLabel, upperKeepingCaret } from "@/lib/utils";
import { salvarMachineTroca } from "@/app/(app)/frota/actions";
import { FOOTER_CANCEL, FOOTER_SUBMIT, STICKY_FOOTER, categoryChip } from "./frota-shared";
import { MACHINE_CATEGORIES, type MachineParceiro, type MachineTroca } from "@/lib/types";

/** "2026-09-15" → "Terça-feira, 15 de setembro" (o dia tocado, por extenso). */
function diaPorExtenso(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const texto = new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

interface Props {
  /** O dia tocado no calendário (YYYY-MM-DD) — null fecha a caixa. */
  dia: string | null;
  onClose: () => void;
  parceiro: MachineParceiro;
  /** O que já está lançado NESTE dia, um por tipo de máquina. */
  doDia: MachineTroca[];
}

/**
 * O DIA DA TROCA — quantas máquinas dele vieram e quantas nossas foram.
 *
 * Os dois números moram no mesmo dia porque é assim que a conta é feita: se ele
 * botou duas caçambas e nós botamos uma, ficamos devendo uma. O tipo de máquina
 * separa a conta — diária de caçamba se paga com caçamba.
 *
 * Zerar os dois APAGA o dia: é como se desmarca um lançamento errado.
 */
export function TrocaDiaDialog({ dia, onClose, parceiro, doDia }: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [category, setCategory] = useState("cacamba");
  const [recebidas, setRecebidas] = useState(0);
  const [cedidas, setCedidas] = useState(0);
  const [notes, setNotes] = useState("");

  /** O que já está lançado no dia, por tipo — é o que preenche os contadores. */
  const porTipo = useMemo(() => {
    const map = new Map<string, MachineTroca>();
    for (const t of doDia) map.set(t.category, t);
    return map;
  }, [doDia]);

  // Ao abrir o dia (e ao trocar de tipo), os contadores mostram o que já está
  // lançado daquele tipo — salvar CORRIGE o dia, não soma por cima.
  useEffect(() => {
    if (!dia) return;
    const atual = porTipo.get(category);
    setRecebidas(Number(atual?.recebidas ?? 0));
    setCedidas(Number(atual?.cedidas ?? 0));
    setNotes(atual?.notes ?? "");
    setErro(null);
  }, [dia, category, porTipo]);

  // Um dia novo começa no tipo que já tem lançamento (ou na caçamba, que é o
  // que mais roda).
  useEffect(() => {
    if (!dia) return;
    setCategory(doDia[0]?.category ?? "cacamba");
  }, [dia, doDia]);

  const jaLancado = porTipo.get(category);
  const vaiApagar = recebidas === 0 && cedidas === 0 && !!jaLancado;

  function salvar() {
    if (!dia) return;
    setErro(null);
    startTransition(async () => {
      const falha = actionError(
        await salvarMachineTroca({
          parceiro_id: parceiro.id,
          entry_date: dia,
          category,
          recebidas,
          cedidas,
          notes,
        })
      );
      if (falha) {
        setErro(falha);
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={!!dia} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">
            {dia ? diaPorExtenso(dia) : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Troca com{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {parceiro.name}
            </span>
          </p>

          {/* O tipo separa a conta: caçamba se paga com caçamba */}
          <div className="space-y-1.5">
            <Label>Tipo de máquina</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {MACHINE_CATEGORIES.map((c) => {
                const lancado = porTipo.get(c.value);
                return (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={cn(
                      "min-h-[40px] rounded-lg border text-xs font-semibold transition-colors relative",
                      category === c.value
                        ? "bg-produmar-600 border-produmar-600 text-white"
                        : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                    )}
                  >
                    {c.label}
                    {/* já tem lançamento deste tipo no dia */}
                    {lancado && (
                      <span
                        className={cn(
                          "absolute top-1 right-1 w-1.5 h-1.5 rounded-full",
                          category === c.value ? "bg-white" : "bg-produmar-500"
                        )}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Os dois números do dia */}
          <Contador
            label={`Máquinas de ${parceiro.name.split(" ")[0]} que vieram`}
            hint="trabalharam PARA NÓS neste dia — é o que a gente passa a dever"
            icon={ArrowDownLeft}
            tom="amber"
            valor={recebidas}
            onChange={setRecebidas}
          />

          <Contador
            label="Minhas máquinas que foram"
            hint="trabalharam PARA ELE neste dia — é o que a gente paga"
            icon={ArrowUpRight}
            tom="emerald"
            valor={cedidas}
            onChange={setCedidas}
          />

          {/* A conta do dia, na frente de quem lança */}
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 px-3 py-2">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {recebidas === 0 && cedidas === 0
                ? vaiApagar
                  ? "Salvar assim APAGA este dia."
                  : "Um dia sem máquina nenhuma não entra no calendário."
                : cedidas === recebidas
                  ? "Dia empatado: ninguém fica devendo."
                  : cedidas > recebidas
                    ? `Neste dia ele fica devendo ${formatQty(cedidas - recebidas)} ${
                        cedidas - recebidas === 1 ? "diária" : "diárias"
                      } de ${machineCategoryLabel(category).toLowerCase()}.`
                    : `Neste dia você fica devendo ${formatQty(recebidas - cedidas)} ${
                        recebidas - cedidas === 1 ? "diária" : "diárias"
                      } de ${machineCategoryLabel(category).toLowerCase()}.`}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tr_notes">Observação</Label>
            <Textarea
              id="tr_notes"
              value={notes}
              onChange={(e) => setNotes(upperKeepingCaret(e))}
              placeholder="opcional — onde foi o serviço, quem operou"
              rows={2}
              className="uppercase placeholder:normal-case placeholder:lowercase"
            />
          </div>

          {/* O que já está lançado neste dia, nos outros tipos */}
          {doDia.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Lançado neste dia
              </p>
              <div className="flex flex-wrap gap-1.5">
                {doDia.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setCategory(t.category)}
                    className={cn(
                      "text-[11px] font-semibold px-2 py-1 rounded-full",
                      categoryChip(t.category)
                    )}
                  >
                    {machineCategoryLabel(t.category)}: dele {formatQty(Number(t.recebidas))} ·
                    minhas {formatQty(Number(t.cedidas))}
                  </button>
                ))}
              </div>
            </div>
          )}

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {erro}
            </p>
          )}
        </div>

        <DialogFooter className={STICKY_FOOTER}>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
            className={cn(FOOTER_CANCEL, "h-11 sm:h-10")}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={salvar}
            disabled={isPending}
            className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}
          >
            {isPending ? "Salvando..." : vaiApagar ? "Apagar o dia" : "Salvar o dia"}
            {vaiApagar && <Trash2 className="w-4 h-4" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * O contador de máquinas do dia: − 2 +, com alvo de toque grande. Meia diária
 * existe (o meio dia de máquina), então o passo do meio fica no toque longo do
 * "+" não — para não esconder função, tem um botão de meia diária à parte.
 */
function Contador({
  label,
  hint,
  icon: Icon,
  tom,
  valor,
  onChange,
}: {
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tom: "amber" | "emerald";
  valor: number;
  onChange: (v: number) => void;
}) {
  const cor =
    tom === "amber"
      ? "text-amber-700 dark:text-amber-400"
      : "text-emerald-700 dark:text-emerald-400";
  const fundo =
    tom === "amber"
      ? "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50"
      : "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50";

  function passo(delta: number) {
    const novo = Math.round((valor + delta) * 100) / 100;
    onChange(novo < 0 ? 0 : novo);
  }

  return (
    <div className={cn("rounded-xl border p-3 space-y-2", fundo)}>
      <div className="flex items-start gap-2">
        <Icon className={cn("w-4 h-4 flex-shrink-0 mt-0.5", cor)} />
        <div className="min-w-0">
          <p className={cn("text-sm font-semibold leading-tight", cor)}>{label}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => passo(-1)}
          aria-label="Menos uma"
          className="w-12 h-12 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-600 dark:text-slate-300 active:scale-95 transition-transform"
        >
          <Minus className="w-5 h-5" />
        </button>

        <div className="text-center">
          <span className={cn("text-3xl font-black tabular-nums", cor)}>
            {formatQty(valor)}
          </span>
          <button
            type="button"
            onClick={() => onChange(valor === 0.5 ? 0 : 0.5)}
            className="block mx-auto text-[10px] font-medium text-slate-400 dark:text-slate-500 underline underline-offset-2"
          >
            meia diária
          </button>
        </div>

        <button
          type="button"
          onClick={() => passo(1)}
          aria-label="Mais uma"
          className="w-12 h-12 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center justify-center text-slate-600 dark:text-slate-300 active:scale-95 transition-transform"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
