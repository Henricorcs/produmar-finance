"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Beef,
  ChevronRight,
  Plus,
  Printer,
  Search,
  Settings2,
  Syringe,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatDate } from "@/lib/utils";
import { AnimalDialog } from "./animal-dialog";
import { AnimalDetailDialog } from "./animal-detail-dialog";
import { VaccineProtocolDialog } from "./vaccine-protocol-dialog";
import { AnimalVaccinesDialog } from "./animal-vaccines-dialog";
import { TreatmentDialog } from "./treatment-dialog";
import { BirthDialog } from "./birth-dialog";
import { QuickAddRow } from "./quick-add-row";
import {
  categoryLabel,
  formatMl,
  formatWeight,
  pariuLabel,
  suggestedDoseMl,
  vaccineStatusFor,
} from "./animal-shared";
import type {
  AnimalBirth,
  AnimalBreed,
  AnimalCategory,
  AnimalTreatment,
  AnimalVaccination,
  AnimalVaccine,
  AnimalWithInfo,
} from "@/lib/types";

// ── Tipo da linha com joins ───────────────────────────────────────────────────
export type VaccinationRow = AnimalVaccination & {
  animal_vaccines: { name: string; recurrence_months: number | null } | null;
  animals: { tag: string } | null;
};

interface Props {
  animals: AnimalWithInfo[];
  breeds: AnimalBreed[];
  vaccines: AnimalVaccine[];
  vaccinations: VaccinationRow[];
  treatments: AnimalTreatment[];
  births: AnimalBirth[];
}

type Tab = "rebanho" | "vacinacao";
type CategoryFilter = "todos" | AnimalCategory;

export function AnimaisPageClient({
  animals,
  breeds,
  vaccines,
  vaccinations,
  treatments,
  births,
}: Props) {
  const [tab, setTab] = useState<Tab>("rebanho");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("todos");
  const [onlyPending, setOnlyPending] = useState(false);

  // dialogs
  const [animalDialogOpen, setAnimalDialogOpen] = useState(false);
  const [editAnimal, setEditAnimal] = useState<AnimalWithInfo | null>(null);
  const [detailAnimalId, setDetailAnimalId] = useState<string | null>(null);
  const [protocolOpen, setProtocolOpen] = useState(false);
  const [protocolPreset, setProtocolPreset] = useState<{
    animalId: string | null;
    vaccineIds: string[];
  }>({ animalId: null, vaccineIds: [] });
  const [vaccinesOpen, setVaccinesOpen] = useState(false);
  const [treatmentOpen, setTreatmentOpen] = useState(false);
  const [treatmentPresetId, setTreatmentPresetId] = useState<string | null>(null);
  const [birthOpen, setBirthOpen] = useState(false);
  const [birthPresetId, setBirthPresetId] = useState<string | null>(null);

  // ── Índices por animal ──────────────────────────────────────────────────────
  const treatmentsByAnimal = useMemo(() => {
    const m = new Map<string, AnimalTreatment[]>();
    for (const t of treatments) {
      const arr = m.get(t.animal_id);
      if (arr) arr.push(t);
      else m.set(t.animal_id, [t]);
    }
    return m;
  }, [treatments]);

  const birthsByMother = useMemo(() => {
    const m = new Map<string, AnimalBirth[]>();
    for (const b of births) {
      const arr = m.get(b.mother_id);
      if (arr) arr.push(b);
      else m.set(b.mother_id, [b]);
    }
    return m;
  }, [births]);

  // O detalhe deriva do id — assim a tela reflete os dados recarregados do servidor
  const detailAnimal = useMemo(
    () => (detailAnimalId ? animals.find((a) => a.id === detailAnimalId) ?? null : null),
    [detailAnimalId, animals]
  );
  const detailVaccinations = useMemo(
    () => (detailAnimalId ? vaccinations.filter((v) => v.animal_id === detailAnimalId) : []),
    [detailAnimalId, vaccinations]
  );
  const detailTreatments = detailAnimalId
    ? treatmentsByAnimal.get(detailAnimalId) ?? []
    : [];
  const detailBirths = detailAnimalId ? birthsByMother.get(detailAnimalId) ?? [] : [];

  const females = useMemo(() => animals.filter((a) => a.sex === "femea"), [animals]);

  /** Remédios já usados — viram sugestões no campo do tratamento. */
  const medicineSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const t of treatments) if (t.medicine) set.add(t.medicine);
    return Array.from(set).sort();
  }, [treatments]);

  // ── Contagens ───────────────────────────────────────────────────────────────
  const countBy = useMemo(() => {
    const c: Record<AnimalCategory, number> = { boi: 0, vaca: 0, bezerro: 0 };
    for (const a of animals) c[a.category]++;
    return c;
  }, [animals]);

  const pendingCount = useMemo(
    () => animals.filter((a) => a.vaccines_due > 0).length,
    [animals]
  );

  // ── Filtro do rebanho ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return animals.filter((a) => {
      if (categoryFilter !== "todos" && a.category !== categoryFilter) return false;
      if (onlyPending && a.vaccines_due === 0) return false;
      if (!q) return true;
      return a.tag.includes(q) || (a.breed_name ?? "").toUpperCase().includes(q);
    });
  }, [animals, search, categoryFilter, onlyPending]);

  /**
   * Registro de vacinação: quem foi vacinado, quando, com qual vacina e
   * quantos ml. As vacinas aplicadas juntas (mesmo protocol_id) viram uma
   * linha só — foi uma ida ao curral.
   */
  const log = useMemo(() => {
    const byProtocol = new Map<string, VaccinationRow[]>();
    for (const v of vaccinations) {
      const key = v.protocol_id ?? v.id;
      const arr = byProtocol.get(key);
      if (arr) arr.push(v);
      else byProtocol.set(key, [v]);
    }

    const q = search.trim().toUpperCase();
    return Array.from(byProtocol.entries())
      .map(([key, items]) => ({
        key,
        animalId: items[0].animal_id,
        tag: items[0].animals?.tag ?? "—",
        appliedAt: items[0].applied_at,
        items,
      }))
      .filter((g) =>
        q
          ? g.tag.includes(q) ||
            g.items.some((i) => (i.animal_vaccines?.name ?? "").toUpperCase().includes(q))
          : true
      )
      .sort((a, b) => (a.appliedAt < b.appliedAt ? 1 : -1));
  }, [vaccinations, search]);

  /** Link da impressão do rebanho respeitando os filtros da tela. */
  const printHref = useMemo(() => {
    const params = new URLSearchParams();
    if (categoryFilter !== "todos") params.set("categoria", categoryFilter);
    if (onlyPending) params.set("pendentes", "1");
    const qs = params.toString();
    return `/imprimir/animais${qs ? `?${qs}` : ""}`;
  }, [categoryFilter, onlyPending]);

  // ── Ações auxiliares ────────────────────────────────────────────────────────
  function openNewAnimal() {
    setEditAnimal(null);
    setAnimalDialogOpen(true);
  }
  function openEdit(animal: AnimalWithInfo) {
    setEditAnimal(animal);
    setAnimalDialogOpen(true);
  }
  function openProtocol(animal?: AnimalWithInfo | null, vaccineIds?: string[]) {
    setProtocolPreset({ animalId: animal?.id ?? null, vaccineIds: vaccineIds ?? [] });
    setProtocolOpen(true);
  }
  function openTreatment(animal?: AnimalWithInfo | null) {
    setTreatmentPresetId(animal?.id ?? null);
    setTreatmentOpen(true);
  }
  function openBirth(animal?: AnimalWithInfo | null) {
    setBirthPresetId(animal?.id ?? null);
    setBirthOpen(true);
  }

  const tabs: {
    value: Tab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    count: number;
    alert?: boolean;
  }[] = [
    { value: "rebanho", label: "Rebanho", icon: Beef, count: animals.length },
    {
      value: "vacinacao",
      label: "Vacinação",
      icon: Syringe,
      count: pendingCount,
      alert: pendingCount > 0,
    },
  ];

  const categoryFilters: { value: CategoryFilter; label: string; count: number }[] = [
    { value: "todos", label: "Todos", count: animals.length },
    { value: "vaca", label: "Vacas", count: countBy.vaca },
    { value: "boi", label: "Bois", count: countBy.boi },
    { value: "bezerro", label: "Bezerros", count: countBy.bezerro },
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">Animais</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
            Guia de vacinação do rebanho
          </p>
        </div>
        <Button onClick={openNewAnimal} className="flex-shrink-0 h-11 px-4">
          <Plus className="w-4 h-4" />
          Novo
        </Button>
      </div>

      {/* Abas */}
      <div className="grid grid-cols-2 gap-1.5 sm:flex">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 min-h-[58px] px-1 rounded-xl border text-sm font-medium transition-colors active:scale-[0.97]",
                "sm:flex-row sm:min-h-0 sm:px-3 sm:py-2 sm:gap-1.5",
                active
                  ? "bg-produmar-600 border-produmar-600 text-white"
                  : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
              )}
            >
              <Icon className="w-5 h-5 sm:w-4 sm:h-4" />
              <span className="leading-none">{t.label}</span>
              {t.count > 0 && (
                <span
                  className={cn(
                    "absolute top-1 right-1 min-w-[20px] h-[20px] px-1 rounded-full text-xs font-semibold flex items-center justify-center",
                    "sm:static sm:min-w-0 sm:h-auto sm:px-0 sm:bg-transparent sm:opacity-70",
                    active
                      ? "bg-white/25 text-white sm:text-white"
                      : t.alert
                      ? "bg-red-500 text-white sm:bg-transparent sm:text-red-500"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 sm:bg-transparent"
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Aba: Rebanho — a planilha do curral ──────────────────────────── */}
      {tab === "rebanho" && (
        <>
          {/* Filtro por categoria — também serve de resumo do rebanho */}
          <div className="grid grid-cols-4 gap-1.5">
            {categoryFilters.map((f) => {
              const active = categoryFilter === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setCategoryFilter(f.value)}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 min-h-[56px] rounded-xl border transition-colors active:scale-[0.97]",
                    active
                      ? "bg-produmar-50 border-produmar-300 dark:bg-produmar-950/40 dark:border-produmar-700"
                      : "bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700"
                  )}
                >
                  <span
                    className={cn(
                      "text-xl font-bold tabular-nums leading-none",
                      active
                        ? "text-produmar-700 dark:text-produmar-300"
                        : "text-slate-800 dark:text-slate-100"
                    )}
                  >
                    {f.count}
                  </span>
                  <span
                    className={cn(
                      "text-xs leading-tight",
                      active
                        ? "text-produmar-600 dark:text-produmar-400"
                        : "text-slate-500 dark:text-slate-400"
                    )}
                  >
                    {f.label}
                  </span>
                </button>
              );
            })}
          </div>

          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Buscar pelo número ou raça..."
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOnlyPending((v) => !v)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-xl border text-sm font-medium transition-colors active:scale-[0.97]",
                onlyPending
                  ? "bg-red-50 border-red-300 text-red-700 dark:bg-red-950/40 dark:border-red-800 dark:text-red-400"
                  : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
              )}
            >
              <AlertTriangle className="w-4 h-4" />
              Só pendentes
              {pendingCount > 0 && <span className="opacity-70">{pendingCount}</span>}
            </button>
            <button
              type="button"
              onClick={() => window.open(printHref, "_blank")}
              className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-produmar-200 bg-white text-sm font-medium text-produmar-700 dark:bg-slate-900 dark:border-slate-700 dark:text-produmar-400 transition-colors active:scale-[0.97]"
            >
              <Printer className="w-4 h-4" />
              Imprimir guia
            </button>
          </div>

          {/* A planilha fica sempre na tela: a primeira linha é de digitação —
              cadastra o animal sem abrir formulário. */}
          <RebanhoTable
            animals={filtered}
            breeds={breeds}
            vaccines={vaccines}
            vaccinations={vaccinations}
            birthsByMother={birthsByMother}
            treatmentsByAnimal={treatmentsByAnimal}
            onOpenAnimal={(id) => setDetailAnimalId(id)}
            onApply={(a, ids) => openProtocol(a, ids)}
            emptyMessage={
              filtered.length > 0
                ? undefined
                : animals.length === 0
                ? "Nenhum animal ainda — digite o número na linha acima e aperte Enter."
                : onlyPending
                ? "Ninguém com vacina pendente."
                : "Nada encontrado com esse filtro."
            }
          />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Digite na primeira linha para cadastrar (Enter salva). Célula vermelha = vacina
            atrasada ou nunca aplicada, com os ml a aplicar — toque nela para registrar.
            Passe o mouse no tratamento para ver o remédio; no celular, toque no animal.
          </p>
        </>
      )}

      {/* ── Aba: Vacinação — registro do que foi aplicado ────────────────── */}
      {tab === "vacinacao" && (
        <>
          <div className="flex gap-2">
            <Button className="flex-[2] h-11" onClick={() => openProtocol(null)}>
              <Syringe className="w-4 h-4" />
              Aplicar vacina
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-11"
              onClick={() => setVaccinesOpen(true)}
            >
              <Settings2 className="w-4 h-4" />
              Vacinas
            </Button>
          </div>

          {pendingCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setTab("rebanho");
                setOnlyPending(true);
              }}
              className="w-full flex items-center gap-2 min-h-[44px] px-3 rounded-xl border border-red-200 bg-red-50 text-sm font-medium text-red-700 dark:bg-red-950/30 dark:border-red-900/50 dark:text-red-400 active:scale-[0.98] transition-transform"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left">
                {pendingCount} animal(is) com vacina pendente
              </span>
              <ChevronRight className="w-4 h-4 flex-shrink-0" />
            </button>
          )}

          {vaccinations.length > 0 && (
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Buscar por animal ou vacina..."
            />
          )}

          {log.length === 0 ? (
            <EmptyState
              icon={Syringe}
              text={
                vaccinations.length === 0
                  ? "Nenhuma vacina aplicada ainda."
                  : "Nada encontrado com essa busca."
              }
              hint={
                vaccinations.length === 0
                  ? "O que for aplicado aparece aqui: animal, vacina, ml e marca."
                  : undefined
              }
            />
          ) : (
            <div className="space-y-2">
              {log.map((g) => (
                <LogRow
                  key={g.key}
                  tag={g.tag}
                  appliedAt={g.appliedAt}
                  items={g.items}
                  onOpen={() => setDetailAnimalId(g.animalId)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Dialogs */}
      <AnimalDialog
        open={animalDialogOpen}
        onClose={() => setAnimalDialogOpen(false)}
        animal={editAnimal}
        breeds={breeds}
      />
      <AnimalDetailDialog
        open={!!detailAnimal}
        onClose={() => setDetailAnimalId(null)}
        animal={detailAnimal}
        vaccinations={detailVaccinations}
        vaccines={vaccines}
        treatments={detailTreatments}
        births={detailBirths}
        onEdit={(a) => {
          setDetailAnimalId(null);
          openEdit(a);
        }}
        onVaccinate={(a, vaccineIds) => openProtocol(a, vaccineIds)}
        onTreatment={(a) => openTreatment(a)}
        onBirth={(a) => openBirth(a)}
      />
      <VaccineProtocolDialog
        open={protocolOpen}
        onClose={() => setProtocolOpen(false)}
        animals={animals}
        vaccines={vaccines}
        presetAnimalId={protocolPreset.animalId}
        presetVaccineIds={protocolPreset.vaccineIds}
      />
      <TreatmentDialog
        open={treatmentOpen}
        onClose={() => setTreatmentOpen(false)}
        animals={animals}
        presetAnimalId={treatmentPresetId}
        medicineSuggestions={medicineSuggestions}
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

// ── Planilha do rebanho ──────────────────────────────────────────────────────
// A mesma cara do guia impresso: uma linha por animal, uma coluna por vacina
// (com os ml a aplicar), pariu (M/F) e o último tratamento com o remédio no
// tooltip. No celular desliza para o lado com a coluna do número fixa.
function RebanhoTable({
  animals,
  breeds,
  vaccines,
  vaccinations,
  birthsByMother,
  treatmentsByAnimal,
  onOpenAnimal,
  onApply,
  emptyMessage,
}: {
  animals: AnimalWithInfo[];
  breeds: AnimalBreed[];
  vaccines: AnimalVaccine[];
  vaccinations: VaccinationRow[];
  birthsByMother: Map<string, AnimalBirth[]>;
  treatmentsByAnimal: Map<string, AnimalTreatment[]>;
  onOpenAnimal: (id: string) => void;
  onApply: (animal: AnimalWithInfo, vaccineIds: string[]) => void;
  /** Mostrado numa linha quando o filtro não devolve ninguém. */
  emptyMessage?: string;
}) {
  // última aplicação por animal+vacina
  const lastByKey = useMemo(() => {
    const m = new Map<string, VaccinationRow>();
    for (const v of vaccinations) {
      const key = `${v.animal_id}|${v.vaccine_id}`;
      const cur = m.get(key);
      if (!cur || cur.applied_at < v.applied_at) m.set(key, v);
    }
    return m;
  }, [vaccinations]);

  // quanto levar: soma dos ml pendentes de cada vacina (dos animais listados)
  const totals = useMemo(
    () =>
      vaccines.map((v) => {
        let count = 0;
        let ml = 0;
        for (const a of animals) {
          const last = lastByKey.get(`${a.id}|${v.id}`) ?? null;
          const { status } = vaccineStatusFor(last?.applied_at ?? null, v.recurrence_months);
          if (status === "em_dia") continue;
          count++;
          const dose = suggestedDoseMl(v, Number(a.weight));
          if (dose) ml += dose;
        }
        return { count, ml: Math.round(ml * 10) / 10 };
      }),
    [animals, vaccines, lastByKey]
  );

  return (
    <div className="overflow-x-auto -mx-4 sm:mx-0 border-y sm:border border-slate-200 dark:border-slate-700 sm:rounded-xl bg-white dark:bg-slate-900">
      <table className="w-full text-[15px] min-w-[940px]">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800/60 text-left text-[13px] text-slate-600 dark:text-slate-300">
            <th className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 font-semibold">
              Nº
            </th>
            <th className="px-2 py-2.5 font-semibold">Cat.</th>
            <th className="px-2 py-2.5 font-semibold">Raça</th>
            <th className="px-2 py-2.5 font-semibold">Peso</th>
            <th
              className="px-2 py-2.5 font-semibold"
              title="Quantos bezerros pariu (M = macho, F = fêmea)"
            >
              Pariu
            </th>
            {vaccines.map((v) => (
              <th
                key={v.id}
                className="px-2 py-3 font-semibold text-center text-sm capitalize whitespace-nowrap"
              >
                {v.name}
                {/* o remédio usado nessa vacina (cadastrado como "remédio/marca") */}
                {v.default_brand && (
                  <span className="block text-[13px] font-normal text-slate-500 dark:text-slate-400">
                    {v.default_brand}
                  </span>
                )}
              </th>
            ))}
            <th className="px-2 py-2.5 font-semibold">Tratamento</th>
          </tr>
        </thead>
        <tbody>
          {/* Linha de digitação — cadastrar sem clicar em "Novo" */}
          <QuickAddRow breeds={breeds} vaccinesCount={vaccines.length} />

          {emptyMessage && (
            <tr className="border-t border-slate-100 dark:border-slate-800">
              <td
                colSpan={6 + vaccines.length}
                className="px-3 py-6 text-center text-base text-slate-500 dark:text-slate-400"
              >
                {emptyMessage}
              </td>
            </tr>
          )}

          {animals.map((a) => {
            const weightKg = Number(a.weight);
            const abirths = birthsByMother.get(a.id) ?? [];
            const atreatments = treatmentsByAnimal.get(a.id) ?? [];
            const lastTreatment = atreatments[0] ?? null;
            return (
              <tr
                key={a.id}
                onClick={() => onOpenAnimal(a.id)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onOpenAnimal(a.id);
                }}
                className="group border-t border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 active:bg-slate-100 dark:active:bg-slate-800 transition-colors"
              >
                <td className="sticky left-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/60 px-3 py-3 font-bold text-[17px] text-slate-800 dark:text-slate-100 whitespace-nowrap">
                  {a.tag}
                </td>
                <td className="px-2 py-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                  {categoryLabel(a.category, a.sex)}
                </td>
                <td className="px-2 py-3 whitespace-nowrap capitalize text-slate-600 dark:text-slate-300">
                  {a.breed_name ?? "—"}
                </td>
                <td className="px-2 py-3 whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-300">
                  {weightKg > 0 ? formatWeight(weightKg) : "—"}
                </td>
                <td
                  className="px-2 py-3 whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-300"
                  title={birthsTitle(abirths)}
                >
                  {pariuLabel(a.sex, abirths)}
                </td>
                {vaccines.map((v) => {
                  const last = lastByKey.get(`${a.id}|${v.id}`) ?? null;
                  const { status } = vaccineStatusFor(
                    last?.applied_at ?? null,
                    v.recurrence_months
                  );
                  const due = status !== "em_dia";
                  const dose = suggestedDoseMl(v, weightKg);
                  return (
                    <td
                      key={v.id}
                      className={cn(
                        "px-1 py-1 text-center whitespace-nowrap",
                        due && "bg-red-50 dark:bg-red-950/30"
                      )}
                    >
                      {due ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onApply(a, [v.id]);
                          }}
                          title={`Aplicar ${v.name} no animal ${a.tag}`}
                          className="min-h-[40px] px-2 rounded-lg font-bold text-[17px] text-red-700 dark:text-red-400 tabular-nums active:scale-[0.95] transition-transform"
                        >
                          {dose ? formatMl(dose) : "aplicar"}
                        </button>
                      ) : (
                        <span className="text-[13px] text-slate-500 dark:text-slate-400">
                          ok{last ? ` ${formatDate(last.applied_at).slice(3)}` : ""}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td
                  className="px-2 py-3 whitespace-nowrap max-w-[170px]"
                  title={treatmentsTitle(atreatments)}
                >
                  {lastTreatment ? (
                    <div className="min-w-0">
                      <p className="truncate text-slate-700 dark:text-slate-200">
                        {lastTreatment.description}
                      </p>
                      <p className="truncate text-[13px] text-slate-500 dark:text-slate-400">
                        {formatDate(lastTreatment.applied_at)}
                        {lastTreatment.medicine ? ` · ${lastTreatment.medicine}` : ""}
                        {atreatments.length > 1 ? ` · +${atreatments.length - 1}` : ""}
                      </p>
                    </div>
                  ) : (
                    <span className="text-slate-300 dark:text-slate-600">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        {vaccines.length > 0 && animals.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-produmar-200 dark:border-slate-600 bg-produmar-50/60 dark:bg-slate-800/80">
              <td className="sticky left-0 bg-produmar-50 dark:bg-slate-800 px-3 py-2.5 font-bold text-[13px] text-produmar-700 dark:text-produmar-300 whitespace-nowrap">
                Levar
              </td>
              <td colSpan={4} className="px-2 py-2.5 text-right text-[13px] text-slate-500 dark:text-slate-400">
                total das pendentes →
              </td>
              {vaccines.map((v, i) => (
                <td key={v.id} className="px-1 py-2 text-center whitespace-nowrap">
                  {totals[i].count > 0 ? (
                    <div>
                      <p className="font-bold text-base tabular-nums text-slate-800 dark:text-slate-100">
                        {totals[i].ml > 0 ? formatMl(totals[i].ml) : "—"}
                      </p>
                      <p className="text-[13px] text-slate-500 dark:text-slate-400">{totals[i].count} animal(is)</p>
                    </div>
                  ) : (
                    <span className="text-sm text-slate-300 dark:text-slate-600">—</span>
                  )}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

/** Tooltip nativo com todos os partos (data — sexo — nº). */
function birthsTitle(births: AnimalBirth[]): string | undefined {
  if (births.length === 0) return undefined;
  return births
    .map(
      (b) =>
        `${formatDate(b.birth_date)} — ${
          b.calf_sex === "macho" ? "macho" : b.calf_sex === "femea" ? "fêmea" : "sexo não informado"
        }${b.calf_tag ? ` (nº ${b.calf_tag})` : ""}`
    )
    .join("\n");
}

/** Tooltip nativo com os tratamentos e o remédio de cada um. */
function treatmentsTitle(ts: AnimalTreatment[]): string | undefined {
  if (ts.length === 0) return undefined;
  return ts
    .map(
      (t) =>
        `${formatDate(t.applied_at)} — ${t.description}${
          t.medicine ? ` — remédio: ${t.medicine}` : ""
        }${t.dose ? ` (${t.dose})` : ""}`
    )
    .join("\n");
}

// ── Campo de busca ──────────────────────────────────────────────────────────
function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-9 pr-10 h-11"
        autoComplete="off"
        enterKeyHint="search"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Limpar busca"
          className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ── Linha do registro de vacinação ──────────────────────────────────────────
/** Uma aplicação: o animal, a data e o que foi dado (vacina, ml e marca). */
function LogRow({
  tag,
  appliedAt,
  items,
  onOpen,
}: {
  tag: string;
  appliedAt: string;
  items: VaccinationRow[];
  onOpen: () => void;
}) {
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
      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-3 cursor-pointer transition-all active:scale-[0.98] active:bg-slate-50 dark:active:bg-slate-800/60 hover:border-produmar-200 dark:hover:border-produmar-800"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-base font-semibold text-slate-800 dark:text-slate-100 truncate">
          {tag}
        </p>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
            {formatDate(appliedAt)}
          </span>
          <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
        </div>
      </div>

      <ul className="mt-1.5 space-y-1">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-2 text-sm">
            <Syringe className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
            <span className="text-slate-700 dark:text-slate-200 truncate">
              {i.animal_vaccines?.name ?? "—"}
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums flex-shrink-0">
              {i.dose_ml ? formatMl(Number(i.dose_ml)) : "—"}
            </span>
            {i.brand && (
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate flex-shrink-0">
                {i.brand}
              </span>
            )}
          </li>
        ))}
      </ul>
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
      <p className="text-base text-slate-600 dark:text-slate-300">{text}</p>
      {hint && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
