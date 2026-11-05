"use client";

import { useState, useTransition } from "react";
import { Clock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBRL, formatBRLInput, parseMoney } from "@/lib/utils";
import { updateMachine } from "@/app/(app)/operacoes/actions";
import type { Machine } from "@/lib/types";

/**
 * O VALOR DA HORA da máquina para a obra (migration 132).
 *
 * Quando o encarregado lança a diária e diz que o colaborador usou esta
 * máquina, ele anota só o horímetro: as horas × este valor é o que vai para o
 * custo da obra. O preço fica aqui, no cadastro da máquina, com quem cuida da
 * frota — ninguém digita preço na rua.
 */
export function ValorDaHora({
  machine,
  pronto,
}: {
  machine: Pick<Machine, "id" | "hourly_rate">;
  /** A migration 132 já rodou? Sem ela, só o aviso. */
  pronto: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const atual = Number(machine.hourly_rate ?? 0);

  function abrir() {
    setValor(atual > 0 ? formatBRLInput(atual) : "");
    setErro(null);
    setEditando(true);
  }

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = await updateMachine(machine.id, { hourly_rate: parseMoney(valor) });
      if (r && "error" in r && r.error) {
        setErro(r.error);
        return;
      }
      setEditando(false);
    });
  }

  if (!pronto) {
    return (
      <p className="text-[11px] text-amber-700 dark:text-amber-400 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 px-3 py-2">
        Valor da hora na obra: falta rodar a migration 132 no Supabase.
      </p>
    );
  }

  if (editando) {
    return (
      <form
        onSubmit={salvar}
        className="space-y-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5"
      >
        <label htmlFor="mq_valor_hora" className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Valor da hora na obra
        </label>
        <div className="flex gap-2">
          <Input
            id="mq_valor_hora"
            value={valor}
            onChange={(e) => setValor(formatBRLInput(e.target.value))}
            placeholder="0,00"
            inputMode="numeric"
            autoComplete="off"
            className="h-11 tabular-nums"
            autoFocus
          />
          <Button type="submit" disabled={isPending} className="h-11">
            {isPending ? "..." : "Salvar"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setEditando(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          É o que cada hora de horímetro custa para a obra quando esta máquina é lançada
          junto com a diária. Deixe vazio para tirar.
        </p>
        {erro && <p className="text-[12px] text-red-600 dark:text-red-400">{erro}</p>}
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={abrir}
      className="w-full flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
    >
      <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
      <span className="text-xs text-slate-500 dark:text-slate-400">Valor da hora na obra</span>
      <span className="ml-auto text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
        {atual > 0 ? formatBRL(atual) : "não cadastrado"}
      </span>
      <Pencil className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
    </button>
  );
}
