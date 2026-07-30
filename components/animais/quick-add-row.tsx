"use client";

import { useRef, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { createAnimal } from "@/app/(app)/animais/actions";
import { formatDecimalInput, parseDecimal } from "./animal-shared";
import type { AnimalBreed, AnimalSex } from "@/lib/types";

interface Props {
  breeds: AnimalBreed[];
  /** Colunas restantes a cobrir (vacinas + tratamento). */
  trailingColSpan: number;
}

/**
 * Linha de digitação direta no topo da planilha — cadastra o animal sem abrir
 * formulário: número, sexo (F/M), raça, peso e nascimento; Enter salva.
 * Sexo, raça e nascimento ficam para o próximo — um lote de bezerros da
 * mesma data entra só digitando número e peso.
 */
export function QuickAddRow({ breeds, trailingColSpan }: Props) {
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
      setError("Digite o número");
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
    "h-10 w-full rounded-lg border border-produmar-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-produmar-400 disabled:opacity-50";

  return (
    <tr className="border-t border-produmar-100 dark:border-slate-700 bg-produmar-50/50 dark:bg-slate-800/40">
      {/* Nº — sempre visível (coluna fixa) */}
      <td className="sticky left-0 bg-produmar-50 dark:bg-slate-800 px-2 py-2 min-w-[104px]">
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
                "w-10 h-10 rounded-lg border text-[11px] font-bold transition-colors",
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

      {/* Botão + erro/dica */}
      <td colSpan={trailingColSpan} className="px-2 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={isPending}
            className="flex items-center gap-1.5 h-10 px-3 rounded-lg bg-produmar-600 text-white text-xs font-semibold hover:bg-produmar-700 active:scale-[0.97] transition-all disabled:opacity-50 flex-shrink-0"
          >
            <Check className="w-3.5 h-3.5" />
            {isPending ? "Salvando..." : "Adicionar"}
          </button>
          {error ? (
            <span className="text-[11px] font-medium text-red-600 dark:text-red-400 whitespace-nowrap">
              {error}
            </span>
          ) : (
            <span className="text-[10px] text-slate-400 whitespace-nowrap hidden sm:inline">
              Enter salva · sexo, raça e nascimento ficam para o próximo
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
