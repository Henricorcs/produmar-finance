"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, X, Check, Syringe } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createVaccine, updateVaccine, deleteVaccine } from "@/app/(app)/animais/actions";
import type { AnimalVaccine } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  vaccines: AnimalVaccine[];
}

/** Cadastro das vacinas do rebanho — nome + de quantos em quantos meses repete. */
export function AnimalVaccinesDialog({ open, onClose, vaccines }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [recurrence, setRecurrence] = useState("");

  function reset() {
    setName("");
    setRecurrence("");
    setEditingId(null);
    setShowForm(false);
    setError(null);
  }

  function startEdit(v: AnimalVaccine) {
    setEditingId(v.id);
    setName(v.name);
    setRecurrence(v.recurrence_months ? String(v.recurrence_months) : "");
    setShowForm(true);
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Informe o nome da vacina");
      return;
    }
    const months = recurrence.trim() ? Math.max(0, Math.floor(Number(recurrence) || 0)) : null;

    startTransition(async () => {
      const input = { name, recurrence_months: months };
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
      await deleteVaccine(v.id);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Vacinas cadastradas</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Toda vacina cadastrada aqui aparece na ficha de cada animal, mostrando se
            está em dia ou atrasada.
          </p>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {vaccines.length === 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-3">
                Nenhuma vacina cadastrada.
              </p>
            )}
            {vaccines.map((v) => (
              <div key={v.id} className="flex items-center gap-3 py-2.5">
                <div className="w-8 h-8 rounded-lg bg-produmar-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <Syringe className="w-4 h-4 text-produmar-600 dark:text-produmar-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-slate-800 dark:text-slate-200">
                    {v.name}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {v.recurrence_months
                      ? `repete a cada ${v.recurrence_months} ${
                          v.recurrence_months === 1 ? "mês" : "meses"
                        }`
                      : "dose única"}
                  </p>
                </div>
                <button
                  onClick={() => startEdit(v)}
                  className="p-1 text-slate-400 hover:text-produmar-600"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(v)}
                  disabled={isPending}
                  className="p-1 text-slate-400 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
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
              size="sm"
              className="w-full"
              onClick={() => setShowForm(true)}
            >
              <Plus className="w-4 h-4" />
              Nova vacina
            </Button>
          ) : (
            <form
              onSubmit={submit}
              className="space-y-2 p-3 rounded-xl bg-produmar-50/30 dark:bg-slate-800/40 border border-produmar-100 dark:border-slate-700"
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase())}
                placeholder="nome (ex: febre aftosa)"
                className="h-9 text-sm"
                autoFocus
              />
              <div className="space-y-1">
                <Label htmlFor="vaccine_recurrence" className="text-[11px]">
                  Repete a cada (meses) — vazio = dose única
                </Label>
                <Input
                  id="vaccine_recurrence"
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value.replace(/\D/g, ""))}
                  placeholder="ex: 6"
                  className="h-9 text-sm tabular-nums"
                  inputMode="numeric"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 h-9 text-xs rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50"
                >
                  <X className="w-3 h-3 inline mr-1" /> Cancelar
                </button>
                <Button type="submit" size="sm" className="flex-1" disabled={isPending}>
                  <Check className="w-3 h-3" />
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
