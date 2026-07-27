"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Settings2, Syringe } from "lucide-react";
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
import { applyVaccineProtocol } from "@/app/(app)/animais/actions";
import { AnimalVaccinesDialog } from "./animal-vaccines-dialog";
import {
  categoryLabel,
  doseRuleLabel,
  formatDecimalInput,
  formatWeight,
  parseDecimal,
  suggestedDoseMl,
} from "./animal-shared";
import type { AnimalVaccine, AnimalWithInfo } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  animals: AnimalWithInfo[];
  vaccines: AnimalVaccine[];
  /** Pré-seleciona o animal (quando aberto pela ficha). */
  presetAnimalId?: string | null;
  /** Vacinas já marcadas ao abrir (ex.: "Aplicar" numa vacina da ficha). */
  presetVaccineIds?: string[];
}

/** Uma vacina marcada no protocolo. */
type ProtocolItem = {
  dose: string;
  brand: string;
  /** true depois que o usuário mexeu na dose — aí não sobrescrevemos mais. */
  doseEdited: boolean;
};

type ItemMap = Record<string, ProtocolItem>;

function newItem(vaccine: AnimalVaccine, weightKg: number): ProtocolItem {
  const suggested = suggestedDoseMl(vaccine, weightKg);
  return {
    dose: suggested ? String(suggested).replace(".", ",") : "",
    brand: vaccine.default_brand ?? "",
    doseEdited: false,
  };
}

/**
 * Protocolo de vacinação: marca várias vacinas de uma vez para o mesmo animal.
 * A dose em ml já vem sugerida (fixa ou calculada pelo peso) e a marca vem
 * preenchida com a marca padrão da vacina — as duas podem ser trocadas.
 */
export function VaccineProtocolDialog({
  open,
  onClose,
  animals,
  vaccines,
  presetAnimalId,
  presetVaccineIds,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [animalId, setAnimalId] = useState("");
  const [appliedAt, setAppliedAt] = useState("");
  const [items, setItems] = useState<ItemMap>({});
  const [notes, setNotes] = useState("");
  const [vaccinesOpen, setVaccinesOpen] = useState(false);

  const presetKey = (presetVaccineIds ?? []).join(",");

  useEffect(() => {
    if (!open) return;
    const aid = presetAnimalId ?? "";
    const weight = Number(animals.find((a) => a.id === aid)?.weight ?? 0);

    const init: ItemMap = {};
    for (const vid of presetKey ? presetKey.split(",") : []) {
      const v = vaccines.find((x) => x.id === vid);
      if (v) init[vid] = newItem(v, weight);
    }

    setAnimalId(aid);
    setItems(init);
    setAppliedAt(localDateISO());
    setNotes("");
    setError(null);
    // `animals`/`vaccines` mudam a cada refresh do servidor; reabrir é o gatilho
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetAnimalId, presetKey]);

  const animal = animalId ? animals.find((a) => a.id === animalId) ?? null : null;
  const weightKg = Number(animal?.weight ?? 0);

  // Trocar o animal recalcula as doses sugeridas (menos as digitadas na mão)
  useEffect(() => {
    setItems((prev) => {
      const next: ItemMap = {};
      for (const [vid, item] of Object.entries(prev)) {
        const v = vaccines.find((x) => x.id === vid);
        if (item.doseEdited || !v) {
          next[vid] = item;
          continue;
        }
        const suggested = suggestedDoseMl(v, weightKg);
        next[vid] = { ...item, dose: suggested ? String(suggested).replace(".", ",") : "" };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animalId, weightKg]);

  function toggle(vaccine: AnimalVaccine) {
    setItems((prev) => {
      const next = { ...prev };
      if (next[vaccine.id]) delete next[vaccine.id];
      else next[vaccine.id] = newItem(vaccine, weightKg);
      return next;
    });
  }

  function patchItem(vaccineId: string, patch: Partial<ProtocolItem>) {
    setItems((prev) => (prev[vaccineId] ? { ...prev, [vaccineId]: { ...prev[vaccineId], ...patch } } : prev));
  }

  const selectedCount = Object.keys(items).length;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!animalId) {
      setError("Selecione o animal");
      return;
    }
    if (selectedCount === 0) {
      setError("Marque pelo menos uma vacina");
      return;
    }

    startTransition(async () => {
      const r = await applyVaccineProtocol({
        animal_id: animalId,
        applied_at: appliedAt || localDateISO(),
        notes,
        items: Object.entries(items).map(([vaccine_id, item]) => ({
          vaccine_id,
          dose_ml: parseDecimal(item.dose),
          brand: item.brand,
        })),
      });
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao registrar o protocolo");
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Protocolo de vacinação</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Animal *</Label>
            {presetAnimalId ? (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                {animal?.tag ?? "—"}
                {weightKg > 0 && (
                  <span className="text-xs text-slate-400 ml-1.5">{formatWeight(weightKg)}</span>
                )}
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
            <Label htmlFor="pr_applied">Data *</Label>
            <Input
              id="pr_applied"
              type="date"
              value={appliedAt}
              onChange={(e) => setAppliedAt(e.target.value)}
            />
          </div>

          {/* Vacinas do protocolo — só marcar e conferir a quantidade */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Vacinas aplicadas *</Label>
              <button
                type="button"
                onClick={() => setVaccinesOpen(true)}
                className="flex items-center gap-1 text-[11px] font-medium text-produmar-600 dark:text-produmar-400 hover:underline"
              >
                <Settings2 className="w-3 h-3" />
                Gerenciar
              </button>
            </div>

            {vaccines.length === 0 ? (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 py-2">
                Nenhuma vacina cadastrada. Use &quot;Gerenciar&quot; para cadastrar.
              </p>
            ) : (
              <div className="space-y-2">
                {vaccines.map((v) => {
                  const item = items[v.id];
                  const checked = !!item;
                  const hint = doseRuleLabel(v, weightKg);
                  return (
                    <div
                      key={v.id}
                      className={`rounded-xl border transition-colors ${
                        checked
                          ? "border-produmar-300 bg-produmar-50/40 dark:border-produmar-700 dark:bg-produmar-950/30"
                          : "border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(v)}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
                      >
                        <span
                          className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${
                            checked
                              ? "bg-produmar-600 border-produmar-600 text-white"
                              : "border-slate-300 dark:border-slate-600"
                          }`}
                        >
                          {checked && <Check className="w-3.5 h-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                            {v.name}
                          </span>
                          {hint && (
                            <span className="block text-[10px] text-slate-400 truncate">
                              {hint}
                            </span>
                          )}
                        </span>
                      </button>

                      {checked && (
                        <div className="grid grid-cols-2 gap-2 px-3 pb-3">
                          <div className="space-y-1">
                            <Label htmlFor={`dose_${v.id}`} className="text-[11px]">
                              Quantidade (ml)
                            </Label>
                            <Input
                              id={`dose_${v.id}`}
                              value={item.dose}
                              onChange={(e) =>
                                patchItem(v.id, {
                                  dose: formatDecimalInput(e.target.value),
                                  doseEdited: true,
                                })
                              }
                              placeholder="0"
                              className="h-9 text-sm tabular-nums"
                              inputMode="decimal"
                              autoComplete="off"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`brand_${v.id}`} className="text-[11px]">
                              Marca
                            </Label>
                            <Input
                              id={`brand_${v.id}`}
                              value={item.brand}
                              onChange={(e) =>
                                patchItem(v.id, { brand: e.target.value.toUpperCase() })
                              }
                              placeholder="ex: zoetis"
                              className="h-9 text-sm uppercase placeholder:normal-case placeholder:lowercase"
                              autoComplete="off"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pr_notes">Observações</Label>
            <Textarea
              id="pr_notes"
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
              <Syringe className="w-4 h-4" />
              {isPending
                ? "Salvando..."
                : selectedCount > 1
                ? `Aplicar ${selectedCount} vacinas`
                : "Aplicar"}
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
