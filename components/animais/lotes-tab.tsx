"use client";

import { useEffect, useMemo, useState } from "react";
import { Layers, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatBRL, formatDate, formatQty } from "@/lib/utils";
import { SPECIES_META, SPECIES_OPTIONS, localLabel, speciesOf } from "./animal-shared";
import { TanquesDialog } from "./tanques-dialog";
import { LoteDialog } from "./lote-dialog";
import { LoteDetailDialog } from "./lote-detail-dialog";
import { AnimalVendaDialog } from "./animal-venda-dialog";
import { AnimalDespesaDialog } from "./animal-despesa-dialog";
import type {
  AnimalLoteMovimento,
  AnimalLoteResumo,
  AnimalSpecies,
  AnimalTanque,
  AnimalWithInfo,
} from "@/lib/types";

interface Props {
  tanques: AnimalTanque[];
  lotes: AnimalLoteResumo[];
  movimentos: AnimalLoteMovimento[];
  /** Rebanho inteiro — a despesa lançada daqui pode amarrar num animal. */
  animals: AnimalWithInfo[];
  /**
   * Tipo fixo — quando a aba Rebanho abre esta tela já dentro de uma criação.
   * Nesse caso os chips de tipo somem: quem escolhe o tipo é o seletor de cima,
   * e dois seletores da mesma coisa na mesma tela é convite para erro.
   */
  speciesFixa?: AnimalSpecies | null;
}

type Filtro = "todos" | AnimalSpecies;

/**
 * A ABA DOS TANQUES: um cartão por ciclo, e o geral em cima.
 *
 * É a resposta para as duas perguntas de quem cria peixe: quanto morreu, e
 * quanto cada tanque deu. O geral é a soma dos ciclos que estão na tela — o que
 * foi lançado sem tanque (a bomba do viveiro) não aparece aqui; aparece na
 * ficha, que é onde mora a conta da espécie inteira.
 */
export function LotesTab({
  tanques,
  lotes,
  movimentos,
  animals,
  speciesFixa,
}: Props) {
  const [filtro, setFiltro] = useState<Filtro>(speciesFixa ?? "todos");

  // Trocou de criação lá em cima: esta tela acompanha.
  useEffect(() => {
    if (speciesFixa) setFiltro(speciesFixa);
  }, [speciesFixa]);
  const [tanquesOpen, setTanquesOpen] = useState(false);
  const [loteOpen, setLoteOpen] = useState(false);
  const [editLote, setEditLote] = useState<AnimalLoteResumo | null>(null);
  const [detalhe, setDetalhe] = useState<AnimalLoteResumo | null>(null);
  const [vendaLote, setVendaLote] = useState<AnimalLoteResumo | null>(null);
  const [despesaLote, setDespesaLote] = useState<AnimalLoteResumo | null>(null);

  const doFiltro = useMemo(
    () =>
      lotes
        .filter((l) => (filtro === "todos" ? true : speciesOf(l.species) === filtro))
        // aberto primeiro, e dentro disso o mais novo em cima
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === "aberto" ? -1 : 1;
          return b.start_date.localeCompare(a.start_date);
        }),
    [lotes, filtro]
  );

  /** O geral: a soma do que está na tela. */
  const geral = useMemo(() => {
    let vivos = 0;
    let mortes = 0;
    let entradas = 0;
    let bruto = 0;
    let custo = 0;
    for (const l of doFiltro) {
      vivos += Number(l.saldo);
      mortes += Number(l.mortes);
      entradas += Number(l.entradas);
      bruto += Number(l.bruto);
      custo += Number(l.custo);
    }
    return {
      vivos,
      mortes,
      entradas,
      bruto,
      custo,
      liquido: bruto - custo,
      mortalidade: entradas > 0 ? (mortes * 100) / entradas : 0,
    };
  }, [doFiltro]);

  /** O ciclo do detalhe sempre relido da lista: fechar um recarrega os números. */
  const detalheAtual = detalhe ? (lotes.find((l) => l.id === detalhe.id) ?? null) : null;

  return (
    <div className="space-y-4">
      {/* O geral */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
        <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800">
          <Numero label="VIVOS" valor={formatQty(geral.vivos)} tom="text-cyan-700 dark:text-cyan-400" />
          <Numero
            label="MORTALIDADE"
            valor={`${formatQty(Math.round(geral.mortalidade * 100) / 100)}%`}
            tom="text-rose-700 dark:text-rose-400"
          />
          <Numero
            label="LÍQUIDO"
            valor={formatBRL(geral.liquido)}
            tom={
              geral.liquido < 0
                ? "text-rose-700 dark:text-rose-400"
                : "text-emerald-700 dark:text-emerald-400"
            }
          />
        </div>
        <div className="grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          <Numero
            label="BRUTO"
            valor={formatBRL(geral.bruto)}
            tom="text-emerald-700 dark:text-emerald-400"
          />
          <Numero
            label="CUSTO"
            valor={formatBRL(geral.custo)}
            tom="text-rose-700 dark:text-rose-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          className="h-11"
          onClick={() => {
            setEditLote(null);
            setLoteOpen(true);
          }}
        >
          <Plus className="w-4 h-4" />
          Novo ciclo
        </Button>
        <Button variant="outline" className="h-11" onClick={() => setTanquesOpen(true)}>
          <Settings2 className="w-4 h-4" />
          {localLabel(filtro === "todos" ? "piscicultura" : filtro)}s
        </Button>
      </div>

      {/* Filtro por tipo — some quando o tipo já veio escolhido de fora */}
      {!speciesFixa && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
          <Chip label="Todos" ativo={filtro === "todos"} onClick={() => setFiltro("todos")} />
          {SPECIES_OPTIONS.map((s) => (
            <Chip
              key={s.value}
              label={SPECIES_META[s.value].plural}
              ativo={filtro === s.value}
              onClick={() => setFiltro(filtro === s.value ? "todos" : s.value)}
            />
          ))}
        </div>
      )}

      {/* Um cartão por ciclo */}
      {doFiltro.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500 py-8 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
          Nenhum ciclo ainda. Cadastre os tanques e abra um ciclo em cada um, com os
          alevinos que entraram.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {doFiltro.map((l) => {
            const fechado = l.status === "fechado";
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setDetalhe(l)}
                className={cn(
                  "rounded-xl border bg-white dark:bg-slate-900 p-3 text-left transition-colors active:scale-[0.99]",
                  fechado
                    ? "border-slate-200 opacity-70 dark:border-slate-700"
                    : "border-cyan-200 dark:border-cyan-900/50"
                )}
              >
                <div className="flex items-center gap-2">
                  <Layers
                    className={cn(
                      "w-4 h-4 flex-shrink-0",
                      fechado ? "text-slate-400" : "text-cyan-600 dark:text-cyan-400"
                    )}
                  />
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {l.tanque_name}
                  </span>
                  {fechado && (
                    <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-slate-400 flex-shrink-0">
                      fechado
                    </span>
                  )}
                </div>

                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">
                  {l.name ? `${l.name} · ` : ""}
                  desde {formatDate(l.start_date)}
                </p>

                <div className="mt-2 flex items-baseline justify-between gap-2 tabular-nums">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {formatQty(Number(l.saldo))} vivos
                  </span>
                  <span className="text-xs text-rose-600 dark:text-rose-400">
                    {formatQty(Number(l.mortalidade_pct))}% morte
                  </span>
                </div>

                <div className="mt-1 flex items-baseline justify-between gap-2 tabular-nums">
                  <span className="text-[11px] text-slate-400">
                    {formatBRL(Number(l.bruto))} − {formatBRL(Number(l.custo))}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-bold",
                      Number(l.liquido) < 0
                        ? "text-rose-700 dark:text-rose-400"
                        : "text-emerald-700 dark:text-emerald-400"
                    )}
                  >
                    {formatBRL(Number(l.liquido))}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        O geral é a soma dos ciclos desta tela. Despesa e venda lançadas sem tanque
        não entram aqui — elas contam na aba Ficha, que é a conta da criação inteira.
      </p>

      <TanquesDialog
        open={tanquesOpen}
        onClose={() => setTanquesOpen(false)}
        tanques={tanques}
        species={filtro === "todos" ? "piscicultura" : filtro}
      />

      <LoteDialog
        open={loteOpen}
        onClose={() => setLoteOpen(false)}
        lote={editLote}
        tanques={tanques}
        presetSpecies={filtro === "todos" ? null : filtro}
      />

      <LoteDetailDialog
        open={!!detalheAtual}
        onClose={() => setDetalhe(null)}
        lote={detalheAtual}
        movimentos={movimentos}
        onLancarVenda={(l) => {
          setDetalhe(null);
          setVendaLote(l);
        }}
        onLancarDespesa={(l) => {
          setDetalhe(null);
          setDespesaLote(l);
        }}
        onEditar={(l) => {
          setDetalhe(null);
          setEditLote(l);
          setLoteOpen(true);
        }}
      />

      <AnimalVendaDialog
        open={!!vendaLote}
        onClose={() => setVendaLote(null)}
        venda={null}
        presetSpecies={vendaLote ? speciesOf(vendaLote.species) : null}
        presetLoteId={vendaLote?.id ?? null}
        lotes={lotes}
      />

      <AnimalDespesaDialog
        open={!!despesaLote}
        onClose={() => setDespesaLote(null)}
        despesa={null}
        presetSpecies={despesaLote ? speciesOf(despesaLote.species) : null}
        presetLoteId={despesaLote?.id ?? null}
        lotes={lotes}
        animals={animals}
      />
    </div>
  );
}

function Numero({ label, valor, tom }: { label: string; valor: string; tom: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-3 px-1">
      <span className={cn("text-sm sm:text-base font-bold leading-none tabular-nums", tom)}>
        {valor}
      </span>
      <span className="text-[10px] text-slate-400 dark:text-slate-500 tracking-wide">
        {label}
      </span>
    </div>
  );
}

function Chip({
  label,
  ativo,
  onClick,
}: {
  label: string;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-shrink-0 px-3 min-h-[36px] rounded-full text-xs font-medium border transition-colors",
        ativo
          ? "bg-produmar-600 border-produmar-600 text-white"
          : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
      )}
    >
      {label}
    </button>
  );
}
