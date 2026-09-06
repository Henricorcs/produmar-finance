"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Pencil, Trash2, X, Check, Tag } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, lowerKeepingCaret } from "@/lib/utils";
import { createBreed, renameBreed, deleteBreed } from "@/app/(app)/animais/actions";
import { ICON_BUTTON, SPECIES_META, SpeciesPicker, speciesOf } from "./animal-shared";
import type { AnimalBreed, AnimalSpecies } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  breeds: AnimalBreed[];
  /** Tipo do animal que abriu o cadastro — a lista já vem nele. */
  species?: AnimalSpecies;
}

/** Exemplo de raça de cada tipo (só o placeholder do campo). */
const BREED_PLACEHOLDER: Record<AnimalSpecies, string> = {
  bovino: "nome (ex: nelore, angus)",
  equino: "nome (ex: mangalarga, crioulo)",
  caprino: "nome (ex: boer, saanen)",
  ovino: "nome (ex: santa inês, dorper)",
  suino: "nome (ex: landrace, duroc)",
};

/** Mini-CRUD de raças (adicionar / renomear / remover), separado por tipo. */
export function AnimalBreedsDialog({ open, onClose, breeds, species = "bovino" }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  /** Tipo da raça sendo cadastrada — começa no tipo do animal. */
  const [formSpecies, setFormSpecies] = useState<AnimalSpecies>(species);

  /** Só as raças do tipo escolhido: nelore não some no meio das de ovino. */
  const speciesBreeds = breeds.filter((b) => speciesOf(b.species) === formSpecies);

  // abriu de novo → volta para o tipo do animal que está sendo cadastrado
  useEffect(() => {
    if (!open) return;
    setFormSpecies(species);
    reset();
  }, [open, species]);

  function reset() {
    setName("");
    setEditingId(null);
    setShowForm(false);
    setError(null);
  }

  function startEdit(t: AnimalBreed) {
    setEditingId(t.id);
    setName(t.name);
    setShowForm(true);
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Informe o nome da raça");
      return;
    }
    startTransition(async () => {
      const r = editingId
        ? await renameBreed(editingId, name)
        : await createBreed(name, formSpecies);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
        return;
      }
      reset();
    });
  }

  function handleDelete(t: AnimalBreed) {
    if (
      !confirm(`Remover a raça "${t.name}"? Os animais já cadastrados ficam sem raça.`)
    )
      return;
    startTransition(async () => {
      await deleteBreed(t.id);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Raças</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Cada tipo tem as suas raças — o seletor troca a lista */}
          <SpeciesPicker
            value={formSpecies}
            onChange={(v) => {
              setFormSpecies(v);
              setEditingId(null);
              setName("");
              setError(null);
            }}
          />

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {speciesBreeds.length === 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-3">
                Nenhuma raça de {SPECIES_META[formSpecies].label.toLowerCase()} cadastrada.
              </p>
            )}
            {speciesBreeds.map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-2.5">
                <div className="w-8 h-8 rounded-lg bg-produmar-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <Tag className="w-4 h-4 text-produmar-600 dark:text-produmar-400" />
                </div>
                <p className="flex-1 min-w-0 text-sm font-medium truncate text-slate-800 dark:text-slate-200">
                  {t.name}
                </p>
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
              Nova raça de {SPECIES_META[formSpecies].label.toLowerCase()}
            </Button>
          ) : (
            <form
              onSubmit={submit}
              className="space-y-2 p-3 rounded-xl bg-produmar-50/30 dark:bg-slate-800/40 border border-produmar-100 dark:border-slate-700"
            >
              <Input
                value={name}
                onChange={(e) => setName(lowerKeepingCaret(e))}
                autoCapitalize="none"
                placeholder={BREED_PLACEHOLDER[formSpecies]}
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
