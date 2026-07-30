"use client";

import { useRef, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { createAnimal } from "@/app/(app)/animais/actions";
import { formatDecimalInput, parseDecimal } from "./animal-shared";
import type { AnimalBreed, AnimalSex } from "@/lib/types";

interface Props {
  breeds: AnimalBreed[];
  /** Quantas colunas de vacina a planilha tem (ficam vazias nesta linha). */
  vaccinesCount: number;
}

/**
 * Linha de digitação direta no topo da planilha — cadastra o animal sem abrir
 * formulário: número, sexo (F/M), raça, peso e nascimento; Enter salva.
 * Sexo, raça e nascimento ficam para o próximo — um lote de bezerros da
 * mesma data entra só digitando número e peso. As colunas de vacina ficam
 * vazias (dose é assunto da vacinação, não do cadastro) e o botão Adicionar
 * mora na última coluna, fixo à direita.
 */
export function QuickAddRow({ breeds, vaccinesCount }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [tag, setTag] = useState("");
  const [sex, setSex] = useState<AnimalSex>("femea");
  const [breedId, setBreedId] = useState("");
  const [weight, setWeight] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const tagRef = useRef<HTMLInputElement>(null);

  function submit() {
    if (isPending) return;
    setError(null);
    if (!tag.trim()) {
      setError("Digite o número do animal");
      tagRef.current?.focus();
      return;
    }
    startTransition(async () => {
      const r = await createAnimal({
        tag,
        sex,
        birth_date: birthDate || null,
        breed_id: breedId || null,
        weight: parseDecimal(weight),
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
        return;
      }
      // pronto pro próximo: mantém sexo/raça/nascimento (lote), limpa nº e peso
      setTag("");
      setWeight("");
      tagRef.current?.focus();
    });
  }

  function onEnter(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  }

  const inputCls =
    "h-11 w-full rounded-lg border border-produmar-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-produmar-400 disabled:opacity-50";

  return (
    <>
      <tr className="border-t border-produmar-100 dark:border-slate-700 bg-produmar-50/50 dark:bg-slate-800/40">
        {/* Nº — sempre visível (coluna fixa à esquerda) */}
        <td className="sticky left-0 z-10 bg-produmar-50 dark:bg-slate-800 px-2 py-2 min-w-[104px]">
          <input
            ref={tagRef}
            value={tag}
            onChange={(e) => setTag(e.target.value.toUpperCase())}
            onKeyDown={onEnter}
            placeholder="+ nº novo"
            aria-label="Número do novo animal"
            className={cn(
              inputCls,
              "font-bold uppercase placeholder:normal-case placeholder:font-normal placeholder:text-produmar-500/70"
            )}
            autoComplete="off"
            disabled={isPending}
          />
        </td>

        {/* Sexo (a categoria sai sozinha: fêmea → vaca/bezerra, macho → boi/bezerro) */}
        <td className="px-1 py-2">
          <div className="flex gap-1">
            {(["femea", "macho"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSex(s)}
                title={s === "femea" ? "Fêmea" : "Macho"}
                disabled={isPending}
                className={cn(
                  "w-11 h-11 rounded-lg border text-sm font-bold transition-colors",
                  sex === s
                    ? "bg-produmar-600 border-produmar-600 text-white"
                    : "bg-white border-slate-200 text-slate-400 dark:bg-slate-900 dark:border-slate-600"
                )}
              >
                {s === "femea" ? "F" : "M"}
              </button>
            ))}
          </div>
        </td>

        {/* Raça */}
        <td className="px-1 py-2 min-w-[110px]">
          <select
            value={breedId}
            onChange={(e) => setBreedId(e.target.value)}
            aria-label="Raça"
            className={inputCls}
            disabled={isPending}
          >
            <option value="">raça...</option>
            {breeds.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </td>

        {/* Peso */}
        <td className="px-1 py-2 min-w-[84px]">
          <input
            value={weight}
            onChange={(e) => setWeight(formatDecimalInput(e.target.value))}
            onKeyDown={onEnter}
            placeholder="kg"
            aria-label="Peso em kg"
            inputMode="decimal"
            className={cn(inputCls, "tabular-nums")}
            autoComplete="off"
            disabled={isPending}
          />
        </td>

        {/* Nascimento (na coluna Pariu — opcional, é o que define bezerro) */}
        <td className="px-1 py-2 min-w-[132px]">
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            onKeyDown={onEnter}
            aria-label="Data de nascimento"
            title="Nascimento (opcional — menos de 12 meses conta como bezerro)"
            className={inputCls}
            disabled={isPending}
          />
        </td>

        {/* Colunas de vacina ficam vazias — dose é assunto da vacinação */}
        {Array.from({ length: vaccinesCount }).map((_, i) => (
          <td key={i} className="px-1 py-2 text-center text-sm text-slate-300 dark:text-slate-600">
            ·
          </td>
        ))}

        {/* Adicionar — na coluna Tratamento, fixo à direita */}
        <td className="sticky right-0 z-10 bg-produmar-50 dark:bg-slate-800 px-2 py-2">
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="flex items-center gap-1.5 h-11 px-4 rounded-lg bg-produmar-600 text-white text-sm font-semibold hover:bg-produmar-700 active:scale-[0.97] transition-all disabled:opacity-50 whitespace-nowrap"
          >
            <Check className="w-4 h-4" />
            {isPending ? "Salvando..." : "Adicionar"}
          </button>
        </td>
      </tr>

      {/* Erro do cadastro (nº repetido etc.) — linha própria, some sozinha */}
      {error && (
        <tr className="bg-produmar-50/50 dark:bg-slate-800/40">
          <td
            colSpan={6 + vaccinesCount}
            className="px-3 pb-2 text-sm font-medium text-red-600 dark:text-red-400"
          >
            {error}
          </td>
        </tr>
      )}
    </>
  );
}
