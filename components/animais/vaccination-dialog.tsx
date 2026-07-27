"use client";

import { useEffect, useState, useTransition } from "react";
import { Settings2 } from "lucide-react";
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
import { registerVaccination } from "@/app/(app)/animais/actions";
import { AnimalVaccinesDialog } from "./animal-vaccines-dialog";
import { categoryLabel } from "./animal-shared";
import type { AnimalVaccine, AnimalWithInfo } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  animals: AnimalWithInfo[];
  vaccines: AnimalVaccine[];
  /** Pré-seleciona o animal (quando aberto pela ficha). */
  presetAnimalId?: string | null;
  /** Pré-seleciona a vacina (quando aberto pela linha da vacina na ficha). */
  presetVaccineId?: string | null;
}

export function VaccinationDialog({
  open,
  onClose,
  animals,
  vaccines,
  presetAnimalId,
  presetVaccineId,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [animalId, setAnimalId] = useState("");
  const [vaccineId, setVaccineId] = useState("");
  const [appliedAt, setAppliedAt] = useState("");
  const [dose, setDose] = useState("");
  const [notes, setNotes] = useState("");
  const [vaccinesOpen, setVaccinesOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAnimalId(presetAnimalId ?? "");
    setVaccineId(presetVaccineId ?? "");
    setAppliedAt(localDateISO());
    setDose("");
    setNotes("");
    setError(null);
  }, [open, presetAnimalId, presetVaccineId]);

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
    if (!vaccineId) {
      setError("Selecione a vacina");
      return;
    }

    startTransition(async () => {
      const r = await registerVaccination({
        animal_id: animalId,
        vaccine_id: vaccineId,
        applied_at: appliedAt || localDateISO(),
        dose,
        notes,
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao registrar");
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Aplicar vacina</DialogTitle>
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
                      {a.vaccines_due > 0 ? ` · ${a.vaccines_due} pend.` : ""}
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
            <div className="flex items-center justify-between">
              <Label htmlFor="vac_vaccine">Vacina *</Label>
              <button
                type="button"
                onClick={() => setVaccinesOpen(true)}
                className="flex items-center gap-1 text-[11px] font-medium text-produmar-600 dark:text-produmar-400 hover:underline"
              >
                <Settings2 className="w-3 h-3" />
                Gerenciar
              </button>
            </div>
            <select
              id="vac_vaccine"
              value={vaccineId}
              onChange={(e) => setVaccineId(e.target.value)}
              className="w-full h-10 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-slate-800 dark:text-slate-100"
            >
              <option value="">Selecione a vacina...</option>
              {vaccines.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="vac_applied">Data *</Label>
              <Input
                id="vac_applied"
                type="date"
                value={appliedAt}
                onChange={(e) => setAppliedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vac_dose">Dose</Label>
              <Input
                id="vac_dose"
                value={dose}
                onChange={(e) => setDose(e.target.value.toUpperCase())}
                placeholder="ex: 5 ml"
                className="uppercase placeholder:normal-case placeholder:lowercase"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vac_notes">Observações</Label>
            <Textarea
              id="vac_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.toUpperCase())}
              placeholder="lote, quem aplicou..."
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
              {isPending ? "Salvando..." : "Registrar"}
            </Button>
          </DialogFooter>
        </form>

        <AnimalVaccinesDialog
          open={vaccinesOpen}
          onClose={() => setVaccinesOpen(false)}
          vaccines={vaccines}
        />
      </DialogContent>
    </Dialog>
  );
}
