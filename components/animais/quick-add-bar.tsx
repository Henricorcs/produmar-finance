"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { cn, upperKeepingCaret } from "@/lib/utils";
import { createAnimal } from "@/app/(app)/animais/actions";
import { SPECIES_META, useSpeciesOptions } from "./animal-shared";
import type { AnimalSex, AnimalSpecies } from "@/lib/types";

interface Props {
  /** Tipo escolhido no filtro da tela (null = "todos os tipos"). */
  species: AnimalSpecies | null;
  /** Raça escolhida no menu — o animal novo já entra nela (senão sumiria da tela). */
  breedId?: string | null;
}

/**
 * Cadastro rápido do quadro de números: o nº do animal, F ou M, e pronto —
 * Enter salva e o campo já espera o próximo. Raça, peso, foto, vacina e o
 * resto entram depois, abrindo a ficha do animal.
 */
export function QuickAddBar({ species: filterSpecies, breedId = null }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tag, setTag] = useState("");
  const [sex, setSex] = useState<AnimalSex>("femea");
  const [species, setSpecies] = useState<AnimalSpecies>(filterSpecies ?? "bovino");
  const tagRef = useRef<HTMLInputElement>(null);
  /** Vaqueiro nível 01 só vê bovino (146). */
  const tipos = useSpeciesOptions();

  /** Filtrou a tela por um tipo? O animal novo entra nesse — senão sumiria. */
  useEffect(() => {
    if (filterSpecies) setSpecies(filterSpecies);
  }, [filterSpecies]);

  function submit() {
    if (isPending) return;
    setError(null);
    if (!tag.trim()) {
      setError("Digite o número do animal");
      tagRef.current?.focus();
      return;
    }
    startTransition(async () => {
      // a raça só vale se for do tipo que está na linha (a pessoa pode ter trocado o tipo)
      const raca = breedId && filterSpecies === species ? breedId : null;
      const r = await createAnimal({ tag, sex, species, breed_id: raca, weight: null });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
        return;
      }
      // pronto pro próximo: mantém tipo e sexo (lote), limpa o número
      setTag("");
      tagRef.current?.focus();
    });
  }

  return (
    <div className="rounded-2xl border border-produmar-200 bg-produmar-50/60 p-2 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={tagRef}
          value={tag}
          onChange={(e) => setTag(upperKeepingCaret(e))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="+ nº novo"
          aria-label="Número do novo animal"
          autoComplete="off"
          disabled={isPending}
          autoCapitalize="characters"
          className="h-11 min-w-0 flex-1 rounded-lg border border-produmar-200 bg-white px-3 text-[17px] font-bold text-slate-800 placeholder:font-normal placeholder:text-produmar-500/70 focus:outline-none focus:ring-2 focus:ring-produmar-400 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />

        {/* Fêmea ou macho — é daí que sai a categoria (vaca, boi, bezerro) */}
        <div className="flex gap-1">
          {(["femea", "macho"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSex(s)}
              title={s === "femea" ? "Fêmea" : "Macho"}
              disabled={isPending}
              className={cn(
                "w-11 h-11 rounded-lg border text-sm font-bold transition-colors disabled:opacity-50",
                sex === s
                  ? "bg-produmar-600 border-produmar-600 text-white"
                  : "bg-white border-slate-200 text-slate-400 dark:bg-slate-900 dark:border-slate-600"
              )}
            >
              {s === "femea" ? "F" : "M"}
            </button>
          ))}
        </div>

        {/* Sem tipo escolhido lá em cima, escolhe aqui em que criação ele entra */}
        {!filterSpecies && (
          <select
            value={species}
            onChange={(e) => setSpecies(e.target.value as AnimalSpecies)}
            aria-label="Tipo do animal"
            title="Tipo do animal"
            disabled={isPending}
            className="h-11 rounded-lg border border-produmar-200 bg-white px-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-produmar-400 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
          >
            {tipos.map((s) => (
              <option key={s.value} value={s.value}>
                {SPECIES_META[s.value].label}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="flex items-center gap-1.5 h-11 px-4 rounded-lg bg-produmar-600 text-white text-sm font-semibold hover:bg-produmar-700 active:scale-[0.97] transition-all disabled:opacity-50 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          {isPending ? "Salvando..." : "Cadastrar"}
        </button>
      </div>

      {/* Erro do cadastro (nº repetido etc.) */}
      {error && (
        <p className="px-1 pt-2 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
