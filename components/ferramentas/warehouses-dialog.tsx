"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2, X, Check, Warehouse } from "lucide-react";
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
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
} from "@/app/(app)/ferramentas/actions";
import type { ToolWarehouse } from "@/lib/types";
import { upperKeepingCaret } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  warehouses: ToolWarehouse[];
  /** Quantos itens estão guardados em cada almoxarifado (id → total). */
  countByWarehouse: Record<string, number>;
}

/**
 * Cadastro dos almoxarifados (garagem, depósito, barracão...). Apagar um
 * almoxarifado NÃO apaga o patrimônio: os itens ficam sem almoxarifado até
 * serem realocados.
 */
export function WarehousesDialog({ open, onClose, warehouses, countByWarehouse }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");

  function reset() {
    setName("");
    setLocation("");
    setEditingId(null);
    setShowForm(false);
    setError(null);
  }

  function startEdit(w: ToolWarehouse) {
    setEditingId(w.id);
    setName(w.name);
    setLocation(w.location ?? "");
    setShowForm(true);
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Informe o nome do almoxarifado");
      return;
    }
    startTransition(async () => {
      const input = { name, location };
      const r = editingId
        ? await updateWarehouse(editingId, input)
        : await createWarehouse(input);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
        return;
      }
      reset();
    });
  }

  function handleDelete(w: ToolWarehouse) {
    const count = countByWarehouse[w.id] ?? 0;
    const msg =
      count > 0
        ? `Remover o almoxarifado "${w.name}"? Os ${count} item(ns) guardados nele NÃO são apagados — ficam sem almoxarifado até você realocar.`
        : `Remover o almoxarifado "${w.name}"?`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      const r = await deleteWarehouse(w.id);
      if (r && "error" in r) alert(r.error);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Almoxarifados</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Onde o patrimônio fica guardado. Cada item pertence a um almoxarifado e a
            tela abre filtrada pelo que você escolher.
          </p>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {warehouses.length === 0 && (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-3">
                Nenhum almoxarifado cadastrado.
              </p>
            )}
            {warehouses.map((w) => (
              <div key={w.id} className="flex items-center gap-3 py-2.5">
                <div className="w-9 h-9 rounded-lg bg-produmar-50 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <Warehouse className="w-4 h-4 text-produmar-600 dark:text-produmar-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-slate-800 dark:text-slate-200">
                    {w.name}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {countByWarehouse[w.id] ?? 0} item(ns)
                    {w.location ? ` · ${w.location}` : ""}
                  </p>
                </div>
                <button
                  aria-label={`Editar ${w.name}`}
                  onClick={() => startEdit(w)}
                  className="w-11 h-11 flex items-center justify-center rounded-lg text-slate-400 hover:text-produmar-600 flex-shrink-0"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  aria-label={`Remover ${w.name}`}
                  onClick={() => handleDelete(w)}
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
              Novo almoxarifado
            </Button>
          ) : (
            <form
              onSubmit={submit}
              className="space-y-2 p-3 rounded-xl bg-produmar-50/30 dark:bg-slate-800/40 border border-produmar-100 dark:border-slate-700"
            >
              <div className="space-y-1">
                <Label htmlFor="wh_name" className="text-[11px]">
                  Nome *
                </Label>
                <Input
                  id="wh_name"
                  value={name}
                  onChange={(e) => setName(upperKeepingCaret(e))}
                  placeholder="ex: garagem, depósito, barracão"
                  autoCapitalize="characters"
                  className="h-11 sm:h-9 sm:text-sm"
                  autoFocus
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="wh_location" className="text-[11px]">
                  Onde fica (opcional)
                </Label>
                <Input
                  id="wh_location"
                  value={location}
                  onChange={(e) => setLocation(upperKeepingCaret(e))}
                  placeholder="ex: fazenda, sede"
                  autoCapitalize="characters"
                  className="h-11 sm:h-9 sm:text-sm"
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
                <Button
                  type="submit"
                  className="flex-1 h-11 sm:h-9 sm:text-xs"
                  disabled={isPending}
                >
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
