"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Scale } from "lucide-react";
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
import { cn, formatDate, localDateISO } from "@/lib/utils";
import { recordAnimalWeight } from "@/app/(app)/animais/actions";
import {
  FOOTER_CANCEL,
  FOOTER_SUBMIT,
  STICKY_FOOTER,
  categoryLabel,
  formatDecimalInput,
  formatWeight,
  parseDecimal,
  previousWeighing,
  weightGain,
} from "./animal-shared";
import type { AnimalWeight, AnimalWithInfo } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  animals: AnimalWithInfo[];
  /** Pesagens do rebanho — daqui sai a última pesagem do animal. */
  weights?: AnimalWeight[];
  presetAnimalId?: string | null;
}

/**
 * Pesagem avulsa: o animal subiu na balança fora do protocolo de vacinação.
 * Mostra na hora quanto ele ganhou desde a última pesagem e em quanto tempo.
 */
export function WeightDialog({ open, onClose, animals, weights = [], presetAnimalId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [animalId, setAnimalId] = useState("");
  const [weighedAt, setWeighedAt] = useState("");
  const [weight, setWeight] = useState("");

  useEffect(() => {
    if (!open) return;
    const aid = presetAnimalId ?? "";
    const kg = Number(animals.find((a) => a.id === aid)?.weight ?? 0);
    setAnimalId(aid);
    setWeighedAt(localDateISO());
    setWeight(kg > 0 ? String(kg).replace(".", ",") : "");
    setError(null);
    // `animals` muda a cada refresh do servidor; abrir o diálogo é o gatilho
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetAnimalId]);

  const animal = animalId ? animals.find((a) => a.id === animalId) ?? null : null;
  const typed = parseDecimal(weight);

  const last = useMemo(() => {
    if (!animalId) return null;
    return previousWeighing(
      weights.filter((w) => w.animal_id === animalId),
      weighedAt || localDateISO()
    );
  }, [animalId, weights, weighedAt]);

  const gain = useMemo(() => {
    if (!last || typed <= 0) return null;
    return weightGain(
      { weighed_at: last.weighed_at, weight: Number(last.weight) },
      { weighed_at: weighedAt || localDateISO(), weight: typed }
    );
  }, [last, typed, weighedAt]);

  function chooseAnimal(id: string) {
    setAnimalId(id);
    const kg = Number(animals.find((a) => a.id === id)?.weight ?? 0);
    setWeight(kg > 0 ? String(kg).replace(".", ",") : "");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!animalId) {
      setError("Selecione o animal");
      return;
    }
    if (typed <= 0) {
      setError("Informe o peso em kg");
      return;
    }

    startTransition(async () => {
      const r = await recordAnimalWeight({
        animal_id: animalId,
        weight: typed,
        weighed_at: weighedAt || localDateISO(),
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao registrar o peso");
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Pesagem</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Animal *</Label>
            {presetAnimalId ? (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                {animal?.tag ?? "—"}
              </div>
            ) : (
              <SearchableSelect
                items={animals}
                value={animalId}
                onChange={chooseAnimal}
                getId={(a) => a.id}
                getLabel={(a) => a.tag}
                renderItem={(a) => (
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="truncate">{a.tag}</span>
                    <span className="text-[10px] text-slate-400 flex-shrink-0">
                      {categoryLabel(a.category, a.sex, a.species)}
                      {Number(a.weight) > 0 ? ` · ${formatWeight(Number(a.weight))}` : ""}
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
            <Label htmlFor="wg_date">Data *</Label>
            <Input
              id="wg_date"
              type="date"
              value={weighedAt}
              onChange={(e) => setWeighedAt(e.target.value)}
              className="h-11 sm:h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wg_weight">Peso (kg) *</Label>
            <Input
              id="wg_weight"
              value={weight}
              onChange={(e) => setWeight(formatDecimalInput(e.target.value))}
              placeholder="ex: 320"
              className="h-11 text-base tabular-nums sm:h-10 sm:text-sm"
              inputMode="decimal"
              autoComplete="off"
              autoFocus
            />
            {last ? (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Última pesagem {formatWeight(Number(last.weight))} em{" "}
                {formatDate(last.weighed_at)}
              </p>
            ) : (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Primeira pesagem deste animal.
              </p>
            )}
            {gain && (
              <p
                className={cn(
                  "text-sm font-medium",
                  gain.diff > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : gain.diff < 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-slate-500 dark:text-slate-400"
                )}
              >
                {gain.label}
              </p>
            )}
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
            <Button
              type="submit"
              disabled={isPending}
              className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}
            >
              <Scale className="w-4 h-4" />
              {isPending ? "Salvando..." : "Registrar peso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
