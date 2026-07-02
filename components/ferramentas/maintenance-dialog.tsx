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
import { finishMaintenance, openMaintenance } from "@/app/(app)/ferramentas/actions";
import { ConditionPicker } from "./tool-shared";
import type { ToolCondition, ToolWithStatus } from "@/lib/types";

function parseMoney(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}
function formatMoneyInput(raw: string): string {
  const cleaned = raw.replace(/[^\d,]/g, "");
  const parts = cleaned.split(",");
  if (parts.length > 2) return parts[0] + "," + parts.slice(1).join("");
  if (parts[1]?.length > 2) return parts[0] + "," + parts[1].slice(0, 2);
  return cleaned;
}

// ─────────────────────────────────────────────────────────────────────────────
// Enviar para manutenção
// ─────────────────────────────────────────────────────────────────────────────

interface OpenProps {
  open: boolean;
  onClose: () => void;
  /** Ferramentas que podem ir para manutenção (disponíveis). */
  availableTools: ToolWithStatus[];
  presetToolId?: string | null;
}

export function OpenMaintenanceDialog({ open, onClose, availableTools, presetToolId }: OpenProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [toolId, setToolId] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setToolId(presetToolId ?? "");
    setDescription("");
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
    if (!description.trim()) {
      setError("Descreva o que será feito");
      return;
    }

    startTransition(async () => {
      const r = await openMaintenance({ tool_id: toolId, description, notes });
      if (r && "error" in r) setError(r.error ?? "Erro ao registrar manutenção");
      else onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Enviar para manutenção</DialogTitle>
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
            <Label htmlFor="mnt_desc">O que será feito? *</Label>
            <Input
              id="mnt_desc"
              value={description}
              onChange={(e) => setDescription(e.target.value.toUpperCase())}
              placeholder="ex: troca de rolamento, afiação"
              className="uppercase placeholder:normal-case placeholder:lowercase"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mnt_notes">Observações</Label>
            <Input
              id="mnt_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.toUpperCase())}
              placeholder="ex: oficina do João (opcional)"
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
              {isPending ? "Registrando..." : "Enviar para manutenção"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Concluir manutenção
// ─────────────────────────────────────────────────────────────────────────────

export interface FinishTarget {
  maintenanceId: string;
  toolName: string;
  description: string;
}

interface FinishProps {
  open: boolean;
  onClose: () => void;
  target: FinishTarget | null;
}

export function FinishMaintenanceDialog({ open, onClose, target }: FinishProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [cost, setCost] = useState("");
  const [condition, setCondition] = useState<ToolCondition>("bom");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setCost("");
    setCondition("bom");
    setNotes("");
    setError(null);
  }, [open]);

  if (!target) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const r = await finishMaintenance({
        maintenance_id: target!.maintenanceId,
        cost: parseMoney(cost),
        condition,
        notes,
      });
      if (r && "error" in r) setError(r.error ?? "Erro ao concluir manutenção");
      else onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100">Concluir manutenção</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2.5 text-sm">
            <p className="font-semibold text-slate-800 dark:text-slate-100">{target.toolName}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{target.description}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fin_cost">Custo (R$)</Label>
            <Input
              id="fin_cost"
              value={cost}
              onChange={(e) => setCost(formatMoneyInput(e.target.value))}
              placeholder="0,00"
              inputMode="decimal"
              autoComplete="off"
              className="tabular-nums"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Estado após a manutenção</Label>
            <ConditionPicker value={condition} onChange={setCondition} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fin_notes">Observações</Label>
            <Input
              id="fin_notes"
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
              {isPending ? "Concluindo..." : "Concluir manutenção"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
