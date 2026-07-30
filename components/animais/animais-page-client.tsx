"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Beef,
  ChevronRight,
  ImageIcon,
  Plus,
  Printer,
  Search,
  Settings2,
  Syringe,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getAnimalThumbnails } from "@/app/(app)/animais/actions";
import { AnimalDialog } from "./animal-dialog";
import { AnimalDetailDialog } from "./animal-detail-dialog";
import { VaccineProtocolDialog } from "./vaccine-protocol-dialog";
import { AnimalVaccinesDialog } from "./animal-vaccines-dialog";
import {
  CATEGORY_META,
  VACCINE_STATUS_META,
  categoryLabel,
  formatAge,
  formatMl,
  formatWeight,
  vaccineStatusFor,
} from "./animal-shared";
import type {
  AnimalBreed,
  AnimalCategory,
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
}

type Tab = "rebanho" | "vacinacao";
type CategoryFilter = "todos" | AnimalCategory;

export function AnimaisPageClient({ animals, breeds, vaccines, vaccinations }: Props) {
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

  // miniaturas das fotos principais (URLs assinadas)
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const photoKey = useMemo(
    () => animals.map((a) => a.photo_path).filter((p): p is string => !!p).join("|"),
    [animals]
  );
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
  const detailVaccinations = useMemo(
    () => (detailAnimalId ? vaccinations.filter((v) => v.animal_id === detailAnimalId) : []),
    [detailAnimalId, vaccinations]
  );

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

  // ── Filtro (compartilhado pelas duas abas) ──────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return animals.filter((a) => {
      if (categoryFilter !== "todos" && a.category !== categoryFilter) return false;
      if (onlyPending && a.vaccines_due === 0) return false;
      if (!q) return true;
      return a.tag.includes(q) || (a.breed_name ?? "").toUpperCase().includes(q);
    });
  }, [animals, search, categoryFilter, onlyPending]);

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
            Vacinação do rebanho e ficha para imprimir
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
                "relative flex flex-col items-center justify-center gap-1 min-h-[58px] px-1 rounded-xl border text-[11px] font-medium transition-colors active:scale-[0.97]",
                "sm:flex-row sm:min-h-0 sm:px-3 sm:py-2 sm:text-xs sm:gap-1.5",
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
                    "absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold flex items-center justify-center",
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

      {/* Ações da vacinação */}
      {tab === "vacinacao" && (
        <div className="flex gap-2">
          <Button className="flex-[2] h-11" onClick={() => openProtocol(null)}>
            <Syringe className="w-4 h-4" />
            Aplicar protocolo
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
      )}

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
                  "text-lg font-bold tabular-nums leading-none",
                  active
                    ? "text-produmar-700 dark:text-produmar-300"
                    : "text-slate-800 dark:text-slate-100"
                )}
              >
                {f.count}
              </span>
              <span
                className={cn(
                  "text-[10px] leading-tight",
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

      {/* Busca + só pendentes + imprimir */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pelo número ou raça..."
            className="pl-9 pr-10 h-11"
            autoComplete="off"
            enterKeyHint="search"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Limpar busca"
              className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOnlyPending((v) => !v)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-xl border text-xs font-medium transition-colors active:scale-[0.97]",
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
            className="flex-1 flex items-center justify-center gap-1.5 min-h-[44px] px-3 rounded-xl border border-produmar-200 bg-white text-xs font-medium text-produmar-700 dark:bg-slate-900 dark:border-slate-700 dark:text-produmar-400 transition-colors active:scale-[0.97]"
          >
            <Printer className="w-4 h-4" />
            Imprimir guia
          </button>
        </div>
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        animals.length === 0 ? (
          <EmptyState
            icon={Beef}
            text="Nenhum animal cadastrado ainda."
            hint="Cadastre o primeiro para controlar a vacinação."
            action={
              <Button onClick={openNewAnimal}>
                <Plus className="w-4 h-4" /> Novo animal
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Search}
            text={onlyPending ? "Ninguém com vacina pendente." : "Nada encontrado com esse filtro."}
          />
        )
      ) : tab === "rebanho" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
          {filtered.map((a) => (
            <AnimalCard
              key={a.id}
              animal={a}
              thumbUrl={a.photo_path ? thumbs[a.photo_path] ?? null : null}
              hasVaccines={vaccines.length > 0}
              onOpen={() => setDetailAnimalId(a.id)}
            />
          ))}
        </div>
      ) : vaccines.length === 0 ? (
        <EmptyState
          icon={Syringe}
          text="Nenhuma vacina cadastrada."
          hint="Cadastre as vacinas do rebanho para acompanhar quem está em dia."
          action={
            <Button onClick={() => setVaccinesOpen(true)}>
              <Plus className="w-4 h-4" /> Cadastrar vacina
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {[...filtered]
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
        onEdit={(a) => {
          setDetailAnimalId(null);
          openEdit(a);
        }}
        onVaccinate={(a, vaccineIds) => openProtocol(a, vaccineIds)}
      />
      <VaccineProtocolDialog
        open={protocolOpen}
        onClose={() => setProtocolOpen(false)}
        animals={animals}
        vaccines={vaccines}
        presetAnimalId={protocolPreset.animalId}
        presetVaccineIds={protocolPreset.vaccineIds}
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
      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 cursor-pointer transition-all active:scale-[0.98] active:bg-slate-50 dark:active:bg-slate-800/60 hover:shadow-md hover:border-produmar-200 dark:hover:border-produmar-800"
    >
      <div className="flex items-center gap-3">
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbUrl}
            alt={`Animal ${animal.tag}`}
            className="w-16 h-16 rounded-lg object-cover border border-slate-200 dark:border-slate-700 flex-shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center flex-shrink-0">
            <ImageIcon className="w-5 h-5 text-slate-300 dark:text-slate-600" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-base font-semibold text-slate-800 dark:text-slate-100 truncate">
              {animal.tag}
            </p>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${meta.chip}`}
            >
              {categoryLabel(animal.category, animal.sex)}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5 truncate">
            {animal.breed_name ?? "sem raça"} · {formatAge(animal.age_months)}
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
          </div>
        </div>

        <ChevronRight className="w-5 h-5 text-slate-300 dark:text-slate-600 flex-shrink-0" />
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
    return { vaccine: v, status, last };
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
      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-3 cursor-pointer transition-all active:scale-[0.98] active:bg-slate-50 dark:active:bg-slate-800/60 hover:border-produmar-200 dark:hover:border-produmar-800"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
          {animal.tag}
          <span className="text-[11px] text-slate-400 font-normal ml-1.5">
            {categoryLabel(animal.category, animal.sex)}
          </span>
        </p>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span
            className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
              animal.vaccines_due > 0
                ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
            )}
          >
            {animal.vaccines_due > 0 ? `${animal.vaccines_due} pendente(s)` : "Em dia"}
          </span>
          <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {rows.map(({ vaccine, status, last }) => (
          <span
            key={vaccine.id}
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${VACCINE_STATUS_META[status].chip}`}
          >
            {vaccine.name}
            {last?.dose_ml ? ` ${formatMl(Number(last.dose_ml))}` : ""}
          </span>
        ))}
      </div>
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
