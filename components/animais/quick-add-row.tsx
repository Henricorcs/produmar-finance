"use client";

import { useRef, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { createAnimal, createBirth } from "@/app/(app)/animais/actions";
import { formatDecimalInput, parseDecimal } from "./animal-shared";
import type { AnimalBreed, AnimalSex } from "@/lib/types";

interface Props {
  breeds: AnimalBreed[];
  /** Quantas colunas de vacina a planilha tem (ficam vazias nesta linha). */
  vaccinesCount: number;
}

/**
 * Linha de digitação direta no topo da planilha — cadastra o animal sem abrir
 * formulário. Cada campo fica na sua coluna:
 *   • Cat.  → sexo (F/M) do animal
 *   • Pariu → o parto: a data (que é o nascimento do bezerro) e, ao
 *     preenchê-la, o sexo do bezerro
 * Enter salva. Sexo e raça ficam para o próximo — um lote entra só
 * digitando número e peso.
 */
export function QuickAddRow({ breeds, vaccinesCount }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [tag, setTag] = useState("");
  const [sex, setSex] = useState<AnimalSex>("femea");
  const [breedId, setBreedId] = useState("");
  const [weight, setWeight] = useState("");
  // parto (só para fêmea): data + sexo e número do bezerro (ele entra no rebanho)
  const [calvedAt, setCalvedAt] = useState("");
  const [calfSex, setCalfSex] = useState<AnimalSex | null>(null);
  const [calfTag, setCalfTag] = useState("");
  const tagRef = useRef<HTMLInputElement>(null);

  const isFemale = sex === "femea";

  function submit() {
    if (isPending) return;
    setError(null);
    if (!tag.trim()) {
      setError("Digite o número do animal");
      tagRef.current?.focus();
      return;
    }
    if (isFemale && calvedAt && !calfSex) {
      setError("Marque se o bezerro é macho (M) ou fêmea (F)");
      return;
    }
    if (isFemale && calvedAt && !calfTag.trim()) {
      setError("Informe o número do bezerro — ele entra no rebanho junto com o parto");
      return;
    }

    startTransition(async () => {
      const r = await createAnimal({
        tag,
        sex,
        breed_id: breedId || null,
        weight: parseDecimal(weight),
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
        return;
      }

      // parto informado na linha → grava junto e o bezerro entra no rebanho
      const animalId = (r as { animalId?: string }).animalId;
      if (isFemale && calvedAt && calfSex && animalId) {
        const b = await createBirth({
          mother_id: animalId,
          birth_date: calvedAt,
          calf_sex: calfSex,
          calf_tag: calfTag,
        });
        if (b && "error" in b) {
          setError(`Animal salvo, mas o parto falhou: ${b.error}`);
          return;
        }
      }

      // pronto pro próximo: mantém sexo e raça (lote), limpa o resto
      setTag("");
      setWeight("");
      setCalvedAt("");
      setCalfSex(null);
      setCalfTag("");
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

  /** Botõezinhos F/M reaproveitados no sexo do animal e no do bezerro. */
  function SexToggle({
    value,
    onPick,
    disabled,
  }: {
    value: AnimalSex | null;
    onPick: (s: AnimalSex) => void;
    disabled?: boolean;
  }) {
    return (
      <div className="flex gap-1">
        {(["femea", "macho"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            title={s === "femea" ? "Fêmea" : "Macho"}
            disabled={disabled}
            className={cn(
              "w-11 h-11 rounded-lg border text-sm font-bold transition-colors disabled:opacity-50",
              value === s
                ? "bg-produmar-600 border-produmar-600 text-white"
                : "bg-white border-slate-200 text-slate-400 dark:bg-slate-900 dark:border-slate-600"
            )}
          >
            {s === "femea" ? "F" : "M"}
          </button>
        ))}
      </div>
    );
  }

  return (
    <>
      <tr className="border-t border-produmar-100 dark:border-slate-700 bg-produmar-50/50 dark:bg-slate-800/40 align-top">
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

        {/* Cat. → sexo do animal (a categoria sai daí + da idade) */}
        <td className="px-1 py-2">
          <SexToggle value={sex} onPick={setSex} disabled={isPending} />
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

        {/* Pariu → data do parto e, ao preencher, o sexo do bezerro */}
        <td className="px-1 py-2 min-w-[132px]">
          {isFemale ? (
            <div className="space-y-1">
              <input
                type="date"
                value={calvedAt}
                onChange={(e) => {
                  setCalvedAt(e.target.value);
                  if (!e.target.value) setCalfSex(null);
                }}
                onKeyDown={onEnter}
                aria-label="Data do parto"
                title="Se ela pariu: a data do parto"
                className={inputCls}
                disabled={isPending}
              />
              {calvedAt ? (
                <div className="space-y-1">
                  <SexToggle value={calfSex} onPick={setCalfSex} disabled={isPending} />
                  {/* o bezerro entra no rebanho junto — precisa do número dele */}
                  <input
                    value={calfTag}
                    onChange={(e) => setCalfTag(e.target.value.toUpperCase())}
                    onKeyDown={onEnter}
                    placeholder="nº do bezerro"
                    aria-label="Número do bezerro"
                    className={cn(
                      inputCls,
                      "uppercase placeholder:normal-case placeholder:font-normal placeholder:text-produmar-500/70"
                    )}
                    autoComplete="off"
                    disabled={isPending}
                  />
                  <p
                    className={cn(
                      "text-[11px] leading-none pl-0.5",
                      calfSex && calfTag.trim()
                        ? "text-slate-400"
                        : "text-produmar-600 font-medium"
                    )}
                  >
                    {!calfSex
                      ? "bezerro: M ou F?"
                      : !calfTag.trim()
                      ? "falta o nº do bezerro"
                      : "bezerro entra no rebanho"}
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 leading-none pl-0.5">
                  parto (se pariu)
                </p>
              )}
            </div>
          ) : (
            <span className="text-sm text-slate-300 dark:text-slate-600">—</span>
          )}
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

      {/* Erro do cadastro (nº repetido etc.) */}
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
