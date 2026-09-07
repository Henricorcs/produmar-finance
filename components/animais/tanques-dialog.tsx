"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Pencil, Plus, Trash2, Waves, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, upperKeepingCaret } from "@/lib/utils";
import {
  createAnimalTanque,
  deleteAnimalTanque,
  updateAnimalTanque,
} from "@/app/(app)/animais/actions";
import {
  ICON_BUTTON,
  LOTE_SPECIES_OPTIONS,
  SPECIES_META,
  criacaoPorLote,
  localLabel,
  speciesOf,
} from "./animal-shared";
import type { AnimalSpecies, AnimalTanque } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  tanques: AnimalTanque[];
  /** Tipo que abriu o cadastro — a lista já vem nele. */
  species?: AnimalSpecies;
}

/**
 * Mini-CRUD dos TANQUES (galpões, no caso das aves).
 *
 * O tanque é o lugar e existe para sempre: ele atravessa vários ciclos. Por
 * isso não se apaga tanque que já teve ciclo — desativa, e o histórico fica.
 */
export function TanquesDialog({ open, onClose, tanques, species = "piscicultura" }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [formSpecies, setFormSpecies] = useState<AnimalSpecies>(
    criacaoPorLote(species) ? species : "piscicultura"
  );

  const daEspecie = tanques.filter((t) => speciesOf(t.species) === formSpecies);
  const palavra = localLabel(formSpecies);

  useEffect(() => {
    if (!open) return;
    setFormSpecies(criacaoPorLote(species) ? species : "piscicultura");
    reset();
  }, [open, species]);

  function reset() {
    setName("");
    setEditingId(null);
    setShowForm(false);
    setError(null);
  }

  function startEdit(t: AnimalTanque) {
    setEditingId(t.id);
    setName(t.name);
    setShowForm(true);
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError(`Dê um nome ao ${palavra.toLowerCase()}`);
      return;
    }
    startTransition(async () => {
      const input = { species: formSpecies, name, active: true };
      const r = editingId
        ? await updateAnimalTanque(editingId, input)
        : await createAnimalTanque(input);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
        return;
      }
      reset();
    });
  }

  function handleToggleAtivo(t: AnimalTanque) {
    setError(null);
    startTransition(async () => {
      const r = await updateAnimalTanque(t.id, {
        species: speciesOf(t.species),
        name: t.name,
        active: !t.active,
        notes: t.notes,
      });
      if (r && "error" in r) setError(r.error ?? "Erro ao salvar");
    });
  }

  function handleDelete(t: AnimalTanque) {
    if (!confirm(`Remover ${t.name}?`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteAnimalTanque(t.id);
      if (r && "error" in r) setError(r.error ?? "Erro ao remover");
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">{palavra}s</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Só peixe e ave têm tanque — e a escolha some quando só há uma */}
          {LOTE_SPECIES_OPTIONS.length > 1 && (
            <div className="grid grid-cols-2 gap-1.5">
              {LOTE_SPECIES_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    setFormSpecies(o.value);
                    reset();
                  }}
                  className={cn(
                    "min-h-[40px] rounded-lg border text-xs font-semibold transition-colors",
                    formSpecies === o.value
                      ? "bg-produmar-600 border-produmar-600 text-white"
                      : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                  )}
                >
                  {SPECIES_META[o.value].plural}
                </button>
              ))}
            </div>
          )}

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {daEspecie.length === 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-3">
                Nenhum {palavra.toLowerCase()} cadastrado.
              </p>
            )}
            {daEspecie.map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-2.5">
                <div className="w-8 h-8 rounded-lg bg-cyan-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <Waves className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleAtivo(t)}
                  disabled={isPending}
                  className="flex-1 min-w-0 text-left"
                  aria-label={t.active ? `Desativar ${t.name}` : `Ativar ${t.name}`}
                >
                  <p
                    className={cn(
                      "text-sm font-medium truncate",
                      t.active
                        ? "text-slate-800 dark:text-slate-200"
                        : "text-slate-400 line-through dark:text-slate-500"
                    )}
                  >
                    {t.name}
                  </p>
                  {!t.active && (
                    <p className="text-[10px] text-slate-400">
                      desativado — toque para ativar
                    </p>
                  )}
                </button>
                <button
                  aria-label={`Editar ${t.name}`}
                  onClick={() => startEdit(t)}
                  className={cn(ICON_BUTTON, "text-slate-400 hover:text-produmar-600")}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  aria-label={`Remover ${t.name}`}
                  onClick={() => handleDelete(t)}
                  disabled={isPending}
                  className={cn(ICON_BUTTON, "text-slate-400 hover:text-red-500 -mr-2")}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          {!showForm ? (
            <Button
              variant="outline"
              className="w-full h-11 sm:h-9 sm:text-xs"
              onClick={() => setShowForm(true)}
            >
              <Plus className="w-4 h-4" />
              Novo {palavra.toLowerCase()}
            </Button>
          ) : (
            <form
              onSubmit={submit}
              className="space-y-2 p-3 rounded-xl bg-produmar-50/30 dark:bg-slate-800/40 border border-produmar-100 dark:border-slate-700"
            >
              <Input
                value={name}
                onChange={(e) => setName(upperKeepingCaret(e))}
                autoCapitalize="characters"
                placeholder={`ex: ${palavra.toLowerCase()} 01`}
                className="h-11 sm:h-9 sm:text-sm"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 h-11 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 sm:h-9"
                >
                  <X className="w-3 h-3 inline mr-1" /> Cancelar
                </button>
                <Button type="submit" className="flex-1 h-11 sm:h-9 sm:text-xs" disabled={isPending}>
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
