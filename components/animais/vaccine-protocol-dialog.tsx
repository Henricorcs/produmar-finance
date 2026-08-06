"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, History, RefreshCw, Settings2, Syringe } from "lucide-react";
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
import { cn, formatDate, localDateISO } from "@/lib/utils";
import { applyVaccineProtocol } from "@/app/(app)/animais/actions";
import { AnimalVaccinesDialog } from "./animal-vaccines-dialog";
import {
  FOOTER_CANCEL,
  FOOTER_SUBMIT,
  INLINE_LINK,
  STICKY_FOOTER,
  VACCINE_STATUS_META,
  categoryLabel,
  doseRuleLabel,
  formatDecimalInput,
  formatWeight,
  parseDecimal,
  previousWeighing,
  suggestedDoseMl,
  vaccineStatusFor,
  weightGain,
} from "./animal-shared";
import type {
  AnimalVaccination,
  AnimalVaccine,
  AnimalWeight,
  AnimalWithInfo,
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  animals: AnimalWithInfo[];
  vaccines: AnimalVaccine[];
  /** Todas as aplicações do rebanho — daqui sai o que está vencido. */
  vaccinations: AnimalVaccination[];
  /** Todas as pesagens — daqui sai o ganho desde a última vez. */
  weights?: AnimalWeight[];
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

function newItem(vaccine: AnimalVaccine, weightKg: number, brand?: string | null): ProtocolItem {
  const suggested = suggestedDoseMl(vaccine, weightKg);
  return {
    dose: suggested ? String(suggested).replace(".", ",") : "",
    brand: brand ?? vaccine.default_brand ?? "",
    doseEdited: false,
  };
}

/**
 * Protocolo de vacinação: marca várias vacinas de uma vez para o mesmo animal.
 *
 * Como a vacinação é periódica, ao abrir já vêm marcadas as vacinas que estão
 * VENCIDAS ou que nunca foram dadas — é só conferir e aplicar. Dá para repetir
 * o último protocolo do animal com um toque.
 *
 * O animal também é pesado nessa ida ao curral: o campo de peso mostra na hora
 * quanto ele ganhou desde a última pesagem e em quanto tempo.
 */
export function VaccineProtocolDialog({
  open,
  onClose,
  animals,
  vaccines,
  vaccinations,
  weights = [],
  presetAnimalId,
  presetVaccineIds,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [animalId, setAnimalId] = useState("");
  const [appliedAt, setAppliedAt] = useState("");
  const [items, setItems] = useState<ItemMap>({});
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [vaccinesOpen, setVaccinesOpen] = useState(false);

  const presetKey = (presetVaccineIds ?? []).join(",");

  // ── Situação de cada vacina para o animal escolhido ────────────────────────
  const animalVaccinations = useMemo(
    () => (animalId ? vaccinations.filter((v) => v.animal_id === animalId) : []),
    [animalId, vaccinations]
  );

  const statusByVaccine = useMemo(() => {
    const m = new Map<
      string,
      { last: AnimalVaccination | null; status: ReturnType<typeof vaccineStatusFor>["status"]; nextDate: string | null }
    >();
    for (const v of vaccines) {
      const apps = animalVaccinations
        .filter((x) => x.vaccine_id === v.id)
        .sort((a, b) => (a.applied_at < b.applied_at ? 1 : -1));
      const last = apps[0] ?? null;
      const { status, nextDate } = vaccineStatusFor(
        last?.applied_at ?? null,
        v.recurrence_months
      );
      m.set(v.id, { last, status, nextDate });
    }
    return m;
  }, [vaccines, animalVaccinations]);

  /** Vacinas vencidas ou nunca aplicadas — o que o animal veio tomar. */
  const dueVaccines = useMemo(
    () => vaccines.filter((v) => statusByVaccine.get(v.id)?.status !== "em_dia"),
    [vaccines, statusByVaccine]
  );

  /** Último protocolo do animal (para repetir exatamente o que foi dado). */
  const lastProtocol = useMemo(() => {
    if (animalVaccinations.length === 0) return null;
    const sorted = [...animalVaccinations].sort((a, b) =>
      a.applied_at < b.applied_at ? 1 : -1
    );
    const top = sorted[0];
    const key = top.protocol_id ?? top.id;
    return {
      appliedAt: top.applied_at,
      items: sorted.filter((v) => (v.protocol_id ?? v.id) === key),
    };
  }, [animalVaccinations]);

  // ── Peso: o que está digitado manda na dose e no ganho ─────────────────────
  const animal = animalId ? animals.find((a) => a.id === animalId) ?? null : null;
  const typedWeight = parseDecimal(weight);
  const weightKg = typedWeight > 0 ? typedWeight : Number(animal?.weight ?? 0);

  const lastWeighing = useMemo(() => {
    if (!animalId) return null;
    return previousWeighing(
      weights.filter((w) => w.animal_id === animalId),
      appliedAt || localDateISO()
    );
  }, [animalId, weights, appliedAt]);

  /** Quanto ganhou desde a última pesagem — some assim que o peso é digitado. */
  const gain = useMemo(() => {
    if (!lastWeighing || typedWeight <= 0) return null;
    return weightGain(
      { weighed_at: lastWeighing.weighed_at, weight: Number(lastWeighing.weight) },
      { weighed_at: appliedAt || localDateISO(), weight: typedWeight }
    );
  }, [lastWeighing, typedWeight, appliedAt]);

  // ── Montagem dos itens ─────────────────────────────────────────────────────
  function buildItems(vaccineIds: string[], kg: number, brands?: Map<string, string | null>): ItemMap {
    const next: ItemMap = {};
    for (const vid of vaccineIds) {
      const v = vaccines.find((x) => x.id === vid);
      if (v) next[vid] = newItem(v, kg, brands?.get(vid));
    }
    return next;
  }

  useEffect(() => {
    if (!open) return;
    const aid = presetAnimalId ?? "";
    const a = animals.find((x) => x.id === aid) ?? null;
    const kg = Number(a?.weight ?? 0);

    // com vacinas indicadas usa elas; senão marca sozinho o que está vencido
    const presetIds = presetKey ? presetKey.split(",") : [];
    const ids =
      presetIds.length > 0
        ? presetIds
        : aid
          ? vaccines
              .filter((v) => {
                const apps = vaccinations
                  .filter((x) => x.animal_id === aid && x.vaccine_id === v.id)
                  .sort((x, y) => (x.applied_at < y.applied_at ? 1 : -1));
                return (
                  vaccineStatusFor(apps[0]?.applied_at ?? null, v.recurrence_months).status !==
                  "em_dia"
                );
              })
              .map((v) => v.id)
          : [];

    setAnimalId(aid);
    setItems(buildItems(ids, kg));
    setWeight(kg > 0 ? String(kg).replace(".", ",") : "");
    setAppliedAt(localDateISO());
    setNotes("");
    setError(null);
    // `animals`/`vaccines` mudam a cada refresh do servidor; reabrir é o gatilho
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetAnimalId, presetKey]);

  /** Trocar o animal na mão: recomeça com o peso e as pendências dele. */
  function chooseAnimal(id: string) {
    setAnimalId(id);
    const a = animals.find((x) => x.id === id) ?? null;
    const kg = Number(a?.weight ?? 0);
    setWeight(kg > 0 ? String(kg).replace(".", ",") : "");
    const ids = vaccines
      .filter((v) => {
        const apps = vaccinations
          .filter((x) => x.animal_id === id && x.vaccine_id === v.id)
          .sort((x, y) => (x.applied_at < y.applied_at ? 1 : -1));
        return (
          vaccineStatusFor(apps[0]?.applied_at ?? null, v.recurrence_months).status !== "em_dia"
        );
      })
      .map((v) => v.id);
    setItems(buildItems(ids, kg));
  }

  // Mexer no peso recalcula as doses por peso (menos as digitadas na mão)
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
  }, [weightKg]);

  function toggle(vaccine: AnimalVaccine) {
    setItems((prev) => {
      const next = { ...prev };
      if (next[vaccine.id]) delete next[vaccine.id];
      else next[vaccine.id] = newItem(vaccine, weightKg);
      return next;
    });
  }

  /** Marca todas as vacinas de uma vez (ou limpa, se já estão todas marcadas). */
  function toggleAll() {
    setItems((prev) => {
      if (Object.keys(prev).length === vaccines.length) return {};
      const next: ItemMap = {};
      for (const v of vaccines) next[v.id] = prev[v.id] ?? newItem(v, weightKg);
      return next;
    });
  }

  /** Marca só o que está vencido / nunca aplicado. */
  function markDue() {
    setItems(buildItems(dueVaccines.map((v) => v.id), weightKg));
  }

  /** Repete o último protocolo do animal, com as mesmas marcas. */
  function repeatLast() {
    if (!lastProtocol) return;
    const brands = new Map<string, string | null>(
      lastProtocol.items.map((i) => [i.vaccine_id, i.brand])
    );
    setItems(
      buildItems(
        lastProtocol.items.map((i) => i.vaccine_id),
        weightKg,
        brands
      )
    );
  }

  function patchItem(vaccineId: string, patch: Partial<ProtocolItem>) {
    setItems((prev) =>
      prev[vaccineId] ? { ...prev, [vaccineId]: { ...prev[vaccineId], ...patch } } : prev
    );
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
        weight_kg: typedWeight > 0 ? typedWeight : null,
        notes,
        items: Object.entries(items).map(([vaccine_id, item]) => ({
          vaccine_id,
          dose_ml: parseDecimal(item.dose),
          brand: item.brand,
        })),
      });
      if (r && "error" in r && r.error) {
        setError(r.error);
        return;
      }
      if (r && "warning" in r && r.warning) alert(r.warning);
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
                onChange={chooseAnimal}
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
              className="h-11 sm:h-10"
            />
          </div>

          {/* Pesagem do dia — o ganho aparece na hora */}
          <div className="space-y-1.5">
            <Label htmlFor="pr_weight">Peso de hoje (kg)</Label>
            <Input
              id="pr_weight"
              value={weight}
              onChange={(e) => setWeight(formatDecimalInput(e.target.value))}
              placeholder="ex: 320"
              className="h-11 text-base tabular-nums sm:h-10 sm:text-sm"
              inputMode="decimal"
              autoComplete="off"
            />
            {lastWeighing ? (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Última pesagem {formatWeight(Number(lastWeighing.weight))} em{" "}
                {formatDate(lastWeighing.weighed_at)}
              </p>
            ) : (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Primeira pesagem — a partir dela dá para ver o ganho a cada protocolo.
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

          {/* Vacinas do protocolo — só marcar e conferir a quantidade */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>
                Vacinas aplicadas *
                {selectedCount > 0 && (
                  <span className="text-produmar-600 dark:text-produmar-400 font-normal ml-1.5">
                    {selectedCount} marcada{selectedCount > 1 ? "s" : ""}
                  </span>
                )}
              </Label>
              <div className="flex items-center gap-3">
                {vaccines.length > 1 && (
                  <button type="button" onClick={toggleAll} className={INLINE_LINK}>
                    {selectedCount === vaccines.length ? "Limpar" : "Marcar todas"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setVaccinesOpen(true)}
                  className={INLINE_LINK}
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  Gerenciar
                </button>
              </div>
            </div>

            {/* Atalhos da revacinação: o que venceu e o que foi dado da última vez */}
            {animalId && (dueVaccines.length > 0 || lastProtocol) && (
              <div className="flex gap-2">
                {dueVaccines.length > 0 && (
                  <button
                    type="button"
                    onClick={markDue}
                    className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] px-2 rounded-xl border border-red-200 bg-red-50 text-xs font-medium text-red-700 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-400 active:scale-[0.97] transition-transform"
                  >
                    <RefreshCw className="w-3.5 h-3.5 flex-shrink-0" />
                    Vencidas ({dueVaccines.length})
                  </button>
                )}
                {lastProtocol && (
                  <button
                    type="button"
                    onClick={repeatLast}
                    title={`Mesmas vacinas de ${formatDate(lastProtocol.appliedAt)}`}
                    className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] px-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 active:scale-[0.97] transition-transform"
                  >
                    <History className="w-3.5 h-3.5 flex-shrink-0" />
                    Repetir último
                  </button>
                )}
              </div>
            )}

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
                  const info = statusByVaccine.get(v.id);
                  const statusMeta = info ? VACCINE_STATUS_META[info.status] : null;
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
                        className="w-full flex items-center gap-3 px-3 min-h-[56px] py-3 text-left active:opacity-70"
                      >
                        <span
                          className={`w-6 h-6 rounded-md border flex items-center justify-center flex-shrink-0 ${
                            checked
                              ? "bg-produmar-600 border-produmar-600 text-white"
                              : "border-slate-300 dark:border-slate-600"
                          }`}
                        >
                          {checked && <Check className="w-4 h-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                            {v.name}
                          </span>
                          {/* Periodicidade: quando foi a última e quando vence */}
                          {animalId && info && (
                            <span className="block text-[10px] text-slate-400 truncate">
                              {info.last
                                ? `última ${formatDate(info.last.applied_at)}`
                                : "nunca aplicada"}
                              {info.nextDate ? ` · vence ${formatDate(info.nextDate)}` : ""}
                              {!v.recurrence_months ? " · dose única" : ""}
                            </span>
                          )}
                          {hint && (
                            <span className="block text-[10px] text-slate-400 truncate">
                              {hint}
                            </span>
                          )}
                        </span>
                        {animalId && statusMeta && (
                          <span
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0",
                              statusMeta.chip
                            )}
                          >
                            {statusMeta.label}
                          </span>
                        )}
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
                              className="h-11 text-base tabular-nums sm:h-9 sm:text-sm"
                              inputMode="decimal"
                              autoComplete="off"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor={`brand_${v.id}`} className="text-[11px]">
                              Remédio (marca)
                            </Label>
                            <Input
                              id={`brand_${v.id}`}
                              value={item.brand}
                              onChange={(e) =>
                                patchItem(v.id, { brand: e.target.value.toUpperCase() })
                              }
                              placeholder="ex: zoetis"
                              className="h-11 text-base uppercase placeholder:normal-case placeholder:lowercase sm:h-9 sm:text-sm"
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
              disabled={isPending || selectedCount === 0}
              className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}
            >
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
