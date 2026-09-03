"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  createSupplyLocal,
  createSupplyObra,
  updateSupplyObra,
} from "@/app/(app)/almoxarifado/actions";
import type { SupplyLocal, SupplyObra } from "@/lib/types";
import { upperKeepingCaret } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Obra em edição — null cria uma nova. */
  obra: SupplyObra | null;
  /** Locais já cadastrados (migration 066). Dá para criar um novo aqui mesmo. */
  locais?: SupplyLocal[];
  /** Avisa quem abriu qual obra acabou de nascer (ex.: pra já selecionar). */
  onCreated?: (obraId: string) => void;
}

/**
 * Cadastro da OBRA DO ESTOQUE (tabela supply_obras) — a lista que diz quanto de
 * material cada obra consumiu. Mora aqui, no módulo Obras, mas segue sendo uma
 * lista à parte das obras de public.obras (essas são a aba "Obras").
 *
 * O Estoque também usa este diálogo: ao lançar uma saída dá para cadastrar a
 * obra na hora, sem sair do lançamento.
 */
export function SupplyObraDialog({ open, onClose, obra, locais = [], onCreated }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [notes, setNotes] = useState("");
  const [localId, setLocalId] = useState("");

  /** Cadastro de local sem sair daqui: o campo aparece e some no mesmo lugar. */
  const [novoLocal, setNovoLocal] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(obra?.name ?? "");
    setClient(obra?.client ?? "");
    setNotes(obra?.notes ?? "");
    setLocalId(obra?.local_id ?? "");
    setNovoLocal(null);
    setError(null);
  }, [open, obra]);

  /** Cria o local e já o deixa escolhido — sem perder o que foi digitado. */
  function handleCriarLocal() {
    const nome = (novoLocal ?? "").trim();
    if (!nome) return;
    setError(null);
    startTransition(async () => {
      const r = await createSupplyLocal(nome);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao cadastrar o local");
        return;
      }
      const id = (r as { localId?: string }).localId;
      if (id) setLocalId(id);
      setNovoLocal(null);
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Informe o nome da obra");
      return;
    }

    startTransition(async () => {
      const input = { name, client, notes, local_id: localId || null };
      const r = obra ? await updateSupplyObra(obra.id, input) : await createSupplyObra(input);
      if (r && "error" in r) {
        setError(r.error ?? "Erro ao salvar");
        return;
      }
      const obraId = (r as { obraId?: string }).obraId;
      if (!obra && obraId) onCreated?.(obraId);
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">
            {obra ? "Editar obra" : "Nova obra"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="so_name">Nome *</Label>
            <Input
              id="so_name"
              value={name}
              onChange={(e) => setName(upperKeepingCaret(e))}
              placeholder="ex: rede rua das flores"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Setor</Label>
            {novoLocal === null ? (
              <SearchableSelect
                items={locais}
                value={localId}
                onChange={setLocalId}
                getId={(l) => l.id}
                getLabel={(l) => l.name}
                placeholder="Onde fica esta obra..."
                searchPlaceholder="Buscar local..."
                emptyMessage="Nenhum local cadastrado"
                clearable
                onCreateNew={() => setNovoLocal("")}
                createNewLabel="Cadastrar novo local"
              />
            ) : (
              <div className="flex gap-2">
                <Input
                  value={novoLocal}
                  onChange={(e) => setNovoLocal(upperKeepingCaret(e))}
                  placeholder="ex: fazenda 03"
                  className="uppercase placeholder:normal-case placeholder:lowercase"
                  autoComplete="off"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    // Enter aqui cadastra o local; sem isto ele enviava a obra
                    e.preventDefault();
                    handleCriarLocal();
                  }}
                />
                <Button
                  type="button"
                  onClick={handleCriarLocal}
                  disabled={isPending || !novoLocal.trim()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
                <button
                  type="button"
                  onClick={() => setNovoLocal(null)}
                  aria-label="Cancelar"
                  className="w-10 h-10 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              A fazenda, o sítio ou a chácara onde a obra acontece — é o que junta as
              obras do mesmo lugar.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="so_client">Cliente</Label>
            <Input
              id="so_client"
              value={client}
              onChange={(e) => setClient(upperKeepingCaret(e))}
              placeholder="opcional"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="so_notes">Observações</Label>
            <Textarea
              id="so_notes"
              value={notes}
              onChange={(e) => setNotes(upperKeepingCaret(e))}
              placeholder="opcional"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              rows={2}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando..." : obra ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
