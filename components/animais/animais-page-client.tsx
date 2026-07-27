"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  AlertTriangle,
  Baby,
  Beef,
  ImageIcon,
  Pencil,
  Plus,
  Search,
  Settings2,
  Stethoscope,
  Syringe,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBRL, formatDate } from "@/lib/utils";
import {
  deleteBirth,
  deleteTreatment,
  getAnimalThumbnails,
} from "@/app/(app)/animais/actions";
import { AnimalDialog } from "./animal-dialog";
import { AnimalDetailDialog } from "./animal-detail-dialog";
import { TreatmentDialog } from "./treatment-dialog";
import { VaccineProtocolDialog } from "./vaccine-protocol-dialog";
import { BirthDialog } from "./birth-dialog";
import { AnimalVaccinesDialog } from "./animal-vaccines-dialog";
import {
  CATEGORY_META,
  VACCINE_STATUS_META,
  categoryLabel,
  formatAge,
  formatWeight,
  vaccineStatusFor,
} from "./animal-shared";
import type {
  AnimalBirth,
  AnimalCategory,
  AnimalTreatment,
  AnimalType,
  AnimalVaccination,
  AnimalVaccine,
  AnimalWithInfo,
} from "@/lib/types";

// ── Tipos das linhas com joins ────────────────────────────────────────────────
export type VaccinationRow = AnimalVaccination & {
  animal_vaccines: { name: string; recurrence_months: number | null } | null;
  animals: { tag: string } | null;
};

export type TreatmentRow = AnimalTreatment & {
  animals: { tag: string } | null;
};

export type BirthRow = AnimalBirth & {
  /** Mãe (join por animal_births_mother_id_fkey). */
  animals: { tag: string } | null;
};

interface Props {
  animals: AnimalWithInfo[];
  types: AnimalType[];
  vaccines: AnimalVaccine[];
  vaccinations: VaccinationRow[];
  treatments: TreatmentRow[];
  births: BirthRow[];
}

type Tab = "animais" | "vacinas" | "tratamentos" | "partos";
type CategoryFilter = "todos" | AnimalCategory;

export function AnimaisPageClient({
  animals,
  types,
  vaccines,
  vaccinations,
  treatments,
  births,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("animais");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("todos");

  // dialogs
  const [animalDialogOpen, setAnimalDialogOpen] = useState(false);
  const [editAnimal, setEditAnimal] = useState<AnimalWithInfo | null>(null);
  const [detailAnimalId, setDetailAnimalId] = useState<string | null>(null);
  const [treatmentOpen, setTreatmentOpen] = useState(false);
  const [treatmentPresetId, setTreatmentPresetId] = useState<string | null>(null);
  const [editTreatment, setEditTreatment] = useState<AnimalTreatment | null>(null);
  const [vaccinationOpen, setVaccinationOpen] = useState(false);
  const [vaccinationPreset, setVaccinationPreset] = useState<{
    animalId: string | null;
    vaccineIds: string[];
  }>({ animalId: null, vaccineIds: [] });
  const [birthOpen, setBirthOpen] = useState(false);
  const [birthPresetId, setBirthPresetId] = useState<string | null>(null);
  const [vaccinesOpen, setVaccinesOpen] = useState(false);

  // miniaturas das fotos principais (URLs assinadas)
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const photoPaths = useMemo(
    () => animals.map((a) => a.photo_path).filter((p): p is string => !!p),
    [animals]
  );
  const photoKey = photoPaths.join("|");
  useEffect(() => {
    if (!photoKey) {
      setThumbs({});
      return;
    }
    let cancelled = false;
    getAnimalThumbnails(photoKey.split("|")).then((r) => {
      if (!cancelled && "urls" in r) setThumbs(r.urls ?? {});
    });
    return () => {
      cancelled = true;
    };
  }, [photoKey]);

  // O detalhe deriva do id — assim a tela reflete os dados recarregados do servidor
  const detailAnimal = useMemo(
    () => (detailAnimalId ? animals.find((a) => a.id === detailAnimalId) ?? null : null),
    [detailAnimalId, animals]
  );
  const detailTreatments = useMemo(
    () => (detailAnimalId ? treatments.filter((t) => t.animal_id === detailAnimalId) : []),
    [detailAnimalId, treatments]
  );
  const detailVaccinations = useMemo(
    () => (detailAnimalId ? vaccinations.filter((v) => v.animal_id === detailAnimalId) : []),
    [detailAnimalId, vaccinations]
  );
  const detailBirths = useMemo(
    () => (detailAnimalId ? births.filter((b) => b.mother_id === detailAnimalId) : []),
    [detailAnimalId, births]
  );

  const females = useMemo(() => animals.filter((a) => a.sex === "femea"), [animals]);

  /** Remédios já usados — viram sugestões no campo do tratamento. */
  const medicineSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const t of treatments) if (t.medicine) set.add(t.medicine);
    return Array.from(set).sort();
  }, [treatments]);

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const countBy = useMemo(() => {
    const c: Record<AnimalCategory, number> = { boi: 0, vaca: 0, bezerro: 0 };
    for (const a of animals) c[a.category]++;
    return c;
  }, [animals]);

  const pendingVaccination = useMemo(
    () => animals.filter((a) => a.vaccines_due > 0),
    [animals]
  );

  // ── Filtro da lista ─────────────────────────────────────────────────────────
  const filteredAnimals = useMemo(() => {
    const q = search.trim().toUpperCase();
    return animals.filter((a) => {
      if (categoryFilter !== "todos" && a.category !== categoryFilter) return false;
      if (!q) return true;
      return a.tag.includes(q) || (a.type_name ?? "").toUpperCase().includes(q);
    });
  }, [animals, search, categoryFilter]);

  // ── Ações auxiliares ────────────────────────────────────────────────────────
  function openNewAnimal() {
    setEditAnimal(null);
    setAnimalDialogOpen(true);
  }
  function openEdit(animal: AnimalWithInfo) {
    setEditAnimal(animal);
    setAnimalDialogOpen(true);
  }
  function openTreatment(animal?: AnimalWithInfo | null, treatment?: AnimalTreatment | null) {
    setTreatmentPresetId(animal?.id ?? null);
    setEditTreatment(treatment ?? null);
    setTreatmentOpen(true);
  }
  function openVaccination(animal?: AnimalWithInfo | null, vaccineIds?: string[]) {
    setVaccinationPreset({ animalId: animal?.id ?? null, vaccineIds: vaccineIds ?? [] });
    setVaccinationOpen(true);
  }
  function openBirth(animal?: AnimalWithInfo | null) {
    setBirthPresetId(animal?.id ?? null);
    setBirthOpen(true);
  }

  function handleDeleteTreatment(id: string) {
    if (!confirm("Remover este tratamento?")) return;
    startTransition(async () => {
      await deleteTreatment(id);
    });
  }
  function handleDeleteBirth(id: string) {
    if (!confirm("Remover este parto? O bezerro cadastrado continua no rebanho.")) return;
    startTransition(async () => {
      await deleteBirth(id);
    });
  }

  const tabs: {
    value: Tab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count: number;
  }[] = [
    { value: "animais", label: "Animais", icon: Beef, count: animals.length },
    { value: "vacinas", label: "Vacinas", icon: Syringe, count: pendingVaccination.length },
    {
      value: "tratamentos",
      label: "Tratam.",
      icon: Stethoscope,
      count: treatments.length,
    },
    { value: "partos", label: "Partos", icon: Baby, count: births.length },
  ];

  const categoryFilters: { value: CategoryFilter; label: string }[] = [
    { value: "todos", label: "Todos" },
    { value: "vaca", label: "Vacas" },
    { value: "boi", label: "Bois" },
    { value: "bezerro", label: "Bezerros" },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">Animais</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Rebanho, tratamentos, vacinas e partos
          </p>
        </div>
        <Button onClick={openNewAnimal} className="flex-shrink-0">
          <Plus className="w-4 h-4" />
          Novo
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-2">
        <KpiCard icon={Beef} label="Total" value={String(animals.length)} tone="produmar" />
        <KpiCard icon={Beef} label="Vacas" value={String(countBy.vaca)} tone="rose" />
        <KpiCard icon={Beef} label="Bois" value={String(countBy.boi)} tone="produmar" />
        <KpiCard icon={Baby} label="Bezerros" value={String(countBy.bezerro)} tone="amber" />
      </div>

      {/* Abas */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                active
                  ? "bg-produmar-600 border-produmar-600 text-white"
                  : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              {t.count > 0 && <span className="opacity-70">{t.count}</span>}
            </button>
          );
        })}
      </div>

      {/* ── Aba: Animais ─────────────────────────────────────────────────── */}
      {tab === "animais" && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar pelo número ou tipo..."
              className="pl-9"
              autoComplete="off"
            />
          </div>

          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
            {categoryFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => setCategoryFilter(f.value)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  categoryFilter === f.value
                    ? "bg-produmar-600 border-produmar-600 text-white"
                    : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                }`}
              >
                {f.label}
                {f.value !== "todos" && (
                  <span className="opacity-60 ml-1">{countBy[f.value]}</span>
                )}
              </button>
            ))}
          </div>

          {filteredAnimals.length === 0 ? (
            animals.length === 0 ? (
              <EmptyState
                icon={Beef}
                text="Nenhum animal cadastrado ainda."
                hint="Cadastre o primeiro para controlar vacinas e tratamentos."
                action={
                  <Button size="sm" onClick={openNewAnimal}>
                    <Plus className="w-4 h-4" /> Novo animal
                  </Button>
                }
              />
            ) : (
              <EmptyState icon={Search} text="Nada encontrado com esse filtro." />
            )
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredAnimals.map((a) => (
                <AnimalCard
                  key={a.id}
                  animal={a}
                  thumbUrl={a.photo_path ? thumbs[a.photo_path] ?? null : null}
                  hasVaccines={vaccines.length > 0}
                  onOpen={() => setDetailAnimalId(a.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Aba: Vacinas ─────────────────────────────────────────────────── */}
      {tab === "vacinas" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => openVaccination(null)}>
              <Syringe className="w-4 h-4" />
              Aplicar protocolo
            </Button>
            <Button variant="outline" onClick={() => setVaccinesOpen(true)}>
              <Settings2 className="w-4 h-4" />
              Vacinas
            </Button>
          </div>

          {vaccines.length === 0 ? (
            <EmptyState
              icon={Syringe}
              text="Nenhuma vacina cadastrada."
              hint="Cadastre as vacinas do rebanho para acompanhar quem está em dia."
              action={
                <Button size="sm" onClick={() => setVaccinesOpen(true)}>
                  <Plus className="w-4 h-4" /> Cadastrar vacina
                </Button>
              }
            />
          ) : animals.length === 0 ? (
            <EmptyState icon={Beef} text="Cadastre os animais para acompanhar a vacinação." />
          ) : (
            <div className="space-y-2">
              {[...animals]
                .sort((a, b) => b.vaccines_due - a.vaccines_due)
                .map((a) => (
                  <VaccinationStatusRow
                    key={a.id}
                    animal={a}
                    vaccines={vaccines}
                    vaccinations={vaccinations}
                    onOpen={() => setDetailAnimalId(a.id)}
                  />
                ))}
            </div>
          )}
        </div>
      )}

      {/* ── Aba: Tratamentos ─────────────────────────────────────────────── */}
      {tab === "tratamentos" && (
        <div className="space-y-3">
          <Button className="w-full" onClick={() => openTreatment(null)}>
            <Plus className="w-4 h-4" />
            Novo tratamento
          </Button>

          {treatments.length === 0 ? (
            <EmptyState
              icon={Stethoscope}
              text="Nenhum tratamento registrado."
              hint="Cada tratamento guarda o remédio aplicado e a dose."
            />
          ) : (
            <div className="space-y-2">
              {treatments.map((t) => (
                <div
                  key={t.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {t.description}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Animal {t.animals?.tag ?? "—"} · {formatDate(t.applied_at)}
                        {t.medicine ? ` · ${t.medicine}` : ""}
                        {t.dose ? ` (${t.dose})` : ""}
                        {Number(t.cost) > 0 ? ` · ${formatBRL(Number(t.cost))}` : ""}
                      </p>
                      {t.next_application && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                          repetir em {formatDate(t.next_application)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => openTreatment(null, t)}
                        aria-label="Editar tratamento"
                        className="p-1 text-slate-300 hover:text-produmar-600"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteTreatment(t.id)}
                        disabled={isPending}
                        aria-label="Remover tratamento"
                        className="p-1 text-slate-300 hover:text-red-500"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Aba: Partos ──────────────────────────────────────────────────── */}
      {tab === "partos" && (
        <div className="space-y-3">
          <Button className="w-full" onClick={() => openBirth(null)}>
            <Plus className="w-4 h-4" />
            Registrar parto
          </Button>

          {births.length === 0 ? (
            <EmptyState
              icon={Baby}
              text="Nenhum parto registrado."
              hint="Cada bezerro nascido entra com a sua data."
            />
          ) : (
            <div className="space-y-2">
              {births.map((b) => (
                <div
                  key={b.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {b.calf_sex === "macho" ? "Bezerro" : "Bezerra"}
                        {b.calf_tag ? ` nº ${b.calf_tag}` : ""}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Mãe {b.animals?.tag ?? "—"} · {formatDate(b.birth_date)}
                        {b.calf_animal_id ? " · cadastrado no rebanho" : ""}
                      </p>
                      {b.notes && (
                        <p className="text-[11px] text-slate-400 mt-0.5">{b.notes}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteBirth(b.id)}
                      disabled={isPending}
                      aria-label="Remover parto"
                      className="p-1 text-slate-300 hover:text-red-500 flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <AnimalDialog
        open={animalDialogOpen}
        onClose={() => setAnimalDialogOpen(false)}
        animal={editAnimal}
        types={types}
      />
      <AnimalDetailDialog
        open={!!detailAnimal}
        onClose={() => setDetailAnimalId(null)}
        animal={detailAnimal}
        treatments={detailTreatments}
        vaccinations={detailVaccinations}
        births={detailBirths}
        vaccines={vaccines}
        onEdit={(a) => {
          setDetailAnimalId(null);
          openEdit(a);
        }}
        onTreatment={(a) => openTreatment(a)}
        onVaccinate={(a, vaccineIds) => openVaccination(a, vaccineIds)}
        onBirth={(a) => openBirth(a)}
      />
      <TreatmentDialog
        open={treatmentOpen}
        onClose={() => setTreatmentOpen(false)}
        animals={animals}
        presetAnimalId={treatmentPresetId}
        treatment={editTreatment}
        medicineSuggestions={medicineSuggestions}
      />
      <VaccineProtocolDialog
        open={vaccinationOpen}
        onClose={() => setVaccinationOpen(false)}
        animals={animals}
        vaccines={vaccines}
        presetAnimalId={vaccinationPreset.animalId}
        presetVaccineIds={vaccinationPreset.vaccineIds}
      />
      <BirthDialog
        open={birthOpen}
        onClose={() => setBirthOpen(false)}
        mothers={females}
        presetMotherId={birthPresetId}
      />
      <AnimalVaccinesDialog
        open={vaccinesOpen}
        onClose={() => setVaccinesOpen(false)}
        vaccines={vaccines}
      />
    </div>
  );
}

// ── Card do animal ───────────────────────────────────────────────────────────
function AnimalCard({
  animal,
  thumbUrl,
  hasVaccines,
  onOpen,
}: {
  animal: AnimalWithInfo;
  thumbUrl: string | null;
  /** Há vacinas cadastradas? Sem elas não faz sentido dizer "em dia". */
  hasVaccines: boolean;
  onOpen: () => void;
}) {
  const meta = CATEGORY_META[animal.category];
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 cursor-pointer transition-all hover:shadow-md hover:border-produmar-200 dark:hover:border-produmar-800 active:bg-slate-50 dark:active:bg-slate-800/60"
    >
      <div className="flex items-start gap-3">
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt={`Animal ${animal.tag}`}
            className="w-14 h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700 flex-shrink-0"
          />
        ) : (
          <div className="w-14 h-14 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center flex-shrink-0">
            <ImageIcon className="w-5 h-5 text-slate-300 dark:text-slate-600" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
              {animal.tag}
            </p>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${meta.chip}`}
            >
              {categoryLabel(animal.category, animal.sex)}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">
            {animal.type_name ?? "sem tipo"} · {formatAge(animal.age_months)}
            {Number(animal.weight) > 0 ? ` · ${formatWeight(Number(animal.weight))}` : ""}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {animal.vaccines_due > 0 ? (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400">
                <AlertTriangle className="w-3 h-3" />
                {animal.vaccines_due} vacina(s)
              </span>
            ) : (
              hasVaccines && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                  <Syringe className="w-3 h-3" />
                  Vacinas em dia
                </span>
              )
            )}
            {animal.calves_count > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                <Baby className="w-3 h-3" />
                {animal.calves_count}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Linha de situação de vacinação ───────────────────────────────────────────
function VaccinationStatusRow({
  animal,
  vaccines,
  vaccinations,
  onOpen,
}: {
  animal: AnimalWithInfo;
  vaccines: AnimalVaccine[];
  vaccinations: VaccinationRow[];
  onOpen: () => void;
}) {
  const rows = vaccines.map((v) => {
    const last = vaccinations
      .filter((x) => x.animal_id === animal.id && x.vaccine_id === v.id)
      .sort((a, b) => (a.applied_at < b.applied_at ? 1 : -1))[0];
    const { status } = vaccineStatusFor(last?.applied_at ?? null, v.recurrence_months);
    return { vaccine: v, status };
  });

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 cursor-pointer transition-all hover:shadow-md hover:border-produmar-200 dark:hover:border-produmar-800"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
          {animal.tag}
          <span className="text-[11px] text-slate-400 font-normal ml-1.5">
            {categoryLabel(animal.category, animal.sex)}
          </span>
        </p>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
            animal.vaccines_due > 0
              ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
          }`}
        >
          {animal.vaccines_due > 0 ? `${animal.vaccines_due} pendente(s)` : "Em dia"}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {rows.map(({ vaccine, status }) => (
          <span
            key={vaccine.id}
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${VACCINE_STATUS_META[status].chip}`}
          >
            {vaccine.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── KPI card ────────────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "produmar" | "rose" | "amber";
}) {
  const tones = {
    produmar: "bg-produmar-50 text-produmar-600 dark:bg-produmar-900/30 dark:text-produmar-400",
    rose: "bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 flex flex-col items-center text-center gap-1">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tones}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-base font-bold text-slate-800 dark:text-slate-100 tabular-nums leading-none">
        {value}
      </p>
      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{label}</p>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({
  icon: Icon,
  text,
  hint,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
      <Icon className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
      <p className="text-sm text-slate-500 dark:text-slate-400">{text}</p>
      {hint && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
