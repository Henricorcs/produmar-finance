"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Pencil, Pill, Plus, Trash2, X } from "lucide-react";
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
import { cn, upperKeepingCaret } from "@/lib/utils";
import {
  createMedicamento,
  deleteMedicamento,
  deleteProtocolo,
  saveProtocolo,
  updateMedicamento,
} from "@/app/(app)/animais/actions";
import {
  FOOTER_CANCEL,
  FOOTER_SUBMIT,
  ICON_BUTTON,
  PARTO_SPECIES_OPTIONS,
  SPECIES_META,
  STICKY_FOOTER,
  doseLabel,
  formatDecimalInput,
  parseDecimal,
  useSpeciesOptions,
} from "./animal-shared";
import type {
  AnimalMedicamento,
  AnimalProtocolo,
  AnimalProtocoloItem,
  AnimalSpecies,
} from "@/lib/types";

// ── Peças comuns ─────────────────────────────────────────────────────────────

/** Botão de escolha (forma da dose, tipo do bicho). */
export function Chip({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-[44px] px-2 text-xs rounded-lg border font-medium transition-colors active:scale-[0.97] sm:min-h-[40px]",
        active
          ? "bg-produmar-600 border-produmar-600 text-white"
          : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800",
        className
      )}
    >
      {children}
    </button>
  );
}

/** Só os bichos de brinco: peixe e ave não recebem dose um a um. */
export function SpeciesChips({
  value,
  onChange,
}: {
  value: AnimalSpecies;
  onChange: (v: AnimalSpecies) => void;
}) {
  // Vaqueiro nível 01 (146): só bovino — com um tipo só não há o que escolher
  const opcoes = useSpeciesOptions(PARTO_SPECIES_OPTIONS);
  if (opcoes.length <= 1) return null;
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
      {opcoes.map((o) => (
        <Chip key={o.value} active={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

/** "Início" para o dia 0, "Dia 30" para o resto. */
export function diaLabel(dia: number): string {
  return dia === 0 ? "Início" : `Dia ${dia}`;
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
      {children}
    </p>
  );
}

// ── Cadastro de medicamentos ─────────────────────────────────────────────────

type DoseMode = "fixa" | "peso";

/**
 * Os medicamentos do rebanho, por tipo de bicho, com a regra da bula: sempre a
 * mesma quantidade ou "tantos ml a cada tantos kg". É essa regra que faz a
 * conta de cada animal na lista do curral.
 */
export function MedicamentosDialog({
  open,
  onClose,
  medicamentos,
  species = "bovino",
}: {
  open: boolean;
  onClose: () => void;
  medicamentos: AnimalMedicamento[];
  species?: AnimalSpecies;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [formSpecies, setFormSpecies] = useState<AnimalSpecies>(species);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [doseMode, setDoseMode] = useState<DoseMode>("peso");
  const [doseMl, setDoseMl] = useState("");
  const [dosePerWeight, setDosePerWeight] = useState("");
  const [doseWeightKg, setDoseWeightKg] = useState("");

  const lista = medicamentos.filter((m) => m.species === formSpecies);
  const speciesName = SPECIES_META[formSpecies].label.toLowerCase();

  useEffect(() => {
    if (!open) return;
    setFormSpecies(species);
    reset();
  }, [open, species]);

  function reset() {
    setName("");
    setDoseMode("peso");
    setDoseMl("");
    setDosePerWeight("");
    setDoseWeightKg("");
    setEditingId(null);
    setShowForm(false);
    setError(null);
  }

  function startEdit(m: AnimalMedicamento) {
    const byWeight = !!(m.dose_ml_per_weight && m.dose_weight_kg);
    setEditingId(m.id);
    setName(m.name);
    setDoseMode(byWeight ? "peso" : "fixa");
    setDoseMl(m.default_dose_ml ? String(m.default_dose_ml).replace(".", ",") : "");
    setDosePerWeight(m.dose_ml_per_weight ? String(m.dose_ml_per_weight).replace(".", ",") : "");
    setDoseWeightKg(m.dose_weight_kg ? String(m.dose_weight_kg).replace(".", ",") : "");
    setShowForm(true);
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Informe o nome do medicamento");

    startTransition(async () => {
      const input = {
        species: formSpecies,
        name,
        // só a forma escolhida é gravada — a outra sai do cadastro
        default_dose_ml: doseMode === "fixa" ? parseDecimal(doseMl) : null,
        dose_ml_per_weight: doseMode === "peso" ? parseDecimal(dosePerWeight) : null,
        dose_weight_kg: doseMode === "peso" ? parseDecimal(doseWeightKg) : null,
      };
      const r = editingId
        ? await updateMedicamento(editingId, input)
        : await createMedicamento(input);
      if (r && "error" in r) return setError(r.error ?? "Erro ao salvar");
      reset();
    });
  }

  function handleDelete(m: AnimalMedicamento) {
    if (
      !confirm(
        `Remover "${m.name}"? Ele sai dos protocolos em que estiver. O que já foi aplicado continua na ficha dos animais.`
      )
    )
      return;
    startTransition(async () => {
      const r = await deleteMedicamento(m.id);
      if (r && "error" in r) setError(r.error ?? "Erro ao remover");
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Medicamentos</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <SpeciesChips
            value={formSpecies}
            onChange={(v) => {
              setFormSpecies(v);
              reset();
            }}
          />

          {lista.length === 0 ? (
            <div className="flex flex-col items-center text-center gap-1 py-6 px-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
              <Pill className="w-7 h-7 text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Nenhum medicamento de {speciesName} cadastrado.
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Cadastre com a dose da bula — o sistema faz a conta de cada animal.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {lista.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white pl-3 pr-1 py-2 dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate text-slate-800 dark:text-slate-100">
                      {m.name}
                    </p>
                    <p className="text-[11px] text-produmar-700 dark:text-produmar-300 mt-0.5">
                      {doseLabel(m) ?? "sem dose"}
                    </p>
                  </div>
                  <button
                    aria-label={`Editar ${m.name}`}
                    onClick={() => startEdit(m)}
                    className={cn(ICON_BUTTON, "text-slate-400 hover:text-produmar-600")}
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    aria-label={`Remover ${m.name}`}
                    onClick={() => handleDelete(m)}
                    disabled={isPending}
                    className={cn(ICON_BUTTON, "text-slate-400 hover:text-red-500")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <ErrorBox>{error}</ErrorBox>}

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
              Novo medicamento de {speciesName}
            </Button>
          ) : (
            <form
              onSubmit={submit}
              className="space-y-3 p-3 rounded-xl bg-produmar-50/40 dark:bg-slate-800/40 border border-produmar-100 dark:border-slate-700"
            >
              <div className="space-y-1.5">
                <Label htmlFor="med_name">Nome *</Label>
                <Input
                  id="med_name"
                  value={name}
                  onChange={(e) => setName(upperKeepingCaret(e))}
                  autoCapitalize="characters"
                  placeholder="ex: IVERMECTINA 1%"
                  className="h-11 sm:h-10"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label>Quanto aplicar</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  <Chip active={doseMode === "peso"} onClick={() => setDoseMode("peso")}>
                    Conforme o peso
                  </Chip>
                  <Chip active={doseMode === "fixa"} onClick={() => setDoseMode("fixa")}>
                    Sempre igual
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
              </div>

              <div className="flex gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 h-11 text-sm rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 sm:h-10"
                >
                  <X className="w-4 h-4 inline mr-1" /> Cancelar
                </button>
                <Button type="submit" className="flex-[2] h-11 sm:h-10" disabled={isPending}>
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

// ── O protocolo (modelo) ─────────────────────────────────────────────────────

type Linha = { key: string; dia: string; medicamento_id: string };

let seq = 0;
const novaLinha = (dia = "0", medicamento_id = ""): Linha => ({
  key: `l${++seq}`,
  dia,
  medicamento_id,
});

/**
 * Monta a receita: cada linha é um medicamento e o dia em que ele entra,
 * contado do início. "0" é no dia; "30" é um mês depois. O mesmo remédio pode
 * aparecer em dias diferentes (a dose e o reforço).
 */
export function ProtocoloModeloDialog({
  open,
  onClose,
  protocolo,
  itens,
  medicamentos,
  species = "bovino",
  onAbrirMedicamentos,
}: {
  open: boolean;
  onClose: () => void;
  /** null = protocolo novo. */
  protocolo: AnimalProtocolo | null;
  itens: AnimalProtocoloItem[];
  medicamentos: AnimalMedicamento[];
  species?: AnimalSpecies;
  onAbrirMedicamentos: (species: AnimalSpecies) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [formSpecies, setFormSpecies] = useState<AnimalSpecies>(species);
  const [name, setName] = useState("");
  const [linhas, setLinhas] = useState<Linha[]>([]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (protocolo) {
      setFormSpecies(protocolo.species);
      setName(protocolo.name);
      const doModelo = itens
        .filter((i) => i.protocolo_id === protocolo.id)
        .sort((a, b) => a.dia - b.dia || a.sort_order - b.sort_order)
        .map((i) => novaLinha(String(i.dia), i.medicamento_id));
      setLinhas(doModelo.length ? doModelo : [novaLinha()]);
    } else {
      setFormSpecies(species);
      setName("");
      setLinhas([novaLinha()]);
    }
  }, [open, protocolo, itens, species]);

  const meds = useMemo(
    () =>
      medicamentos
        .filter((m) => m.species === formSpecies)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [medicamentos, formSpecies]
  );

  function mudar(key: string, campo: "dia" | "medicamento_id", valor: string) {
    setLinhas((prev) => prev.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await saveProtocolo(protocolo?.id ?? null, {
        species: formSpecies,
        name,
        itens: linhas
          .filter((l) => l.medicamento_id)
          .map((l) => ({ medicamento_id: l.medicamento_id, dia: parseInt(l.dia || "0", 10) || 0 })),
      });
      if (r && "error" in r) return setError(r.error ?? "Erro ao salvar");
      onClose();
    });
  }

  function handleDelete() {
    if (!protocolo) return;
    if (
      !confirm(
        `Apagar o protocolo "${protocolo.name}"? O que já foi programado com ele continua.`
      )
    )
      return;
    startTransition(async () => {
      const r = await deleteProtocolo(protocolo.id);
      if (r && "error" in r) return setError(r.error ?? "Erro ao apagar");
      onClose();
    });
  }

  const ultimoDia = linhas[linhas.length - 1]?.dia ?? "0";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">
            {protocolo ? "Editar protocolo" : "Novo protocolo"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="prot_name">Nome *</Label>
            <Input
              id="prot_name"
              value={name}
              onChange={(e) => setName(upperKeepingCaret(e))}
              autoCapitalize="characters"
              placeholder="ex: DESMAMA, ENTRADA NO CONFINAMENTO"
              className="h-11 sm:h-10"
            />
          </div>

          {!protocolo && (
            <div className="space-y-1.5">
              <Label>Para qual animal</Label>
              <SpeciesChips
                value={formSpecies}
                onChange={(v) => {
                  setFormSpecies(v);
                  setLinhas([novaLinha()]);
                }}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Medicamentos e em que dia</Label>
            {meds.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 px-3 py-3 text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
                <p>
                  Nenhum medicamento de {SPECIES_META[formSpecies].label.toLowerCase()}{" "}
                  cadastrado ainda.
                </p>
                <button
                  type="button"
                  onClick={() => onAbrirMedicamentos(formSpecies)}
                  className="font-semibold text-produmar-700 dark:text-produmar-400 hover:underline"
                >
                  Cadastrar medicamentos
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  {linhas.map((l) => (
                    <div key={l.key} className="flex items-center gap-1.5">
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">Dia</span>
                        <Input
                          value={l.dia}
                          onChange={(e) => mudar(l.key, "dia", e.target.value.replace(/\D/g, ""))}
                          inputMode="numeric"
                          maxLength={3}
                          semDitado
                          placeholder="0"
                          aria-label="Dia contado do início"
                          className="h-11 w-16 px-1 tabular-nums text-center font-semibold sm:h-10"
                        />
                      </div>
                      <select
                        value={l.medicamento_id}
                        onChange={(e) => mudar(l.key, "medicamento_id", e.target.value)}
                        aria-label="Medicamento"
                        className="flex-1 min-w-0 h-11 sm:h-10 rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <option value="">Escolha…</option>
                        {meds.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} — {doseLabel(m)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        aria-label="Tirar esta linha"
                        onClick={() =>
                          setLinhas((prev) =>
                            prev.length > 1 ? prev.filter((x) => x.key !== l.key) : prev
                          )
                        }
                        className={cn(ICON_BUTTON, "text-slate-400 hover:text-red-500")}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    onClick={() => setLinhas((prev) => [...prev, novaLinha(ultimoDia)])}
                  >
                    <Plus className="w-4 h-4" />
                    Medicamento
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    onClick={() =>
                      setLinhas((prev) => [
                        ...prev,
                        novaLinha(String((parseInt(ultimoDia || "0", 10) || 0) + 30)),
                      ])
                    }
                  >
                    <Plus className="w-4 h-4" />
                    Etapa +30 dias
                  </Button>
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Dia 0 é o dia em que começa; 30 é um mês depois. Os ml de cada animal saem
                  do peso dele e da dose do medicamento.
                </p>
              </>
            )}
          </div>

          {error && <ErrorBox>{error}</ErrorBox>}

          <DialogFooter className={STICKY_FOOTER}>
            {protocolo && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                aria-label="Apagar protocolo"
                className="h-11 sm:h-10 px-3 rounded-md border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30 mr-auto"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isPending}
              className={FOOTER_CANCEL}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || meds.length === 0} className={FOOTER_SUBMIT}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
