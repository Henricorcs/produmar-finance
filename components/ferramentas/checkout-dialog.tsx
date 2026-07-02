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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { checkoutTool } from "@/app/(app)/ferramentas/actions";
import type { ToolWithStatus } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Ferramentas disponíveis para retirada. */
  availableTools: ToolWithStatus[];
  /** Pré-seleciona a ferramenta (quando aberto a partir do card/detalhe). */
  presetToolId?: string | null;
}

export function CheckoutDialog({ open, onClose, availableTools, presetToolId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [toolId, setToolId] = useState("");
  const [borrower, setBorrower] = useState("");
  const [destination, setDestination] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setToolId(presetToolId ?? "");
    setBorrower("");
    setDestination("");
    setExpectedDate("");
    setNotes("");
    setError(null);
  }, [open, presetToolId]);

  const presetTool = presetToolId
    ? availableTools.find((t) => t.id === presetToolId) ?? null
    : null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!toolId) {
      setError("Selecione a ferramenta");
      return;
    }
    if (!borrower.trim()) {
      setError("Informe quem está retirando");
      return;
    }

    startTransition(async () => {
      const r = await checkoutTool({
        tool_id: toolId,
        borrower_name: borrower,
        destination,
        expected_return_date: expectedDate || null,
        notes,
      });
      if (r && "error" in r) setError(r.error ?? "Erro ao registrar retirada");
      else onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Retirada de ferramenta</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Ferramenta *</Label>
            {presetTool ? (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                {presetTool.name}
                {presetTool.code ? (
                  <span className="text-xs text-slate-400 ml-1.5">{presetTool.code}</span>
                ) : null}
              </div>
            ) : (
              <SearchableSelect
                items={availableTools}
                value={toolId}
                onChange={setToolId}
                getId={(t) => t.id}
                getLabel={(t) => t.name}
                renderItem={(t) => (
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="truncate">{t.name}</span>
                    {t.code && (
                      <span className="text-[10px] text-slate-400 flex-shrink-0">{t.code}</span>
                    )}
                  </div>
                )}
                placeholder="Selecione a ferramenta..."
                searchPlaceholder="Buscar ferramenta..."
                emptyMessage="Nenhuma ferramenta disponível"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="co_borrower">Quem está retirando *</Label>
            <Input
              id="co_borrower"
              value={borrower}
              onChange={(e) => setBorrower(e.target.value.toUpperCase())}
              placeholder="nome de quem pegou"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="co_destination">Onde vai usar</Label>
            <Input
              id="co_destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value.toUpperCase())}
              placeholder="obra / local (opcional)"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="co_expected">Previsão de devolução</Label>
            <Input
              id="co_expected"
              type="date"
              value={expectedDate}
              onChange={(e) => setExpectedDate(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="co_notes">Observações</Label>
            <Input
              id="co_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.toUpperCase())}
              placeholder="opcional"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
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
              {isPending ? "Registrando..." : "Registrar retirada"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
