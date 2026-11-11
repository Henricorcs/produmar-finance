"use client";

import { cn } from "@/lib/utils";
import { SPECIES_META, SPECIES_OPTIONS, speciesOf } from "./animal-shared";
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
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => onOpen(a.id)}
                      title={
                        pending
                          ? `Animal ${a.tag} — tem vacina marcada como pendente (toque para abrir a ficha)`
                          : `Abrir a ficha do animal ${a.tag}`
                      }
                      className={cn(
                        "flex items-center justify-center min-h-[56px] px-1 rounded-xl border font-bold tabular-nums transition-colors active:scale-[0.96]",
                        // código de compra do PO (CSCN 21368) não cabe em 19px
                        // no quadradinho do iPhone: letra menor e quebra no espaço
                        a.tag.length > 6
                          ? "text-[15px] leading-tight text-center break-words"
                          : "text-[19px]",
                        pending
                          ? "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                          : "border-slate-200 bg-white text-slate-800 hover:bg-produmar-50 hover:border-produmar-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                      )}
                    >
                      {a.tag}
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
