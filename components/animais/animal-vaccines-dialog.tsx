"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, Check, Pencil, Plus, Syringe, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, lowerKeepingCaret, upperKeepingCaret } from "@/lib/utils";
import { createVaccine, updateVaccine, deleteVaccine } from "@/app/(app)/animais/actions";
import {
  ICON_BUTTON,
  SPECIES_META,
  SpeciesPicker,
  doseLabel,
  formatDecimalInput,
  parseDecimal,
  recurrenceLabel,
  speciesOf,
  vaccinesForSpecies,
  vaccinesHaveSpecies,
} from "./animal-shared";
import type { AnimalSpecies, AnimalVaccine } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  vaccines: AnimalVaccine[];
  /** Tipo de animal que abriu o cadastro — a lista já vem nele. */
  species?: AnimalSpecies;
}

/** Exemplo de vacina de cada tipo (só o placeholder do campo). */
const VACCINE_PLACEHOLDER: Record<AnimalSpecies, string> = {
  bovino: "ex: febre aftosa, brucelose",
  equino: "ex: influenza equina, tétano",
  caprino: "ex: clostridiose, raiva",
  ovino: "ex: clostridiose, raiva",
  suino: "ex: peste suína, erisipela",
  piscicultura: "ex: vacina para estreptococose",
  aves: "ex: newcastle, gumboro",
};

/** Periodicidades que cobrem quase tudo — o resto entra em "Outro". */
const RECURRENCE_CHIPS: { months: number | null; label: string }[] = [
  { months: null, label: "Dose única" },
  { months: 6, label: "6 meses" },
  { months: 12, label: "1 ano" },
];

/** Como a dose é calculada: sempre a mesma quantidade ou conforme o peso. */
type DoseMode = "fixa" | "peso";

/**
 * Cadastro das vacinas do rebanho, SEPARADO POR TIPO DE ANIMAL: aftosa é de
 * bovino, influenza equina é de cavalo, peste suína é de porco. O seletor de
 * cima troca a criação — a lista, o formulário e a planilha seguem ele.
 *
 * O formulário evita as duas armadilhas do cadastro antigo: a periodicidade
 * vira botão ("Dose única" em vez de "deixe o campo vazio") e a dose é uma
 * escolha entre quantidade fixa OU cálculo pelo peso — não dois campos
 * concorrentes que ninguém sabia qual valia.
 */
export function AnimalVaccinesDialog({ open, onClose, vaccines, species = "bovino" }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [formSpecies, setFormSpecies] = useState<AnimalSpecies>(species);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [recurrence, setRecurrence] = useState<number | null>(null);
  /** true = periodicidade digitada à mão (o campo "Outro" fica aberto). */
  const [customRecurrence, setCustomRecurrence] = useState(false);
  const [doseMode, setDoseMode] = useState<DoseMode>("fixa");
  const [doseMl, setDoseMl] = useState("");
  const [dosePerWeight, setDosePerWeight] = useState("");
  const [doseWeightKg, setDoseWeightKg] = useState("");
  const [brand, setBrand] = useState("");

  /** Só as vacinas deste tipo — aftosa não polui a lista do chiqueiro. */
  const speciesVaccines = vaccinesForSpecies(vaccines, formSpecies);
  /** Sem a migration 062 o cadastro ainda é um só para a fazenda inteira. */
  const separated = vaccinesHaveSpecies(vaccines);
  const speciesName = SPECIES_META[formSpecies].label.toLowerCase();

  // abriu de novo → volta para o tipo de quem chamou
  useEffect(() => {
    if (!open) return;
    setFormSpecies(species);
    reset();
  }, [open, species]);

  function reset() {
    setName("");
    setRecurrence(null);
    setCustomRecurrence(false);
    setDoseMode("fixa");
    setDoseMl("");
    setDosePerWeight("");
    setDoseWeightKg("");
    setBrand("");
    setEditingId(null);
    setShowForm(false);
    setError(null);
  }

  function startEdit(v: AnimalVaccine) {
    const months = v.recurrence_months ?? null;
    const byWeight = !!(v.dose_ml_per_weight && v.dose_weight_kg);
    setEditingId(v.id);
    // sem a migration 062 a vacina não tem tipo — editar não pode arrastar a
    // tela de volta para bovino, ela fica na criação que o dedo escolheu
    if (v.species) setFormSpecies(speciesOf(v.species));
    setName(v.name);
    setRecurrence(months);
    setCustomRecurrence(!!months && !RECURRENCE_CHIPS.some((c) => c.months === months));
    setDoseMode(byWeight ? "peso" : "fixa");
    setDoseMl(v.default_dose_ml ? String(v.default_dose_ml).replace(".", ",") : "");
    setDosePerWeight(
      v.dose_ml_per_weight ? String(v.dose_ml_per_weight).replace(".", ",") : ""
    );
    setDoseWeightKg(v.dose_weight_kg ? String(v.dose_weight_kg).replace(".", ",") : "");
    setBrand(v.default_brand ?? "");
    setShowForm(true);
    setError(null);
  }

  /** Trocar de criação limpa o formulário: a vacina é de um tipo só. */
  function pickSpecies(v: AnimalSpecies) {
    if (v === formSpecies) return;
    setFormSpecies(v);
    reset();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Informe o nome da vacina");
      return;
    }

    startTransition(async () => {
      const input = {
        name,
        species: formSpecies,
        recurrence_months: recurrence,
        // só a forma escolhida é gravada — a outra sai do cadastro
        default_dose_ml: doseMode === "fixa" ? parseDecimal(doseMl) : null,
        dose_ml_per_weight: doseMode === "peso" ? parseDecimal(dosePerWeight) : null,
        dose_weight_kg: doseMode === "peso" ? parseDecimal(doseWeightKg) : null,
        default_brand: brand,
      };
      const r = editingId ? await updateVaccine(editingId, input) : await createVaccine(input);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
        return;
      }
      reset();
    });
  }

  function handleDelete(v: AnimalVaccine) {
    if (
      !confirm(
        `Remover a vacina "${v.name}"? As aplicações já registradas nos animais também são apagadas.`
      )
    )
      return;
    startTransition(async () => {
      const r = await deleteVaccine(v.id);
      if (r && "error" in r) setError(r.error ?? "Erro ao remover");
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Vacinas do rebanho</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Cada criação tem as suas vacinas — o seletor troca a lista */}
          <SpeciesPicker value={formSpecies} onChange={pickSpecies} />

          <p className="text-xs text-slate-400 dark:text-slate-500">
            As vacinas de {speciesName} viram as colunas da planilha de todo{" "}
            {speciesName} do rebanho, com os ml que cada um tem que tomar.
          </p>

          {/* Sem a migration 062 o banco ainda não separa — avisa em vez de mentir */}
          {!separated && vaccines.length > 0 && (
            <p className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" />
              <span>
                Rode a <strong>migration 062</strong> no Supabase para separar as vacinas
                por tipo. Até lá o cadastro é um só para a fazenda inteira.
              </span>
            </p>
          )}

          {/* ── Lista ─────────────────────────────────────────────────── */}
          {speciesVaccines.length === 0 ? (
            <div className="flex flex-col items-center text-center gap-1 py-6 px-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
              <Syringe className="w-7 h-7 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Nenhuma vacina de {speciesName} cadastrada.
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Cadastre as que o veterinário manda dar — o sistema cuida de avisar
                quando cada animal está atrasado.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {speciesVaccines.map((v) => {
                const dose = doseLabel(v);
                return (
                  <div
                    key={v.id}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white pl-3 pr-1 py-2 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate text-slate-800 dark:text-slate-100">
                        {v.name}
                      </p>
                      {/* Um fato por etiqueta: quando repete, quanto dar, qual remédio */}
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        <Fact>{recurrenceLabel(v.recurrence_months)}</Fact>
                        {dose && <Fact tone="dose">{dose}</Fact>}
                        {v.default_brand && <Fact tone="brand">{v.default_brand}</Fact>}
                      </div>
                    </div>
                    <button
                      aria-label={`Editar ${v.name}`}
                      onClick={() => startEdit(v)}
                      className={cn(ICON_BUTTON, "text-slate-400 hover:text-produmar-600")}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      aria-label={`Remover ${v.name}`}
                      onClick={() => handleDelete(v)}
                      disabled={isPending}
                      className={cn(ICON_BUTTON, "text-slate-400 hover:text-red-500")}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          {/* ── Formulário ────────────────────────────────────────────── */}
          {!showForm ? (
            <Button
              variant="outline"
              className="w-full h-11 sm:h-10"
              onClick={() => {
                reset();
                setShowForm(true);
              }}
            >
              <Plus className="w-4 h-4" />
              Nova vacina de {speciesName}
            </Button>
          ) : (
            <form
              onSubmit={submit}
              className="space-y-3 p-3 rounded-xl bg-produmar-50/40 dark:bg-slate-800/40 border border-produmar-100 dark:border-slate-700"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-produmar-700 dark:text-produmar-400">
                {editingId ? "Editar vacina" : "Nova vacina"} de {speciesName}
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="vac_name">Nome da vacina *</Label>
                <Input
                  id="vac_name"
                  value={name}
                  onChange={(e) => setName(lowerKeepingCaret(e))}
                  autoCapitalize="none"
                  placeholder={VACCINE_PLACEHOLDER[formSpecies]}
                  className="h-11 sm:h-10"
                  autoFocus
                />
              </div>

              {/* Periodicidade em botão: ninguém tem que adivinhar que campo
                  vazio quer dizer dose única */}
              <div className="space-y-1.5">
                <Label>Quando repete</Label>
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {RECURRENCE_CHIPS.map((c) => (
                    <Chip
                      key={c.label}
                      active={!customRecurrence && recurrence === c.months}
                      onClick={() => {
                        setCustomRecurrence(false);
                        setRecurrence(c.months);
                      }}
                    >
                      {c.label}
                    </Chip>
                  ))}
                  <Chip active={customRecurrence} onClick={() => setCustomRecurrence(true)}>
                    Outro
                  </Chip>
                </div>
                {customRecurrence && (
                  <div className="flex items-center gap-2 pt-0.5">
                    <Input
                      value={recurrence ? String(recurrence) : ""}
                      onChange={(e) => {
                        const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                        setRecurrence(Number.isFinite(n) && n > 0 ? n : null);
                      }}
                      placeholder="ex: 4"
                      aria-label="Repete a cada quantos meses"
                      className="h-11 w-24 tabular-nums sm:h-10"
                      inputMode="numeric"
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      em quantos meses
                    </span>
                  </div>
                )}
              </div>

              {/* Dose: uma forma OU a outra — nunca as duas ao mesmo tempo */}
              <div className="space-y-1.5">
                <Label>Quanto aplicar</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  <Chip active={doseMode === "fixa"} onClick={() => setDoseMode("fixa")}>
                    Sempre igual
                  </Chip>
                  <Chip active={doseMode === "peso"} onClick={() => setDoseMode("peso")}>
                    Conforme o peso
                  </Chip>
                </div>

                {doseMode === "fixa" ? (
                  <div className="flex items-center gap-2 pt-0.5">
                    <Input
                      value={doseMl}
                      onChange={(e) => setDoseMl(formatDecimalInput(e.target.value))}
                      placeholder="ex: 5"
                      aria-label="Dose em ml"
                      className="h-11 w-24 tabular-nums sm:h-10"
                      inputMode="decimal"
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      ml em cada animal
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <Input
                      value={dosePerWeight}
                      onChange={(e) => setDosePerWeight(formatDecimalInput(e.target.value))}
                      placeholder="1"
                      aria-label="ml por peso"
                      className="h-11 flex-1 tabular-nums sm:h-10"
                      inputMode="decimal"
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                      ml a cada
                    </span>
                    <Input
                      value={doseWeightKg}
                      onChange={(e) => setDoseWeightKg(formatDecimalInput(e.target.value))}
                      placeholder="50"
                      aria-label="kg de peso"
                      className="h-11 flex-1 tabular-nums sm:h-10"
                      inputMode="decimal"
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400 flex-shrink-0">
                      kg
                    </span>
                  </div>
                )}
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  {doseMode === "fixa"
                    ? "A mesma quantidade para todo animal — é o que a planilha mostra na célula."
                    : "O sistema faz a conta pelo peso de cada animal e mostra os ml prontos."}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="vac_brand">Remédio (marca)</Label>
                <Input
                  id="vac_brand"
                  value={brand}
                  onChange={(e) => setBrand(upperKeepingCaret(e))}
                  placeholder="ex: zoetis, ourofino"
                  autoCapitalize="characters"
                  className="h-11 sm:h-10"
                />
              </div>

              <div className="flex gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 h-11 text-sm rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 sm:h-10"
                >
                  <X className="w-4 h-4 inline mr-1" /> Cancelar
                </button>
                <Button
                  type="submit"
                  className="flex-[2] h-11 sm:h-10"
                  disabled={isPending}
                >
                  <Check className="w-4 h-4" />
                  {editingId ? "Salvar" : "Adicionar"}
                </Button>
              </div>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Peças da tela ────────────────────────────────────────────────────────────

/** Etiqueta de um fato do cadastro (quando repete, quanto dar, qual remédio). */
function Fact({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "dose" | "brand";
}) {
  return (
    <span
      className={cn(
        "px-1.5 py-0.5 rounded-md text-[11px] font-medium leading-none",
        tone === "dose"
          ? "bg-produmar-50 text-produmar-700 dark:bg-produmar-950/50 dark:text-produmar-300"
          : tone === "brand"
            ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 uppercase"
            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
      )}
    >
      {children}
    </span>
  );
}

/** Botão de escolha do formulário (periodicidade, forma da dose). */
function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-[44px] px-1 text-xs rounded-lg border font-medium transition-colors active:scale-[0.97] sm:min-h-[40px]",
        active
          ? "bg-produmar-600 border-produmar-600 text-white"
          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800"
      )}
    >
      {children}
    </button>
  );
}
