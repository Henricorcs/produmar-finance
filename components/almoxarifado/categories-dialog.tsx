"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, X, Check, Tag } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createSupplyCategory,
  renameSupplyCategory,
  deleteSupplyCategory,
} from "@/app/(app)/almoxarifado/actions";
import type { SupplyCategory } from "@/lib/types";
import { upperKeepingCaret } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  categories: SupplyCategory[];
  /** Quantos itens em cada categoria (id → total). */
  countByCategory: Record<string, number>;
}

/**
 * Cadastro das categorias (hidráulica, elétrica, colas...). Apagar uma
 * categoria NÃO apaga os itens: eles ficam sem categoria.
 */
export function CategoriesDialog({ open, onClose, categories, countByCategory }: Props) {
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

  function startEdit(c: SupplyCategory) {
    setEditingId(c.id);
    setName(c.name);
    setShowForm(true);
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Informe o nome da categoria");
      return;
    }
    startTransition(async () => {
      const r = editingId
        ? await renameSupplyCategory(editingId, name)
        : await createSupplyCategory(name);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
        return;
      }
      reset();
    });
  }

  function handleDelete(c: SupplyCategory) {
    const count = countByCategory[c.id] ?? 0;
    const msg =
      count > 0
        ? `Remover a categoria "${c.name}"? Os ${count} item(ns) dela NÃO são apagados — ficam sem categoria.`
        : `Remover a categoria "${c.name}"?`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      const r = await deleteSupplyCategory(c.id);
      if (r && "error" in r) alert(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Categorias</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {categories.length === 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-3">
                Nenhuma categoria cadastrada. O item pode ficar sem categoria.
              </p>
            )}
            {categories.map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-2.5">
                <div className="w-9 h-9 rounded-lg bg-sky-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <Tag className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-slate-800 dark:text-slate-200">
                    {c.name}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {countByCategory[c.id] ?? 0} item(ns)
                  </p>
                </div>
                <button
                  aria-label={`Editar ${c.name}`}
                  onClick={() => startEdit(c)}
                  className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-400 hover:text-produmar-600 flex-shrink-0"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  aria-label={`Remover ${c.name}`}
                  onClick={() => handleDelete(c)}
                  disabled={isPending}
                  className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 flex-shrink-0 -mr-2"
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
              Nova categoria
            </Button>
          ) : (
            <form
              onSubmit={submit}
              className="space-y-2 p-3 rounded-xl bg-produmar-50/30 dark:bg-slate-800/40 border border-produmar-100 dark:border-slate-700"
            >
              <div className="space-y-1">
                <Label htmlFor="sc_name" className="text-[11px]">
                  Nome *
                </Label>
                <Input
                  id="sc_name"
                  value={name}
                  onChange={(e) => setName(upperKeepingCaret(e))}
                  placeholder="ex: hidráulica, elétrica, colas"
                  className="h-11 uppercase placeholder:normal-case placeholder:lowercase sm:h-9 sm:text-sm"
                  autoFocus
                  autoComplete="off"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 h-11 text-xs rounded-lg sm:h-9 border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <X className="w-3 h-3 inline mr-1" /> Cancelar
                </button>
                <Button type="submit" className="flex-1 h-11 sm:h-9 sm:text-xs" disabled={isPending}>
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
