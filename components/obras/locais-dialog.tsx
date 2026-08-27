"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { MapPinned, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL, upperKeepingCaret } from "@/lib/utils";
import { num } from "@/components/almoxarifado/supply-shared";
import {
  createSupplyLocal,
  deleteSupplyLocal,
  updateSupplyLocal,
} from "@/app/(app)/almoxarifado/actions";
import type { SupplyLocal, SupplyObraUsage } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  locais: SupplyLocal[];
  /** As obras, só para mostrar quantas e quanto já custaram em cada local. */
  obras: SupplyObraUsage[];
}

/**
 * Cadastro dos LOCAIS — onde as obras acontecem: Fazenda 01, Fazenda 02, Sítio.
 * É livre de propósito: o dono cria quantos quiser, na hora que precisar.
 *
 * O local existe para juntar as obras de um mesmo lugar. Antes o lugar ficava
 * grudado no nome da obra ("CERCAS FAZENDA 01") e não dava para somar o gasto
 * da fazenda inteira.
 *
 * Apagar um local NÃO apaga as obras dele: elas só ficam sem local.
 */
export function LocaisDialog({ open, onClose, locais, obras }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  /** Local em renomeação — null quando ninguém está sendo editado. */
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setEditId(null);
    setEditName("");
    setError(null);
  }, [open]);

  /** Quantas obras e quanto de gasto cada local já acumula. */
  const totals = useMemo(() => {
    const map = new Map<string, { obras: number; custo: number }>();
    for (const o of obras) {
      if (!o.local_id) continue;
      const cur = map.get(o.local_id) ?? { obras: 0, custo: 0 };
      cur.obras += 1;
      cur.custo += num(o.total_cost ?? o.total_value);
      map.set(o.local_id, cur);
    }
    return map;
  }, [obras]);

  const semLocal = useMemo(() => obras.filter((o) => !o.local_id).length, [obras]);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Informe o nome do local");
      return;
    }
    startTransition(async () => {
      const r = await createSupplyLocal(name);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao cadastrar o local");
        return;
      }
      setName("");
    });
  }

  function handleRename(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const id = editId;
    if (!id || !editName.trim()) return;
    startTransition(async () => {
      const r = await updateSupplyLocal(id, editName);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao renomear o local");
        return;
      }
      setEditId(null);
      setEditName("");
    });
  }

  function handleDelete(l: SupplyLocal) {
    const t = totals.get(l.id);
    const aviso = t
      ? `\n\n${t.obras === 1 ? "1 obra usa" : `${t.obras} obras usam`} este local — ${
          t.obras === 1 ? "ela continua" : "elas continuam"
        } guardada${t.obras === 1 ? "" : "s"}, só fica${t.obras === 1 ? "" : "m"} sem local.`
      : "";
    if (!confirm(`Apagar o local "${l.name}"?${aviso}`)) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteSupplyLocal(l.id);
      if (r && "error" in r) setError(r.error ?? "Erro ao apagar o local");
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400">
              <MapPinned className="w-4 h-4" />
            </span>
            Locais
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="loc_name">Novo local</Label>
            <form onSubmit={handleAdd} className="flex gap-2">
              <Input
                id="loc_name"
                value={name}
                onChange={(e) => setName(upperKeepingCaret(e))}
                placeholder="ex: fazenda 01, sítio, chácara"
                className="uppercase placeholder:normal-case placeholder:lowercase"
                autoComplete="off"
              />
              <Button type="submit" disabled={isPending || !name.trim()}>
                <Plus className="w-4 h-4" />
              </Button>
            </form>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {locais.length === 0
                ? "Nenhum local cadastrado ainda"
                : locais.length === 1
                  ? "1 local cadastrado"
                  : `${locais.length} locais cadastrados`}
            </p>

            {locais.length > 0 && (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                {locais.map((l) => {
                  const t = totals.get(l.id);
                  const emEdicao = editId === l.id;
                  return (
                    <div key={l.id} className="px-3 py-2">
                      {emEdicao ? (
                        <form onSubmit={handleRename} className="flex gap-2">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(upperKeepingCaret(e))}
                            className="uppercase h-9"
                            autoComplete="off"
                            autoFocus
                          />
                          <Button type="submit" size="sm" disabled={isPending}>
                            Salvar
                          </Button>
                          <button
                            type="button"
                            onClick={() => setEditId(null)}
                            aria-label="Cancelar"
                            className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-700 dark:text-slate-200 truncate">
                              {l.name}
                            </p>
                            <p className="text-[11px] text-slate-400 tabular-nums">
                              {t
                                ? `${t.obras} ${t.obras === 1 ? "obra" : "obras"} · ${formatBRL(t.custo)}`
                                : "sem obra ainda"}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditId(l.id);
                              setEditName(l.name);
                              setError(null);
                            }}
                            disabled={isPending}
                            aria-label={`Renomear o local ${l.name}`}
                            className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-produmar-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(l)}
                            disabled={isPending}
                            aria-label={`Apagar o local ${l.name}`}
                            className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {semLocal > 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                {semLocal === 1
                  ? "1 obra ainda está sem local."
                  : `${semLocal} obras ainda estão sem local.`}{" "}
                Edite a obra para escolher onde ela fica.
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            O local é a fazenda, o sítio ou a chácara onde a obra acontece. Uma mesma
            fazenda pode ter várias obras — é assim que o sistema soma quanto você já
            gastou no lugar inteiro.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
