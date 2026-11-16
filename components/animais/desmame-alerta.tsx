"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, ChevronDown, ChevronRight, Loader2, Milk, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatDate, localDateISO } from "@/lib/utils";
import { marcarDesmame } from "@/app/(app)/animais/actions";
import { MESES_DESMAME, idadeComDias, prontaParaDesmame, youngNoun } from "./animal-shared";
import type { Filiacao } from "./relatorio-rebanho";
import type { AnimalWithInfo } from "@/lib/types";

interface Props {
  /** O rebanho da escolha do menu (tipo e raça) — só ativos. */
  animals: AnimalWithInfo[];
  /** Todo o cadastro, para achar o número da mãe. */
  todos: AnimalWithInfo[];
  /** Quem é filho de quem, pelo parto lançado. */
  filiacao: Filiacao[];
  /** Abre a lista já aberta (vem do sino: /animais?desmame=1). */
  abertoInicial?: boolean;
  /** Abre a ficha da cria. */
  onAbrir: (id: string) => void;
}

/**
 * ALERTA DE DESMAME — o dono pediu: "quando o bezerro completar 8 meses de
 * nascimento criar alerta para o desmame do mesmo". Mostra as crias bovinas do
 * rebanho com 8 meses ou mais que ainda não tiveram o desmame marcado; marcar
 * "Desmame feito" grava a data no animal (migration 145) e a cria sai da lista.
 */
export function DesmameAlerta({ animals, todos, filiacao, abertoInicial = false, onAbrir }: Props) {
  const [aberto, setAberto] = useState(abertoInicial);
  const [dia, setDia] = useState(() => localDateISO());
  const [gravando, setGravando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /** O que acabou de ser marcado — para dar para desfazer o toque errado. */
  const [ultimo, setUltimo] = useState<{ ids: string[]; texto: string; dia: string } | null>(null);
  const [, startTransition] = useTransition();

  const maePorCria = useMemo(() => {
    const tagPorId = new Map(todos.map((a) => [a.id, a.tag]));
    const m = new Map<string, string>();
    for (const f of filiacao) {
      if (!f.calf_animal_id) continue;
      const tag = tagPorId.get(f.mother_id);
      if (tag) m.set(f.calf_animal_id, tag);
    }
    return m;
  }, [todos, filiacao]);

  /** As crias prontas, das mais velhas (mais atrasadas) para as mais novas. */
  const crias = useMemo(
    () =>
      animals
        .filter(prontaParaDesmame)
        .sort((a, b) => (a.birth_date ?? "").localeCompare(b.birth_date ?? "")),
    [animals]
  );

  if (crias.length === 0 && !ultimo) return null;

  function marcar(ids: string[], texto: string) {
    setErro(null);
    const quando = dia;
    setGravando(ids.length === 1 ? ids[0] : "todas");
    startTransition(async () => {
      const r = await marcarDesmame(ids, quando);
      setGravando(null);
      if (r && "error" in r) {
        setErro(r.error ?? "Erro ao marcar o desmame");
        return;
      }
      setUltimo({ ids, texto, dia: quando });
    });
  }

  function desfazer() {
    if (!ultimo) return;
    setErro(null);
    setGravando("desfazer");
    const ids = ultimo.ids;
    startTransition(async () => {
      const r = await marcarDesmame(ids, null);
      setGravando(null);
      if (r && "error" in r) {
        setErro(r.error ?? "Erro ao desfazer");
        return;
      }
      setUltimo(null);
    });
  }

  const n = crias.length;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 overflow-hidden dark:border-amber-900/50 dark:bg-amber-950/30">
      {n > 0 && (
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="w-full flex items-center gap-2 min-h-[48px] px-3 text-sm font-medium text-amber-800 dark:text-amber-300 active:bg-amber-100/60 dark:active:bg-amber-900/30"
        >
          <Milk className="w-5 h-5 flex-shrink-0" />
          <span className="flex-1 text-left">
            {n} {n === 1 ? "cria pronta" : "crias prontas"} para desmamar
          </span>
          <span className="text-xs font-normal opacity-70">{MESES_DESMAME}+ meses</span>
          {aberto ? (
            <ChevronDown className="w-4 h-4 flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 flex-shrink-0" />
          )}
        </button>
      )}

      {aberto && n > 0 && (
        <div className="border-t border-amber-200 bg-white dark:border-amber-900/50 dark:bg-slate-900">
          <label className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-100 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-300">
            Dia do desmame
            <input
              type="date"
              value={dia}
              max={localDateISO()}
              onChange={(e) => setDia(e.target.value || localDateISO())}
              className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-2 text-base text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </label>

          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {crias.map((a) => {
              const mae = maePorCria.get(a.id) ?? (a.mae?.trim() || null);
              return (
                <li key={a.id} className="flex items-center gap-2 px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => onAbrir(a.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
                      Nº {a.tag}
                      <span className="ml-1.5 text-xs font-normal text-slate-400 dark:text-slate-500">
                        {youngNoun(a.species, a.sex)}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Mãe {mae ? `Nº ${mae}` : "—"} · {idadeComDias(a.birth_date, a.age_months)}
                    </p>
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={gravando !== null}
                    onClick={() => marcar([a.id], `Nº ${a.tag} desmamado`)}
                    className="h-11 px-3 flex-shrink-0"
                  >
                    {gravando === a.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Desmame feito
                  </Button>
                </li>
              );
            })}
          </ul>

          {n > 1 && (
            <div className="px-3 py-2 border-t border-slate-100 dark:border-slate-800">
              <Button
                type="button"
                variant="outline"
                disabled={gravando !== null}
                onClick={() => {
                  if (
                    !confirm(
                      `Marcar o desmame das ${n} crias em ${formatDate(dia)}?`
                    )
                  )
                    return;
                  marcar(
                    crias.map((a) => a.id),
                    `${n} crias desmamadas`
                  );
                }}
                className="w-full h-11"
              >
                {gravando === "todas" && <Loader2 className="w-4 h-4 animate-spin" />}
                Desmame feito em todas ({n})
              </Button>
            </div>
          )}
        </div>
      )}

      {(ultimo || erro) && (
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2 text-sm border-t",
            erro
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
              : "border-amber-200 bg-white text-slate-600 dark:border-amber-900/50 dark:bg-slate-900 dark:text-slate-300"
          )}
        >
          <span className="flex-1">
            {erro ?? `${ultimo?.texto} em ${formatDate(ultimo?.dia ?? dia)}.`}
          </span>
          {!erro && ultimo && (
            <button
              type="button"
              onClick={desfazer}
              disabled={gravando !== null}
              className="flex items-center gap-1 min-h-[40px] px-2 font-medium text-produmar-700 dark:text-produmar-400"
            >
              {gravando === "desfazer" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Undo2 className="w-4 h-4" />
              )}
              Desfazer
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setUltimo(null);
              setErro(null);
            }}
            className="min-h-[40px] px-2 text-slate-400"
            aria-label="Fechar aviso"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
