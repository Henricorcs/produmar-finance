"use client";

import { cn } from "@/lib/utils";
import { SPECIES_META, SPECIES_OPTIONS, criacaoPorLote, speciesOf } from "./animal-shared";
import type { AnimalSpecies, AnimalWithInfo } from "@/lib/types";

interface Props {
  /** Já filtrados e na ordem escolhida na tela. */
  animals: AnimalWithInfo[];
  /** Em "todos os tipos" os números vêm separados por criação. */
  groupBySpecies: boolean;
  /** Quem tem vacina marcada como pendente — só esse ganha a tarja laranja. */
  pendingAnimalIds: Set<string>;
  /** Toque no número = abre a ficha do animal. */
  onOpen: (id: string) => void;
  /** Recado quando o filtro não devolve ninguém. */
  emptyMessage?: string;
}

/**
 * O quadro do rebanho: só os NÚMEROS dos animais, um bloco por criação
 * (Bovinos, Equinos...). Raça, peso, parto, vacina e foto ficam na ficha —
 * é lá que se mexe, tocando no número. A planilha larga continua a um toque
 * do botão "Planilha", para quem está no curral vacinando.
 */
export function RebanhoGrid({
  animals,
  groupBySpecies,
  pendingAnimalIds,
  onOpen,
  emptyMessage,
}: Props) {
  /** Um bloco por criação; com o tipo já escolhido na tela, um bloco só. */
  const groups: { species: AnimalSpecies | null; animals: AnimalWithInfo[] }[] = groupBySpecies
    ? SPECIES_OPTIONS.map((o) => ({
        species: o.value,
        animals: animals.filter((a) => speciesOf(a.species) === o.value),
      })).filter((g) => g.animals.length > 0)
    : [{ species: null, animals }];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
      {emptyMessage ? (
        <p className="px-4 py-8 text-center text-base text-slate-500 dark:text-slate-400">
          {emptyMessage}
        </p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {groups.map((g) => (
            <div key={g.species ?? "unico"}>
              {/* O nome da criação só aparece quando há mais de uma na tela */}
              {g.species && (
                <div className="flex items-baseline gap-2 px-3 pt-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {SPECIES_META[g.species].plural}
                  </p>
                  <span className="text-[11px] font-semibold tabular-nums text-slate-300 dark:text-slate-600">
                    {g.animals.length}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-4 gap-1.5 p-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
                {g.animals.map((a) => {
                  const pending = pendingAnimalIds.has(a.id);
                  // O SEXO dá a cor do quadro: macho azul, fêmea rosa. Peixe e
                  // ave (controle por lote) não têm sexo e ficam brancos.
                  const sexo = criacaoPorLote(a.species) ? null : a.sex;
                  const nomeSexo = sexo === "macho" ? "macho" : sexo === "femea" ? "fêmea" : "";
                  // Para descarte (147): o amarelo manda — o dono pediu que o
                  // animal marcado para descarte se destaque na tela principal
                  const descarte = !!a.descarte_em;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onOpen(a.id)}
                      aria-label={`Animal ${a.tag}${nomeSexo ? `, ${nomeSexo}` : ""}${
                        descarte ? ", para descarte" : ""
                      }${pending ? ", com vacina pendente" : ""}. Abrir a ficha`}
                      title={
                        pending
                          ? `Animal ${a.tag}${nomeSexo ? ` (${nomeSexo})` : ""} — tem vacina marcada como pendente (toque para abrir a ficha)`
                          : `Abrir a ficha do animal ${a.tag}${nomeSexo ? ` (${nomeSexo})` : ""}`
                      }
                      className={cn(
                        "relative flex items-center justify-center min-h-[56px] px-1 rounded-xl border-2 font-bold tabular-nums transition-colors active:scale-[0.96]",
                        // código de compra do PO (CSCN 21368) não cabe em 19px
                        // no quadradinho do iPhone: letra menor e quebra no espaço
                        a.tag.length > 6
                          ? "text-[15px] leading-tight text-center break-words"
                          : "text-[19px]",
                        descarte
                          ? "border-yellow-400 bg-yellow-200 text-yellow-900 hover:bg-yellow-300 dark:border-yellow-600 dark:bg-yellow-700/50 dark:text-yellow-50 dark:hover:bg-yellow-700/70"
                          : sexo === "macho"
                          ? "border-sky-300 bg-sky-100 text-sky-900 hover:bg-sky-200 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-100 dark:hover:bg-sky-900/60"
                          : sexo === "femea"
                            ? "border-pink-300 bg-pink-100 text-pink-900 hover:bg-pink-200 dark:border-pink-700 dark:bg-pink-900/40 dark:text-pink-100 dark:hover:bg-pink-900/60"
                            : "border-slate-200 bg-white text-slate-800 hover:bg-produmar-50 hover:border-produmar-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                      )}
                    >
                      {a.tag}
                      {/* Vacina pendente: a bolinha laranja no canto (a cor do
                          quadro agora é do sexo) */}
                      {pending && (
                        <span
                          aria-hidden
                          className={cn(
                            "absolute top-1 right-1 w-3 h-3 rounded-full ring-2 ring-white dark:ring-slate-900",
                            // no quadro amarelo do descarte a bolinha laranja sumiria
                            descarte ? "bg-orange-600" : "bg-amber-500"
                          )}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
