"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { ChevronRight, Scale, TrendingDown, TrendingUp, Users } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import {
  categoryLabel,
  formatGain,
  formatPeriod,
  formatWeight,
  weightGain,
  type WeightGain,
} from "./animal-shared";
import type { AnimalSex, AnimalWeight, AnimalWithInfo } from "@/lib/types";

// O gráfico entra depois que a aba abriu: a biblioteca de gráficos é pesada e
// só faz falta aqui.
const AnimalPesoChart = dynamic(
  () => import("./animal-peso-chart").then((m) => m.AnimalPesoChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-[200px] rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
    ),
  }
);

/** Mãe ou pai: o animal cadastrado (toca e abre) ou só o que foi escrito. */
export interface Parente {
  animal: AnimalWithInfo | null;
  texto: string | null;
}

/** Uma cria: cadastrada no rebanho ou só lançada no parto. */
export interface Cria {
  key: string;
  animal: AnimalWithInfo | null;
  tag: string | null;
  sex: AnimalSex | null;
  nascimento: string | null;
}

/** A família do animal, montada com o que a tela de Animais já carregou. */
export interface FamiliaAnimal {
  mae: Parente | null;
  pai: Parente | null;
  /** Filhos da mesma mãe, pelos partos lançados. */
  irmaos: AnimalWithInfo[];
  crias: Cria[];
}

interface Props {
  animal: AnimalWithInfo;
  /** Pesagens do animal, em qualquer ordem. */
  weights: AnimalWeight[];
  familia: FamiliaAnimal;
  onOpenAnimal: (id: string) => void;
}

/** Verde no ganho, vermelho na perda, cinza quando não mudou. */
function corDoGanho(diff: number) {
  return diff > 0
    ? "text-emerald-600 dark:text-emerald-400"
    : diff < 0
      ? "text-red-600 dark:text-red-400"
      : "text-slate-400";
}

function gmdTexto(g: WeightGain) {
  return g.perDay != null ? `${g.perDay.toFixed(2).replace(".", ",")} kg/dia` : "—";
}

/**
 * Aba "Evolução" da ficha do animal: o peso ao longo do tempo (gráfico e
 * lista), quanto ganhou ou perdeu de uma pesagem para a outra, e a família.
 */
export function AnimalEvolucaoTab({ animal, weights, familia, onOpenAnimal }: Props) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // da mais velha para a mais nova: cada uma se compara com a de antes
  const asc = [...weights]
    .map((w) => ({ ...w, weight: Number(w.weight) }))
    .sort((a, b) =>
      a.weighed_at === b.weighed_at
        ? a.created_at.localeCompare(b.created_at)
        : a.weighed_at < b.weighed_at
          ? -1
          : 1
    );
  const linhas = asc.map((w, i) => ({
    w,
    ganho: i > 0 ? weightGain(asc[i - 1], w) : null,
  }));
  const primeira = asc[0] ?? null;
  const ultima = asc[asc.length - 1] ?? null;
  const total = primeira && ultima && asc.length > 1 ? weightGain(primeira, ultima) : null;

  const temFamilia =
    !!familia.mae || !!familia.pai || familia.irmaos.length > 0 || familia.crias.length > 0;

  return (
    <div className="space-y-5">
      {/* ── Pesagens ─────────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <Scale className="w-3.5 h-3.5" />
          Peso
        </h3>

        {asc.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Nenhuma pesagem ainda. Use o botão Pesar na ficha — a partir da segunda
            pesagem aparece quanto ganhou ou perdeu.
          </p>
        ) : (
          <>
            {/* Resumo: peso de hoje, quanto mudou desde a primeira e a média por dia */}
            <div className="grid grid-cols-3 gap-2">
              <Resumo
                titulo="Último peso"
                valor={formatWeight(ultima!.weight)}
                detalhe={formatDate(ultima!.weighed_at)}
              />
              <Resumo
                titulo="Desde a 1ª"
                valor={total ? formatGain(total.diff) : "—"}
                detalhe={total ? `em ${formatPeriod(total.days)}` : "só 1 pesagem"}
                cor={total ? corDoGanho(total.diff) : undefined}
              />
              <Resumo
                titulo="GMD"
                valor={total ? gmdTexto(total) : "—"}
                detalhe="ganho médio por dia"
                cor={total ? corDoGanho(total.diff) : undefined}
              />
            </div>

            {asc.length > 1 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 pt-2 pr-1">
                <AnimalPesoChart
                  pontos={asc.map((w) => ({ data: w.weighed_at, peso: w.weight }))}
                  isDark={isDark}
                />
              </div>
            )}

            {/* Cada pesagem, da mais nova para a mais velha, com o ganho ou a
                perda desde a anterior */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
              {[...linhas].reverse().map(({ w, ganho }) => (
                <div key={w.id} className="px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-slate-600 dark:text-slate-300">
                      {formatDate(w.weighed_at)}
                    </span>
                    <span className="text-base font-semibold text-slate-800 dark:text-slate-100">
                      {formatWeight(w.weight)}
                    </span>
                  </div>
                  {ganho ? (
                    <p className={cn("flex items-center gap-1 text-sm font-medium", corDoGanho(ganho.diff))}>
                      {ganho.diff > 0 ? (
                        <TrendingUp className="w-3.5 h-3.5 flex-shrink-0" />
                      ) : ganho.diff < 0 ? (
                        <TrendingDown className="w-3.5 h-3.5 flex-shrink-0" />
                      ) : null}
                      <span>
                        {formatGain(ganho.diff)} em {formatPeriod(ganho.days)}
                        {ganho.perDay != null && (
                          <span className="font-normal opacity-80"> · {gmdTexto(ganho)}</span>
                        )}
                      </span>
                    </p>
                  ) : (
                    <p className="text-sm text-slate-400">Primeira pesagem</p>
                  )}
                  {w.notes && <p className="text-xs text-slate-400 mt-0.5">{w.notes}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ── Família ──────────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <Users className="w-3.5 h-3.5" />
          Família
        </h3>

        {!temFamilia ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Nenhum parente cadastrado. A mãe aparece quando o animal nasce por um parto
            lançado aqui, ou quando o nº dela está escrito no cadastro.
          </p>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
            {familia.mae && (
              <ParenteRow papel="Mãe" parente={familia.mae} onOpenAnimal={onOpenAnimal} />
            )}
            {familia.pai && (
              <ParenteRow papel="Pai" parente={familia.pai} onOpenAnimal={onOpenAnimal} />
            )}
            {familia.crias.map((c) => (
              <ParenteRow
                key={c.key}
                papel={c.sex === "macho" ? "Filho" : c.sex === "femea" ? "Filha" : "Cria"}
                parente={{
                  animal: c.animal,
                  texto: `${c.tag ? `Nº ${c.tag}` : "Sem número"}${
                    c.nascimento ? ` · nasc. ${formatDate(c.nascimento)}` : ""
                  }`,
                }}
                onOpenAnimal={onOpenAnimal}
              />
            ))}
            {familia.irmaos.map((i) => (
              <ParenteRow
                key={i.id}
                papel={i.sex === "macho" ? "Irmão" : "Irmã"}
                parente={{ animal: i, texto: null }}
                onOpenAnimal={onOpenAnimal}
              />
            ))}
          </div>
        )}
        {familia.irmaos.length > 0 && (
          <p className="text-xs text-slate-400">Irmãos por parte de mãe, pelos partos lançados.</p>
        )}
        {animal.sex === "macho" && familia.crias.length > 0 && (
          <p className="text-xs text-slate-400">
            Filhos de um macho: os que têm o nº {animal.tag} escrito como pai no cadastro.
          </p>
        )}
      </section>
    </div>
  );
}

function Resumo({
  titulo,
  valor,
  detalhe,
  cor,
}: {
  titulo: string;
  valor: string;
  detalhe: string;
  cor?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 px-2 py-2 min-w-0">
      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{titulo}</p>
      <p className={cn("text-sm font-semibold text-slate-800 dark:text-slate-100 leading-tight", cor)}>
        {valor}
      </p>
      <p className="text-[11px] text-slate-400 leading-tight mt-0.5">{detalhe}</p>
    </div>
  );
}

/** Um parente: cadastrado → toca e abre a ficha; senão, só o texto. */
function ParenteRow({
  papel,
  parente,
  onOpenAnimal,
}: {
  papel: string;
  parente: Parente;
  onOpenAnimal: (id: string) => void;
}) {
  const a = parente.animal;
  if (!a) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className="w-12 text-sm text-slate-500 dark:text-slate-400 flex-shrink-0">{papel}</span>
        <span className="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-200">
          {parente.texto || "—"}
          <span className="block text-xs text-slate-400">não está cadastrado</span>
        </span>
      </div>
    );
  }
  const saiu = a.active === false;
  const morreu = a.exit_reason === "morte";
  const peso = Number(a.weight);
  return (
    <button
      type="button"
      onClick={() => onOpenAnimal(a.id)}
      className="w-full flex items-center gap-2 px-3 py-2.5 text-left active:bg-slate-50 dark:active:bg-slate-800/60 transition-colors"
    >
      <span className="w-12 text-sm text-slate-500 dark:text-slate-400 flex-shrink-0">{papel}</span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-produmar-700 dark:text-produmar-400">
            Nº {a.tag}
          </span>
          {saiu && (
            <span
              className={cn(
                "px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide",
                morreu
                  ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
              )}
            >
              {morreu ? "Morreu" : "Vendido"}
            </span>
          )}
        </span>
        <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
          {categoryLabel(a.category, a.sex, a.species)}
          {a.breed_name ? ` · ${a.breed_name}` : ""}
          {peso > 0 ? ` · ${formatWeight(peso)}` : ""}
          {a.birth_date ? ` · nasc. ${formatDate(a.birth_date)}` : ""}
        </span>
      </span>
      <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
    </button>
  );
}
