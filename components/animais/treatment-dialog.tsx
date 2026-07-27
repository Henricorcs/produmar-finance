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
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { localDateISO } from "@/lib/utils";
import { createTreatment, updateTreatment } from "@/app/(app)/animais/actions";
import { parseDecimal, formatDecimalInput, categoryLabel } from "./animal-shared";
import type { AnimalTreatment, AnimalWithInfo } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  animals: AnimalWithInfo[];
  /** Pré-seleciona o animal (quando aberto pela ficha). */
  presetAnimalId?: string | null;
  /** Tratamento em edição — null cria um novo. */
  treatment?: AnimalTreatment | null;
  /** Remédios já usados antes — viram sugestões no campo. */
  medicineSuggestions?: string[];
}

export function TreatmentDialog({
  open,
  onClose,
  animals,
  presetAnimalId,
  treatment = null,
  medicineSuggestions = [],
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [animalId, setAnimalId] = useState("");
  const [description, setDescription] = useState("");
  const [medicine, setMedicine] = useState("");
  const [dose, setDose] = useState("");
  const [appliedAt, setAppliedAt] = useState("");
  const [nextApplication, setNextApplication] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setAnimalId(treatment?.animal_id ?? presetAnimalId ?? "");
    setDescription(treatment?.description ?? "");
    setMedicine(treatment?.medicine ?? "");
    setDose(treatment?.dose ?? "");
    setAppliedAt(treatment?.applied_at ?? localDateISO());
    setNextApplication(treatment?.next_application ?? "");
    setCost(treatment && treatment.cost ? String(treatment.cost).replace(".", ",") : "");
    setNotes(treatment?.notes ?? "");
    setError(null);
  }, [open, presetAnimalId, treatment]);

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
      const input = {
        animal_id: animalId,
        description,
        medicine,
        dose,
        applied_at: appliedAt || localDateISO(),
        next_application: nextApplication || null,
        cost: parseDecimal(cost),
        notes,
      };
      const r = treatment
        ? await updateTreatment(treatment.id, input)
        : await createTreatment(input);
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
          <DialogTitle className="dark:text-slate-100">
            {treatment ? "Editar tratamento" : "Novo tratamento"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Animal *</Label>
            {presetAnimal || treatment ? (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                {(presetAnimal ?? animals.find((a) => a.id === animalId))?.tag ?? "—"}
              </div>
            ) : (
              <SearchableSelect
                items={animals}
                value={animalId}
                onChange={setAnimalId}
                getId={(a) => a.id}
                getLabel={(a) => a.tag}
                renderItem={(a) => (
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="truncate">{a.tag}</span>
                    <span className="text-[10px] text-slate-400 flex-shrink-0">
                      {categoryLabel(a.category, a.sex)}
                      {a.type_name ? ` · ${a.type_name}` : ""}
                    </span>
                  </div>
                )}
                placeholder="Selecione o animal..."
                searchPlaceholder="Buscar pelo número..."
                emptyMessage="Nenhum animal cadastrado"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tr_description">Tratamento *</Label>
            <Input
              id="tr_description"
              value={description}
              onChange={(e) => setDescription(e.target.value.toUpperCase())}
              placeholder="ex: verminose, casco, bicheira"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tr_medicine">Remédio</Label>
            <Input
              id="tr_medicine"
              value={medicine}
              onChange={(e) => setMedicine(e.target.value.toUpperCase())}
              placeholder="ex: ivermectina 1%"
              className="uppercase placeholder:normal-case placeholder:lowercase"
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
                onChange={(e) => setDose(e.target.value.toUpperCase())}
                placeholder="ex: 10 ml"
                className="uppercase placeholder:normal-case placeholder:lowercase"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tr_cost">Custo (R$)</Label>
              <Input
                id="tr_cost"
                value={cost}
                onChange={(e) => setCost(formatDecimalInput(e.target.value))}
                placeholder="0,00"
                inputMode="decimal"
                autoComplete="off"
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="tr_applied">Data *</Label>
              <Input
                id="tr_applied"
                type="date"
                value={appliedAt}
                onChange={(e) => setAppliedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tr_next">Repetir em</Label>
              <Input
                id="tr_next"
                type="date"
                value={nextApplication}
                onChange={(e) => setNextApplication(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tr_notes">Observações</Label>
            <Textarea
              id="tr_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.toUpperCase())}
              placeholder="como o animal reagiu, quem aplicou..."
              className="uppercase placeholder:normal-case placeholder:lowercase"
              rows={2}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : treatment ? "Salvar" : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
