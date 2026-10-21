"use client";

import { useEffect, useState, useTransition } from "react";
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
import { cn, localDateISO, upperKeepingCaret } from "@/lib/utils";
import { createTreatment } from "@/app/(app)/animais/actions";
import {
  FOOTER_CANCEL,
  FOOTER_SUBMIT,
  STICKY_FOOTER,
  categoryLabel,
  daCriacao,
  ItemDeAnimal,
  SPECIES_META,
} from "./animal-shared";
import type { AnimalSpecies, AnimalWithInfo } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  animals: AnimalWithInfo[];
  /** Pré-seleciona o animal (quando aberto pela ficha). */
  presetAnimalId?: string | null;
  /** Remédios já usados antes — viram sugestões no campo. */
  medicineSuggestions?: string[];
  /** A criação aberta na tela: a lista mostra só os animais dela. */
  especie?: AnimalSpecies | null;
}

/** Tratamento simples: o que foi tratado, o remédio e a dose. */
export function TreatmentDialog({
  open,
  onClose,
  animals,
  presetAnimalId,
  medicineSuggestions = [],
  especie = null,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [animalId, setAnimalId] = useState("");
  const [description, setDescription] = useState("");
  const [medicine, setMedicine] = useState("");
  const [dose, setDose] = useState("");
  const [appliedAt, setAppliedAt] = useState("");

  useEffect(() => {
    if (!open) return;
    setAnimalId(presetAnimalId ?? "");
    setDescription("");
    setMedicine("");
    setDose("");
    setAppliedAt(localDateISO());
    setError(null);
  }, [open, presetAnimalId]);

  const presetAnimal = presetAnimalId
    ? animals.find((a) => a.id === presetAnimalId) ?? null
    : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!animalId) {
      setError("Selecione o animal");
      return;
    }
    if (!description.trim()) {
      setError("Descreva o tratamento");
      return;
    }

    startTransition(async () => {
      const r = await createTreatment({
        animal_id: animalId,
        description,
        medicine,
        dose,
        applied_at: appliedAt || localDateISO(),
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Novo tratamento</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Animal *</Label>
            {presetAnimal ? (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                {presetAnimal.tag}
              </div>
            ) : (
              <SearchableSelect
                items={daCriacao(animals, especie)}
                value={animalId}
                onChange={setAnimalId}
                getId={(a) => a.id}
                getLabel={(a) => a.tag}
                renderItem={(a) => (
                  <ItemDeAnimal
                    numero={a.tag}
                    detalhe={`${categoryLabel(a.category, a.sex, a.species)}${a.breed_name ? ` · ${a.breed_name}` : ""}`}
                  />
                )}
                placeholder={especie ? `Selecione o ${SPECIES_META[especie].label.toLowerCase()}...` : "Selecione o animal..."}
                searchPlaceholder="Buscar pelo número..."
                emptyMessage={especie ? `Nenhum ${SPECIES_META[especie].label.toLowerCase()} cadastrado` : "Nenhum animal cadastrado"}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tr_description">Tratamento *</Label>
            <Input
              id="tr_description"
              value={description}
              onChange={(e) => setDescription(upperKeepingCaret(e))}
              placeholder="ex: verminose, casco, bicheira"
              autoCapitalize="characters"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tr_medicine">Remédio</Label>
            <Input
              id="tr_medicine"
              value={medicine}
              onChange={(e) => setMedicine(upperKeepingCaret(e))}
              placeholder="ex: ivermectina 1%"
              autoCapitalize="characters"
              list="tr_medicine_options"
              autoComplete="off"
            />
            {medicineSuggestions.length > 0 && (
              <datalist id="tr_medicine_options">
                {medicineSuggestions.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="tr_dose">Dose</Label>
              <Input
                id="tr_dose"
                value={dose}
                onChange={(e) => setDose(upperKeepingCaret(e))}
                placeholder="ex: 10 ml"
                autoCapitalize="characters"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tr_applied">Data *</Label>
              <Input
                id="tr_applied"
                type="date"
                value={appliedAt}
                onChange={(e) => setAppliedAt(e.target.value)}
                className="h-11 sm:h-10"
              />
            </div>
          </div>

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
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending} className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}>
              {isPending ? "Salvando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
