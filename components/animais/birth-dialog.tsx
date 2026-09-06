"use client";

import { useEffect, useState, useTransition } from "react";
import { Baby, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { cn, formatDate, localDateISO, upperKeepingCaret } from "@/lib/utils";
import { createBirth, deleteBirth } from "@/app/(app)/animais/actions";
import {
  FOOTER_CANCEL,
  FOOTER_SUBMIT,
  ICON_BUTTON,
  SPECIES_META,
  STICKY_FOOTER,
  SexPicker,
  categoryLabel,
  formatDecimalInput,
  formatWeight,
  parseDecimal,
  speciesOf,
} from "./animal-shared";
import type { AnimalBirth, AnimalSex, AnimalWithInfo } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Só fêmeas podem parir. */
  mothers: AnimalWithInfo[];
  /** Pré-seleciona a mãe (quando aberto pela planilha ou pela ficha). */
  presetMotherId?: string | null;
  /** Partos já registrados da mãe escolhida — dá para apagar o que saiu errado. */
  births?: AnimalBirth[];
}

/**
 * Partos da mãe: a lista do que já foi lançado (com o botão de apagar, para
 * quando o parto entra errado) e o registro de um novo. Ao registrar, a cria
 * já entra no rebanho atrelada à mãe — número e peso são dela. O nome dela na
 * tela sai do tipo da mãe: bezerro, potro, cabrito ou cordeiro.
 */
export function BirthDialog({ open, onClose, mothers, presetMotherId, births = [] }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [motherId, setMotherId] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [calfSex, setCalfSex] = useState<AnimalSex>("femea");
  const [calfTag, setCalfTag] = useState("");
  const [calfWeight, setCalfWeight] = useState("");

  useEffect(() => {
    if (!open) return;
    setMotherId(presetMotherId ?? "");
    setBirthDate(localDateISO());
    setCalfSex("femea");
    setCalfTag("");
    setCalfWeight("");
    setError(null);
  }, [open, presetMotherId]);

  const presetMother = presetMotherId
    ? mothers.find((a) => a.id === presetMotherId) ?? null
    : null;

  /** A cria é do tipo da mãe: bezerro de vaca, potro de égua, cabrito de cabra. */
  const mother = presetMother ?? mothers.find((a) => a.id === motherId) ?? null;
  const names = SPECIES_META[speciesOf(mother?.species)];
  /** "bezerro"/"potro" — o nome da cria nos textos da tela. */
  const young = names.youngMale.toLowerCase();

  /** Partos da mãe escolhida, do mais novo para o mais antigo. */
  const motherBirths = motherId
    ? births
        .filter((b) => b.mother_id === motherId)
        .sort((a, b) => (a.birth_date < b.birth_date ? 1 : -1))
    : [];

  function handleDelete(b: AnimalBirth) {
    const calf = b.calf_tag ? `nº ${b.calf_tag}` : "sem número";
    if (!confirm(`Apagar o parto de ${formatDate(b.birth_date)} (${young} ${calf})?`)) return;

    // a cria entrou no rebanho por causa deste parto — pergunta se sai junto
    const alsoCalf = b.calf_animal_id
      ? confirm(
          `Tirar também o ${young} ${calf} do rebanho?\n\n` +
            `OK = apaga o parto e o ${young}.\n` +
            `Cancelar = apaga só o parto e o ${young} continua cadastrado.`
        )
      : false;

    setDeletingId(b.id);
    setError(null);
    startTransition(async () => {
      const r = await deleteBirth(b.id, alsoCalf);
      setDeletingId(null);
      if (r && "error" in r) setError(r.error ?? "Erro ao apagar o parto");
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!motherId) {
      setError("Selecione a mãe");
      return;
    }
    if (!birthDate) {
      setError("Informe a data do parto");
      return;
    }
    if (!calfTag.trim()) {
      setError(`Informe o número do ${young} — ele entra no rebanho junto com o parto`);
      return;
    }

    startTransition(async () => {
      const r = await createBirth({
        mother_id: motherId,
        birth_date: birthDate,
        calf_sex: calfSex,
        calf_tag: calfTag,
        calf_weight: parseDecimal(calfWeight),
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao registrar o parto");
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">
            {presetMother ? `Partos da ${presetMother.tag}` : "Registrar parto"}
          </DialogTitle>
        </DialogHeader>

        {/* Já registrados — é aqui que se apaga o parto lançado errado */}
        {motherBirths.length > 0 && (
          <div className="space-y-1.5 mb-4">
            <Label>Partos registrados</Label>
            <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
              {motherBirths.map((b) => (
                <li key={b.id} className="flex items-center gap-2 px-3 py-1.5">
                  <Baby className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800 dark:text-slate-100 truncate">
                      {b.calf_sex === "macho" ? names.youngMale : names.youngFemale}
                      {b.calf_tag ? ` nº ${b.calf_tag}` : ""}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {formatDate(b.birth_date)}
                      {b.calf_animal_id ? " · no rebanho" : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(b)}
                    disabled={isPending}
                    aria-label="Apagar este parto"
                    className={cn(
                      ICON_BUTTON,
                      "text-slate-300 hover:text-red-500 -mr-2 disabled:opacity-50"
                    )}
                  >
                    <Trash2 className={cn("w-4 h-4", deletingId === b.id && "animate-pulse")} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Mãe *</Label>
            {presetMother ? (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                {presetMother.tag}
                {presetMother.breed_name ? ` · ${presetMother.breed_name}` : ""}
              </div>
            ) : (
              <SearchableSelect
                items={mothers}
                value={motherId}
                onChange={setMotherId}
                getId={(a) => a.id}
                getLabel={(a) => a.tag}
                renderItem={(a) => (
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="truncate">{a.tag}</span>
                    <span className="text-[10px] text-slate-400 flex-shrink-0">
                      {categoryLabel(a.category, a.sex, a.species)}
                      {a.breed_name ? ` · ${a.breed_name}` : ""}
                    </span>
                  </div>
                )}
                placeholder="Selecione a mãe..."
                searchPlaceholder="Buscar pelo número..."
                emptyMessage="Nenhuma fêmea cadastrada"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bt_date">Data do parto *</Label>
            <Input
              id="bt_date"
              type="date"
              value={birthDate}
              onChange={(e) => setBirthDate(e.target.value)}
              className="h-11 sm:h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Sexo do {young} *</Label>
            <SexPicker value={calfSex} onChange={setCalfSex} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="bt_calf_tag">Nº do {young} *</Label>
              <Input
                id="bt_calf_tag"
                value={calfTag}
                onChange={(e) => setCalfTag(upperKeepingCaret(e))}
                placeholder="ex: 1046"
                autoCapitalize="characters"
                className="h-11 sm:h-10"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bt_calf_weight">Peso (kg)</Label>
              <Input
                id="bt_calf_weight"
                value={calfWeight}
                onChange={(e) => setCalfWeight(formatDecimalInput(e.target.value))}
                placeholder="ex: 32"
                inputMode="decimal"
                className="h-11 sm:h-10 tabular-nums"
                autoComplete="off"
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            O {young} entra no rebanho na hora, atrelado à mãe e já como{" "}
            {names.label.toLowerCase()}
            {mother?.breed_name ? ` da raça ${mother.breed_name}` : ""}
            {calfWeight ? ` (${formatWeight(parseDecimal(calfWeight))})` : ""}.
          </p>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <DialogFooter className={STICKY_FOOTER}>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
              className={cn(FOOTER_CANCEL, "h-11 sm:h-10")}
            >
              {motherBirths.length > 0 ? "Fechar" : "Cancelar"}
            </Button>
            <Button type="submit" disabled={isPending} className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}>
              {isPending ? "Salvando..." : "Registrar parto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
