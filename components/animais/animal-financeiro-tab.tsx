"use client";

import { useMemo, useState } from "react";
import { HandCoins, Hash, Plus, Receipt, Scale, Stethoscope, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatBRL, formatDate, formatQty } from "@/lib/utils";
import { SPECIES_META, SPECIES_OPTIONS, speciesOf } from "./animal-shared";
import { AnimalDespesaDialog } from "./animal-despesa-dialog";
import { AnimalVendaDialog } from "./animal-venda-dialog";
import type {
  AnimalDespesa,
  AnimalFinanceiroLinha,
  AnimalLoteResumo,
  AnimalSpecies,
  AnimalVenda,
  AnimalWithInfo,
} from "@/lib/types";

interface Props {
  /** A ficha inteira, vinda da view — venda, despesa e tratamento com custo. */
  linhas: AnimalFinanceiroLinha[];
  /** As despesas cruas, para abrir uma na correção a partir da ficha. */
  despesas: AnimalDespesa[];
  /** As vendas de lote cruas (peixe, ave) — idem, para corrigir pela ficha. */
  vendas?: AnimalVenda[];
  /** Os ciclos (089) — para dizer de qual tanque é cada linha. */
  lotes?: AnimalLoteResumo[];
  /** Rebanho inteiro (inclusive quem já saiu), para amarrar a despesa. */
  animals: AnimalWithInfo[];
}

type Filtro = "todos" | AnimalSpecies;

/** O que cada espécie rendeu e custou — é a conta que a ficha existe para dar. */
interface ResumoEspecie {
  species: AnimalSpecies;
  receitas: number;
  despesas: number;
  resultado: number;
  vendidos: number;
  /** Quantos ainda estão no rebanho — o custo é deles daqui pra frente. */
  noRebanho: number;
}

/**
 * A FICHA DE RECEITAS E DESPESAS COM ANIMAIS, separada por espécie.
 *
 * De um lado o que entrou: cada animal vendido, com a forma da venda (na
 * unidade ou no peso — e no peso, quantos quilos a quanto o quilo). Do outro o
 * que saiu: as despesas lançadas aqui e os tratamentos que tiveram custo.
 *
 * A conta é por ESPÉCIE porque é essa a pergunta do dia a dia: o caprino se
 * paga? O bovino está dando o que devia? Somar tudo junto esconde justamente
 * isso.
 */
export function AnimalFinanceiroTab({
  linhas,
  despesas,
  vendas = [],
  lotes = [],
  animals,
}: Props) {
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [despesaOpen, setDespesaOpen] = useState(false);
  const [editDespesa, setEditDespesa] = useState<AnimalDespesa | null>(null);
  const [vendaOpen, setVendaOpen] = useState(false);
  const [editVenda, setEditVenda] = useState<AnimalVenda | null>(null);

  /** Quantos animais de cada espécie ainda estão no curral. */
  const noRebanho = useMemo(() => {
    const map = new Map<AnimalSpecies, number>();
    for (const a of animals) {
      if (!a.active) continue;
      const s = speciesOf(a.species);
      map.set(s, (map.get(s) ?? 0) + 1);
    }
    return map;
  }, [animals]);

  /** A conta de cada espécie: o que entrou, o que saiu e o que sobrou. */
  const porEspecie = useMemo(() => {
    const map = new Map<AnimalSpecies, ResumoEspecie>();
    const zero = (s: AnimalSpecies): ResumoEspecie => ({
      species: s,
      receitas: 0,
      despesas: 0,
      resultado: 0,
      vendidos: 0,
      noRebanho: noRebanho.get(s) ?? 0,
    });

    for (const l of linhas) {
      const s = speciesOf(l.species);
      const cur = map.get(s) ?? zero(s);
      if (l.kind === "venda") {
        cur.receitas += Number(l.value);
        cur.vendidos += 1;
      } else {
        cur.despesas += Number(l.value);
      }
      cur.resultado = cur.receitas - cur.despesas;
      map.set(s, cur);
    }

    // espécie que só tem bicho no curral (nada vendido, nada gasto) também
    // aparece: é ela que o dono olha para ver que ainda não lançou nada
    for (const [s, qtd] of noRebanho) if (!map.has(s)) map.set(s, { ...zero(s), noRebanho: qtd });

    return [...map.values()].sort((a, b) => b.resultado - a.resultado);
  }, [linhas, noRebanho]);

  /** O recorte escolhido nos chips — vale para o extrato e para o topo. */
  const doFiltro = useMemo(
    () =>
      linhas
        .filter((l) => (filtro === "todos" ? true : speciesOf(l.species) === filtro))
        .sort((a, b) => b.entry_date.localeCompare(a.entry_date)),
    [linhas, filtro]
  );

  const totais = useMemo(() => {
    let receitas = 0;
    let despesasTotal = 0;
    for (const l of doFiltro) {
      if (l.kind === "venda") receitas += Number(l.value);
      else despesasTotal += Number(l.value);
    }
    return { receitas, despesas: despesasTotal, resultado: receitas - despesasTotal };
  }, [doFiltro]);

  /** A despesa crua por trás da linha — só ela é editável a partir daqui. */
  const despesaPorId = useMemo(
    () => new Map(despesas.map((d) => [d.id, d])),
    [despesas]
  );

  /**
   * A venda de lote por trás da linha. A venda de um ANIMAL não entra aqui: ela
   * se corrige desfazendo a baixa dele, na ficha do animal.
   */
  const vendaPorId = useMemo(() => new Map(vendas.map((v) => [v.id, v])), [vendas]);

  /** De qual tanque é o lançamento — o ciclo guarda o nome, a linha não. */
  const tanquePorLote = useMemo(
    () => new Map(lotes.map((l) => [l.id, l.tanque_name])),
    [lotes]
  );

  function abrirDespesa(d: AnimalDespesa | null) {
    setEditDespesa(d);
    setDespesaOpen(true);
  }

  function abrirVenda(v: AnimalVenda | null) {
    setEditVenda(v);
    setVendaOpen(true);
  }

  return (
    <div className="space-y-4">
      {/* O que entrou, o que saiu e o que sobrou no recorte escolhido */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
        <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800">
          <Numero
            label="RECEITAS"
            valor={formatBRL(totais.receitas)}
            tom="text-emerald-700 dark:text-emerald-400"
          />
          <Numero
            label="DESPESAS"
            valor={formatBRL(totais.despesas)}
            tom="text-rose-700 dark:text-rose-400"
          />
          <Numero
            label="RESULTADO"
            valor={formatBRL(totais.resultado)}
            tom={
              totais.resultado < 0
                ? "text-rose-700 dark:text-rose-400"
                : "text-emerald-700 dark:text-emerald-400"
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          className="h-11 bg-emerald-600 hover:bg-emerald-700"
          onClick={() => abrirVenda(null)}
        >
          <Plus className="w-4 h-4" />
          Lançar venda
        </Button>
        <Button className="h-11" onClick={() => abrirDespesa(null)}>
          <Plus className="w-4 h-4" />
          Lançar despesa
        </Button>
      </div>

      {/* Filtro por espécie — é o recorte que a ficha existe para dar */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
        <Chip
          label="Todos"
          ativo={filtro === "todos"}
          onClick={() => setFiltro("todos")}
        />
        {SPECIES_OPTIONS.map((s) => (
          <Chip
            key={s.value}
            label={SPECIES_META[s.value].plural}
            ativo={filtro === s.value}
            onClick={() => setFiltro(filtro === s.value ? "todos" : s.value)}
          />
        ))}
      </div>

      {/* A conta de cada espécie — o custo separado por bicho */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Por tipo de animal
        </p>
        {porEspecie.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 py-4 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
            Nada lançado ainda — nem venda, nem despesa.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {porEspecie.map((r) => (
              <button
                key={r.species}
                type="button"
                onClick={() => setFiltro(filtro === r.species ? "todos" : r.species)}
                className={cn(
                  "rounded-xl border bg-white dark:bg-slate-900 p-3 text-left transition-colors active:scale-[0.99]",
                  filtro === r.species
                    ? "border-produmar-400 dark:border-produmar-700"
                    : "border-slate-200 dark:border-slate-700"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-xs font-semibold px-2 py-0.5 rounded-full",
                      SPECIES_META[r.species].chip
                    )}
                  >
                    {SPECIES_META[r.species].plural}
                  </span>
                  <span
                    className={cn(
                      "text-base font-bold tabular-nums",
                      r.resultado < 0
                        ? "text-rose-700 dark:text-rose-400"
                        : "text-emerald-700 dark:text-emerald-400"
                    )}
                  >
                    {formatBRL(r.resultado)}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] tabular-nums">
                  <span className="text-slate-500 dark:text-slate-400">
                    Entrou{" "}
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {formatBRL(r.receitas)}
                    </span>
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    Saiu{" "}
                    <span className="font-semibold text-rose-700 dark:text-rose-400">
                      {formatBRL(r.despesas)}
                    </span>
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                  {r.vendidos} {r.vendidos === 1 ? "vendido" : "vendidos"} ·{" "}
                  {r.noRebanho} no rebanho
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* O extrato: cada movimento, na ordem em que aconteceu */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          {doFiltro.length === 0
            ? "Nenhum lançamento"
            : doFiltro.length === 1
              ? "1 lançamento"
              : `${doFiltro.length} lançamentos`}
          {filtro !== "todos" ? ` · ${SPECIES_META[filtro].plural}` : ""}
        </p>

        {doFiltro.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 py-6 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
            A venda do animal com brinco entra sozinha quando você dá baixa nele. A
            venda de lote (peixe, ave) e a despesa são lançadas nos botões acima.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {doFiltro.map((l) => {
              const venda = l.kind === "venda";
              const despesa = despesaPorId.get(l.id) ?? null;
              const vendaLote = venda ? (vendaPorId.get(l.id) ?? null) : null;
              const editavel = (l.kind === "despesa" && !!despesa) || !!vendaLote;
              const tanque =
                tanquePorLote.get(vendaLote?.lote_id ?? despesa?.lote_id ?? "") ?? null;
              const Icone = venda ? HandCoins : l.kind === "tratamento" ? Stethoscope : Receipt;
              return (
                <div
                  key={`${l.kind}-${l.id}`}
                  onClick={
                    editavel
                      ? () => (vendaLote ? abrirVenda(vendaLote) : abrirDespesa(despesa))
                      : undefined
                  }
                  role={editavel ? "button" : undefined}
                  tabIndex={editavel ? 0 : undefined}
                  onKeyDown={
                    editavel
                      ? (e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          e.preventDefault();
                          if (vendaLote) abrirVenda(vendaLote);
                          else abrirDespesa(despesa);
                        }
                      : undefined
                  }
                  className={cn(
                    "flex items-start gap-2.5 px-3 py-2.5 bg-white dark:bg-slate-900",
                    editavel &&
                      "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                  )}
                >
                  <span
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                      venda
                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400"
                    )}
                  >
                    <Icone className="w-4 h-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                      {l.description}
                    </p>
                    {/* No peso, a conta por extenso: 400 kg × R$ 12,00 = R$ 4.800,00 */}
                    {venda && l.sale_mode === "peso" && Number(l.weight_kg) > 0 && (
                      <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 tabular-nums truncate flex items-center gap-1">
                        <Scale className="w-3 h-3 flex-shrink-0" />
                        {formatQty(Number(l.weight_kg))} kg ×{" "}
                        {formatBRL(Number(l.price_per_kg))} = {formatBRL(Number(l.value))}
                      </p>
                    )}
                    {/* Na unidade, a mesma conta por extenso: 200 un × R$ 22,00 */}
                    {venda && l.sale_mode === "unidade" && Number(l.quantity) > 0 && (
                      <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 tabular-nums truncate flex items-center gap-1">
                        <Hash className="w-3 h-3 flex-shrink-0" />
                        {formatQty(Number(l.quantity))} un ×{" "}
                        {formatBRL(Number(l.price_per_unit))} = {formatBRL(Number(l.value))}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                      {formatDate(l.entry_date)}
                      {` · ${SPECIES_META[speciesOf(l.species)].label}`}
                      {tanque ? ` · ${tanque}` : ""}
                      {l.animal_tag ? ` · nº ${l.animal_tag}` : ""}
                      {l.category ? ` · ${l.category}` : ""}
                      {l.person ? ` · ${l.person}` : ""}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "text-sm font-semibold tabular-nums flex-shrink-0",
                      venda
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-rose-700 dark:text-rose-400"
                    )}
                  >
                    {venda ? "" : "− "}
                    {formatBRL(Number(l.value))}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-start gap-1.5">
          <Wallet className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
          <span>
            A venda vai para o módulo Contas — tanto a do animal com brinco, na baixa
            dele, quanto a de lote lançada aqui. A despesa e o tratamento ficam só na
            ficha. Toque numa despesa ou numa venda de lote para corrigir; o tratamento
            se corrige na ficha do animal, e a venda do animal, desfazendo a baixa.
          </span>
        </p>
      </div>

      <AnimalDespesaDialog
        open={despesaOpen}
        onClose={() => setDespesaOpen(false)}
        despesa={editDespesa}
        presetSpecies={filtro === "todos" ? null : filtro}
        lotes={lotes}
        animals={animals}
      />

      <AnimalVendaDialog
        open={vendaOpen}
        onClose={() => setVendaOpen(false)}
        venda={editVenda}
        presetSpecies={filtro === "todos" ? null : filtro}
        lotes={lotes}
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
      <span className="text-[11px] font-medium leading-none tracking-wide text-slate-400 dark:text-slate-500">
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
        "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
        ativo
          ? "bg-produmar-600 border-produmar-600 text-white"
          : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
      )}
    >
      {label}
    </button>
  );
}
