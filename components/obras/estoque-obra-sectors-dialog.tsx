"use client";

import { useEffect, useState, useTransition } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { upperKeepingCaret } from "@/lib/utils";
import {
  createSupplyObraSector,
  deleteSupplyObraSector,
} from "@/app/(app)/almoxarifado/actions";
import type { SupplyObraSector, SupplyObraUsage } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  obras: SupplyObraUsage[];
  /** Setores de todas as obras — o diálogo filtra os da obra escolhida. */
  sectors: SupplyObraSector[];
  /** Obra já escolhida (veio do detalhe dela). */
  presetObraId?: string | null;
}

/**
 * Cadastro dos SETORES de cada obra — o subcadastro que o técnico escolhe em
 * "Setor aplicado". É aqui que o patrão diz quais são os lugares de uma obra
 * ("entrada", "galpão 2", "área externa") para o técnico só tocar, em vez de
 * cada um escrever de um jeito.
 *
 * Apagar um setor NÃO apaga os envios que já usaram ele: eles ficam sem setor.
 */
export function SupplyObraSectorsDialog({ open, onClose, obras, sectors, presetObraId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [obraId, setObraId] = useState("");
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) return;
    // com uma obra só, ela já entra escolhida — ninguém precisa selecionar
    setObraId(presetObraId ?? (obras.length === 1 ? obras[0].id : ""));
    setName("");
    setError(null);
  }, [open, presetObraId, obras]);

  const obraSectors = sectors.filter((s) => s.obra_id === obraId);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!obraId) {
      setError("Escolha a obra primeiro");
      return;
    }
    if (!name.trim()) {
      setError("Informe o nome do setor");
      return;
    }
    startTransition(async () => {
      const r = await createSupplyObraSector(obraId, name);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao cadastrar o setor");
        return;
      }
      setName("");
    });
  }

  function handleDelete(s: SupplyObraSector) {
    if (
      !confirm(
        `Apagar o setor "${s.name}"? Os envios que já usaram ele continuam guardados, só ficam sem setor.`
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const r = await deleteSupplyObraSector(s.id);
      if (r && "error" in r) setError(r.error ?? "Erro ao apagar o setor");
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-orange-50 text-orange-500 dark:bg-orange-900/30 dark:text-orange-400">
              <MapPin className="w-4 h-4" />
            </span>
            Setores da obra
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Obra *</Label>
            <SearchableSelect
              items={obras}
              value={obraId}
              onChange={(id) => {
                setObraId(id);
                setError(null);
              }}
              getId={(o) => o.id}
              getLabel={(o) => o.name}
              renderItem={(o) => (
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <span className="truncate">{o.name}</span>
                  {o.client && (
                    <span className="text-[10px] text-slate-400 flex-shrink-0 truncate max-w-[7rem]">
                      {o.client}
                    </span>
                  )}
                </div>
              )}
              placeholder="Toque para escolher a obra..."
              searchPlaceholder="Buscar obra..."
              emptyMessage="Nenhuma obra cadastrada"
            />
          </div>

          {obraId && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="sec_name">Novo setor</Label>
                <form onSubmit={handleAdd} className="flex gap-2">
                  <Input
                    id="sec_name"
                    value={name}
                    onChange={(e) => setName(upperKeepingCaret(e))}
                    placeholder="ex: entrada, galpão 2, área externa"
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
                  {obraSectors.length === 0
                    ? "Nenhum setor nesta obra ainda"
                    : obraSectors.length === 1
                      ? "1 setor cadastrado"
                      : `${obraSectors.length} setores cadastrados`}
                </p>
                {obraSectors.length > 0 && (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                    {obraSectors.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 px-3 py-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="flex-1 min-w-0 truncate text-sm text-slate-700 dark:text-slate-200">
                          {s.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDelete(s)}
                          disabled={isPending}
                          aria-label={`Apagar o setor ${s.name}`}
                          className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            É o que o técnico escolhe em &quot;Setor aplicado&quot; quando avisa o material
            que usou. Sem setor cadastrado ele escreve o lugar na mão.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
