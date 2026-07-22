"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, X, Check, Ruler } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createToolUnit,
  renameToolUnit,
  deleteToolUnit,
} from "@/app/(app)/ferramentas/actions";
import type { ToolUnit } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  units: ToolUnit[];
}

/** Mini-CRUD de tipos de unidade (adicionar / renomear / remover). */
export function ToolUnitsDialog({ open, onClose, units }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");

  function reset() {
    setName("");
    setEditingId(null);
    setShowForm(false);
    setError(null);
  }

  function startEdit(u: ToolUnit) {
    setEditingId(u.id);
    setName(u.name);
    setShowForm(true);
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Informe o nome da unidade");
      return;
    }
    startTransition(async () => {
      const r = editingId
        ? await renameToolUnit(editingId, name)
        : await createToolUnit(name);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
        return;
      }
      reset();
    });
  }

  function handleDelete(u: ToolUnit) {
    if (!confirm(`Remover a unidade "${u.name}"? Itens já cadastrados com ela não são afetados.`))
      return;
    startTransition(async () => {
      await deleteToolUnit(u.id);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Tipos de unidade</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {units.length === 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-3">
                Nenhuma unidade cadastrada.
              </p>
            )}
            {units.map((u) => (
              <div key={u.id} className="flex items-center gap-3 py-2.5">
                <div className="w-8 h-8 rounded-lg bg-produmar-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <Ruler className="w-4 h-4 text-produmar-600 dark:text-produmar-400" />
                </div>
                <p className="flex-1 min-w-0 text-sm font-medium truncate text-slate-800 dark:text-slate-200">
                  {u.name}
                </p>
                <button
                  onClick={() => startEdit(u)}
                  className="p-1 text-slate-400 hover:text-produmar-600"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(u)}
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
              Nova unidade
            </Button>
          ) : (
            <form
              onSubmit={submit}
              className="space-y-2 p-3 rounded-xl bg-produmar-50/30 dark:bg-slate-800/40 border border-produmar-100 dark:border-slate-700"
            >
              <Input
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase())}
                placeholder="nome (ex: rolo, saco)"
                className="h-9 text-sm"
                autoFocus
              />
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
