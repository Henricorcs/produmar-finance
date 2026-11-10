"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Info } from "lucide-react";
import { cn, formatBRL } from "@/lib/utils";
import { SPECIES_META, SPECIES_OPTIONS, speciesOf } from "./animal-shared";
import type { AnimalFinanceiroLinha, AnimalSpecies, AnimalWithInfo } from "@/lib/types";

interface Props {
  /** A ficha inteira, vinda da view — venda, despesa e tratamento com custo. */
  linhas: AnimalFinanceiroLinha[];
  /** Rebanho inteiro (inclusive quem já saiu): é dele que sai a raça. */
  animals: AnimalWithInfo[];
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_EXTENSO = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** O que entrou e o que saiu num mês. */
interface Conta {
  custo: number;
  receita: number;
}

/**
 * Uma linha do relatório: uma raça de um tipo de animal, com os 12 meses do
 * ano escolhido.
 *
 * Três tipos de linha:
 *   • a raça de verdade — o que foi lançado para um animal daquela raça;
 *   • "Sem raça no cadastro" — o animal existe, mas ninguém marcou a raça dele;
 *   • "Geral do tipo (sem raça)" — o que foi lançado só com o tipo, sem animal
 *     (ração, sal, frete, venda de lote de peixe e ave). O dono escolheu NÃO
 *     dividir isso entre as raças: aparece à parte, do jeito que foi lançado.
 */
interface Grupo {
  chave: string;
  species: AnimalSpecies;
  nome: string;
  geral: boolean;
  semCadastro: boolean;
  meses: Conta[];
}

type Modo = "mes" | "ano";
type Filtro = "todos" | AnimalSpecies;

const somar = (contas: Conta[]): Conta =>
  contas.reduce(
    (t, c) => ({ custo: t.custo + c.custo, receita: t.receita + c.receita }),
    { custo: 0, receita: 0 }
  );

const temMovimento = (c: Conta) => c.custo !== 0 || c.receita !== 0;

/**
 * RELATÓRIO POR RAÇA — custo, receita e resultado de cada raça, mês a mês,
 * e depois o consolidado do ano.
 *
 * A pergunta que ele responde: "quanto o Nelore me custou em março, quanto
 * rendeu e o que sobrou?" — e, no fim do ano, qual raça se pagou.
 */
export function AnimalRelatorioRaca({ linhas, animals }: Props) {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth());
  const [modo, setModo] = useState<Modo>("mes");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [aberto, setAberto] = useState<string | null>(null);

  const animalPorId = useMemo(() => new Map(animals.map((a) => [a.id, a])), [animals]);

  /** Os anos que têm lançamento — e o ano corrente, mesmo vazio. */
  const anos = useMemo(() => {
    const s = new Set<number>([hoje.getFullYear()]);
    for (const l of linhas) {
      const y = Number(l.entry_date?.slice(0, 4));
      if (y) s.add(y);
    }
    return [...s].sort((a, b) => a - b);
  }, [linhas]);

  /** Cada raça de cada tipo, com os 12 meses do ano escolhido. */
  const grupos = useMemo(() => {
    const map = new Map<string, Grupo>();
    for (const l of linhas) {
      if (!l.entry_date || Number(l.entry_date.slice(0, 4)) !== ano) continue;
      const m = Number(l.entry_date.slice(5, 7)) - 1;
      if (m < 0 || m > 11) continue;

      const species = speciesOf(l.species);
      const animal = l.animal_id ? animalPorId.get(l.animal_id) : undefined;
      let chave: string;
      let nome: string;
      let geral = false;
      let semCadastro = false;
      if (!l.animal_id) {
        chave = `${species}|geral`;
        nome = "Geral do tipo (sem raça)";
        geral = true;
      } else if (animal?.breed_id) {
        chave = `${species}|${animal.breed_id}`;
        nome = animal.breed_name ?? "Raça sem nome";
      } else {
        chave = `${species}|sem-cadastro`;
        nome = "Sem raça no cadastro";
        semCadastro = true;
      }

      const g =
        map.get(chave) ??
        ({
          chave,
          species,
          nome,
          geral,
          semCadastro,
          meses: Array.from({ length: 12 }, () => ({ custo: 0, receita: 0 })),
        } satisfies Grupo);
      const valor = Number(l.value) || 0;
      if (l.kind === "venda") g.meses[m].receita += valor;
      else g.meses[m].custo += valor;
      map.set(chave, g);
    }
    return [...map.values()];
  }, [linhas, ano, animalPorId]);

  /** Os tipos que têm lançamento no ano — viram os botões do filtro. */
  const especiesDoAno = useMemo(
    () => SPECIES_OPTIONS.map((o) => o.value).filter((s) => grupos.some((g) => g.species === s)),
    [grupos]
  );

  const conta = (g: Grupo): Conta => (modo === "mes" ? g.meses[mes] : somar(g.meses));

  /** As linhas do recorte, separadas por tipo; a raça que deu mais fica em cima. */
  const porEspecie = useMemo(() => {
    const valor = (g: Grupo): Conta => (modo === "mes" ? g.meses[mes] : somar(g.meses));
    return especiesDoAno
      .filter((s) => filtro === "todos" || filtro === s)
      .map((s) => {
        const doTipo = grupos
          .filter((g) => g.species === s && temMovimento(valor(g)))
          .sort((a, b) => {
            // raça de verdade primeiro; "sem cadastro" e "geral" no fim
            const peso = (g: Grupo) => (g.geral ? 2 : g.semCadastro ? 1 : 0);
            if (peso(a) !== peso(b)) return peso(a) - peso(b);
            const ra = valor(a);
            const rb = valor(b);
            return rb.receita - rb.custo - (ra.receita - ra.custo);
          });
        return { species: s, grupos: doTipo, total: somar(doTipo.map(valor)) };
      })
      .filter((e) => e.grupos.length > 0);
  }, [especiesDoAno, grupos, filtro, modo, mes]);

  const total = somar(porEspecie.map((e) => e.total));
  const periodo = modo === "mes" ? `${MESES_EXTENSO[mes]} de ${ano}` : `${ano}`;

  function mudarAno(delta: number) {
    const i = anos.indexOf(ano) + delta;
    if (i >= 0 && i < anos.length) {
      setAno(anos[i]);
      setAberto(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Mês ou ano */}
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {(
          [
            ["mes", "Mês a mês"],
            ["ano", "Ano inteiro"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setModo(v)}
            className={cn(
              "h-9 rounded-lg text-sm font-medium transition-colors",
              modo === v
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                : "text-slate-500 dark:text-slate-400"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* O ano: setas para os anos que têm lançamento */}
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900">
        <button
          type="button"
          aria-label="Ano anterior"
          disabled={anos.indexOf(ano) <= 0}
          onClick={() => mudarAno(-1)}
          className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 disabled:opacity-30"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-base font-semibold tabular-nums text-slate-800 dark:text-slate-100">
          {ano}
        </span>
        <button
          type="button"
          aria-label="Próximo ano"
          disabled={anos.indexOf(ano) >= anos.length - 1}
          onClick={() => mudarAno(1)}
          className="h-9 w-9 flex items-center justify-center rounded-lg text-slate-500 disabled:opacity-30"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* O mês — só no modo mês a mês */}
      {modo === "mes" && (
        <div className="grid grid-cols-6 gap-1.5">
          {MESES.map((nome, i) => {
            const movimento = grupos.some((g) => temMovimento(g.meses[i]));
            return (
              <button
                key={nome}
                type="button"
                onClick={() => setMes(i)}
                className={cn(
                  "relative h-9 rounded-lg text-xs font-medium border transition-colors",
                  mes === i
                    ? "bg-produmar-600 border-produmar-600 text-white"
                    : movimento
                      ? "bg-white border-slate-200 text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
                      : "bg-white border-slate-100 text-slate-300 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-600"
                )}
              >
                {nome}
              </button>
            );
          })}
        </div>
      )}

      {/* O tipo de animal */}
      {especiesDoAno.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
          <Chip label="Todos" ativo={filtro === "todos"} onClick={() => setFiltro("todos")} />
          {especiesDoAno.map((s) => (
            <Chip
              key={s}
              label={SPECIES_META[s].plural}
              ativo={filtro === s}
              onClick={() => setFiltro(filtro === s ? "todos" : s)}
            />
          ))}
        </div>
      )}

      {/* O resultado do período */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
        <p className="pt-2.5 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
          {modo === "mes" ? "Resultado de " : "Resultado do ano de "}
          {periodo}
        </p>
        <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800">
          <Numero label="CUSTO" valor={total.custo} tom="text-rose-700 dark:text-rose-400" />
          <Numero label="RECEITA" valor={total.receita} tom="text-emerald-700 dark:text-emerald-400" />
          <Numero
            label="RESULTADO"
            valor={total.receita - total.custo}
            tom={
              total.receita - total.custo < 0
                ? "text-rose-700 dark:text-rose-400"
                : "text-emerald-700 dark:text-emerald-400"
            }
          />
        </div>
      </div>

      {/* Raça por raça, separadas por tipo */}
      {porEspecie.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500 py-6 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
          Nada lançado em {periodo} — nem venda, nem despesa.
        </p>
      ) : (
        porEspecie.map((e) => (
          <div key={e.species} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  "text-xs font-semibold px-2 py-0.5 rounded-full",
                  SPECIES_META[e.species].chip
                )}
              >
                {SPECIES_META[e.species].plural}
              </span>
              <span
                className={cn(
                  "text-xs font-semibold tabular-nums",
                  e.total.receita - e.total.custo < 0
                    ? "text-rose-700 dark:text-rose-400"
                    : "text-emerald-700 dark:text-emerald-400"
                )}
              >
                {formatBRL(e.total.receita - e.total.custo)}
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              {e.grupos.map((g) => {
                const c = conta(g);
                const resultado = c.receita - c.custo;
                const expandido = modo === "ano" && aberto === g.chave;
                return (
                  <div key={g.chave} className="bg-white dark:bg-slate-900">
                    <button
                      type="button"
                      disabled={modo !== "ano"}
                      onClick={() => setAberto(expandido ? null : g.chave)}
                      className="w-full text-left px-3 py-2.5 flex items-start gap-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p
                          className={cn(
                            "text-sm font-medium truncate",
                            g.geral || g.semCadastro
                              ? "text-slate-500 dark:text-slate-400 italic"
                              : "text-slate-800 dark:text-slate-100"
                          )}
                        >
                          {g.nome}
                        </p>
                        <div className="mt-0.5 flex gap-3 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                          <span>
                            Custo{" "}
                            <span className="font-semibold text-rose-700 dark:text-rose-400">
                              {formatBRL(c.custo)}
                            </span>
                          </span>
                          <span>
                            Receita{" "}
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                              {formatBRL(c.receita)}
                            </span>
                          </span>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "text-sm font-bold tabular-nums flex-shrink-0",
                          resultado < 0
                            ? "text-rose-700 dark:text-rose-400"
                            : "text-emerald-700 dark:text-emerald-400"
                        )}
                      >
                        {formatBRL(resultado)}
                      </span>
                      {modo === "ano" && (
                        <ChevronDown
                          className={cn(
                            "w-4 h-4 mt-0.5 flex-shrink-0 text-slate-300 dark:text-slate-600 transition-transform",
                            expandido && "rotate-180"
                          )}
                        />
                      )}
                    </button>

                    {/* O ano dessa raça, mês a mês */}
                    {expandido && (
                      <div className="px-3 pb-3">
                        <table className="w-full text-[11px] tabular-nums">
                          <thead>
                            <tr className="text-slate-400 dark:text-slate-500">
                              <th className="text-left font-medium py-1">Mês</th>
                              <th className="text-right font-medium py-1">Custo</th>
                              <th className="text-right font-medium py-1">Receita</th>
                              <th className="text-right font-medium py-1">Resultado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {g.meses.map((m, i) => {
                              const r = m.receita - m.custo;
                              const vazio = !temMovimento(m);
                              return (
                                <tr
                                  key={i}
                                  className={vazio ? "text-slate-300 dark:text-slate-600" : ""}
                                >
                                  <td className="py-1 text-slate-500 dark:text-slate-400">
                                    {MESES[i]}
                                  </td>
                                  <td className={cn("py-1 text-right", !vazio && "text-rose-700 dark:text-rose-400")}>
                                    {vazio ? "—" : formatBRL(m.custo)}
                                  </td>
                                  <td className={cn("py-1 text-right", !vazio && "text-emerald-700 dark:text-emerald-400")}>
                                    {vazio ? "—" : formatBRL(m.receita)}
                                  </td>
                                  <td
                                    className={cn(
                                      "py-1 text-right font-semibold",
                                      !vazio &&
                                        (r < 0
                                          ? "text-rose-700 dark:text-rose-400"
                                          : "text-emerald-700 dark:text-emerald-400")
                                    )}
                                  >
                                    {vazio ? "—" : formatBRL(r)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-start gap-1.5">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
        <span>
          Cada raça mostra o que foi lançado para um animal dela: a venda com brinco, o
          tratamento com custo e a despesa do animal. A despesa lançada só com o tipo,
          sem escolher animal, e a venda de lote de peixe e ave ficam em “Geral do tipo
          (sem raça)”, sem dividir entre as raças.
          {modo === "ano" ? " Toque numa raça para ver o ano dela mês a mês." : ""}
        </span>
      </p>
    </div>
  );
}

function Numero({ label, valor, tom }: { label: string; valor: number; tom: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-3 px-1">
      <span className={cn("text-sm sm:text-base font-bold leading-none tabular-nums", tom)}>
        {formatBRL(valor)}
      </span>
      <span className="text-[11px] font-medium leading-none tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </span>
    </div>
  );
}

function Chip({ label, ativo, onClick }: { label: string; ativo: boolean; onClick: () => void }) {
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
