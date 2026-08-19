"use client";

import { useEffect, useState, useTransition } from "react";
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
import { createSupplyObra, updateSupplyObra } from "@/app/(app)/almoxarifado/actions";
import type { SupplyObra } from "@/lib/types";
import { upperKeepingCaret } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Obra em edição — null cria uma nova. */
  obra: SupplyObra | null;
  /** Avisa quem abriu qual obra acabou de nascer (ex.: pra já selecionar). */
  onCreated?: (obraId: string) => void;
}

export function ObraDialog({ open, onClose, obra, onCreated }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(obra?.name ?? "");
    setClient(obra?.client ?? "");
    setNotes(obra?.notes ?? "");
    setError(null);
  }, [open, obra]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Informe o nome da obra");
      return;
    }

    startTransition(async () => {
      const input = { name, client, notes };
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
