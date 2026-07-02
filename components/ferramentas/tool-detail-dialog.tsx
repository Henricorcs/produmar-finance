"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ArrowRightLeft,
  Undo2,
  Wrench,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
  ImageIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDate } from "@/lib/utils";
import {
  deleteTool,
  getToolPhotoUrl,
  setToolActive,
} from "@/app/(app)/ferramentas/actions";
import { CONDITION_LABELS, STATUS_META, fmtDateTime } from "./tool-shared";
import type { ToolLoan, ToolMaintenance, ToolWithStatus } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  tool: ToolWithStatus | null;
  /** Histórico já filtrado desta ferramenta. */
  loans: ToolLoan[];
  maintenance: ToolMaintenance[];
  onEdit: (tool: ToolWithStatus) => void;
  onCheckout: (tool: ToolWithStatus) => void;
  onReturn: (tool: ToolWithStatus) => void;
  onMaintenance: (tool: ToolWithStatus) => void;
  onFinishMaintenance: (tool: ToolWithStatus) => void;
}

export function ToolDetailDialog({
  open,
  onClose,
  tool,
  loans,
  maintenance,
  onEdit,
  onCheckout,
  onReturn,
  onMaintenance,
  onFinishMaintenance,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  // carrega a foto sob demanda (URL assinada)
  useEffect(() => {
    setPhotoUrl(null);
    if (!open || !tool?.photo_path) return;
    let cancelled = false;
    getToolPhotoUrl(tool.photo_path).then((r) => {
      if (!cancelled && "url" in r) setPhotoUrl(r.url ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [open, tool?.photo_path]);

  if (!tool) return null;

  const meta = STATUS_META[tool.status];

  function handleToggleActive() {
    const t = tool!;
    const msg = t.active
      ? `Baixar "${t.name}"? Ela sai da lista de disponíveis, mas o histórico permanece.`
      : `Reativar "${t.name}"?`;
    if (!confirm(msg)) return;
    startTransition(async () => {
      await setToolActive(t.id, !t.active);
      onClose();
    });
  }

  function handleDelete() {
    const t = tool!;
    if (
      !confirm(
        `Excluir "${t.name}"? Isso apaga também todo o histórico de retiradas e manutenções. Para tirar de circulação sem perder o histórico, use "Baixar".`
      )
    )
      return;
    startTransition(async () => {
      await deleteTool(t.id);
      onClose();
    });
  }

  // histórico unificado (retiradas + manutenções), mais recente primeiro
  const events: { key: string; date: string; node: React.ReactNode }[] = [
    ...loans.map((l) => ({
      key: `loan-${l.id}`,
      date: l.checked_out_at,
      node: (
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex items-center justify-center w-7 h-7 rounded-lg bg-produmar-50 dark:bg-produmar-900/40 text-produmar-600 dark:text-produmar-300 flex-shrink-0">
            <ArrowRightLeft className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-800 dark:text-slate-100">
              <span className="font-medium">{l.borrower_name}</span> retirou
              {l.destination ? ` · ${l.destination}` : ""}
            </p>
            <p className="text-[11px] text-slate-400">
              {fmtDateTime(l.checked_out_at)}
              {l.returned_at
                ? ` → devolvida ${fmtDateTime(l.returned_at)}${
                    l.return_condition ? ` (${CONDITION_LABELS[l.return_condition]})` : ""
                  }`
                : " · em aberto"}
              {l.return_notes ? ` · ${l.return_notes}` : ""}
            </p>
          </div>
        </div>
      ),
    })),
    ...maintenance.map((m) => ({
      key: `mnt-${m.id}`,
      date: m.created_at,
      node: (
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex items-center justify-center w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex-shrink-0">
            <Wrench className="w-3.5 h-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-800 dark:text-slate-100">{m.description}</p>
            <p className="text-[11px] text-slate-400">
              {formatDate(m.started_at)}
              {m.finished_at
                ? ` → concluída ${formatDate(m.finished_at)}${
                    Number(m.cost) > 0 ? ` · ${formatBRL(Number(m.cost))}` : ""
                  }`
                : " · em andamento"}
              {m.notes ? ` · ${m.notes}` : ""}
            </p>
          </div>
        </div>
      ),
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100 flex items-center gap-2 flex-wrap pr-6">
            {tool.name}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${meta.chip}`}>
              {meta.label}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Foto */}
          {tool.photo_path &&
            (photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={tool.name}
                className="w-full max-h-56 object-cover rounded-xl border border-slate-200 dark:border-slate-700"
              />
            ) : (
              <div className="w-full h-32 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-slate-300 dark:text-slate-600" />
              </div>
            ))}

          {/* Informações */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            <InfoRow label="Nº" value={`#${tool.tool_number}`} />
            {tool.code && <InfoRow label="Código" value={tool.code} />}
            <InfoRow label="Estado" value={CONDITION_LABELS[tool.condition]} />
            {tool.status === "em_uso" && tool.current_borrower && (
              <InfoRow
                label="Está com"
                value={`${tool.current_borrower}${
                  tool.current_destination ? ` · ${tool.current_destination}` : ""
                }`}
              />
            )}
            {tool.status === "em_uso" && tool.current_expected_return_date && (
              <InfoRow
                label="Devolução prevista"
                value={formatDate(tool.current_expected_return_date)}
              />
            )}
            {tool.status === "manutencao" && tool.open_maintenance_description && (
              <InfoRow label="Manutenção" value={tool.open_maintenance_description} />
            )}
            {tool.notes && <InfoRow label="Obs." value={tool.notes} />}
          </div>

          {/* Ações principais conforme o status */}
          <div className="grid grid-cols-2 gap-2">
            {tool.status === "disponivel" && (
              <>
                <Button onClick={() => onCheckout(tool)}>
                  <ArrowRightLeft className="w-4 h-4" />
                  Retirar
                </Button>
                <Button variant="outline" onClick={() => onMaintenance(tool)}>
                  <Wrench className="w-4 h-4" />
                  Manutenção
                </Button>
              </>
            )}
            {tool.status === "em_uso" && (
              <Button className="col-span-2" onClick={() => onReturn(tool)}>
                <Undo2 className="w-4 h-4" />
                Registrar devolução
              </Button>
            )}
            {tool.status === "manutencao" && (
              <Button className="col-span-2" onClick={() => onFinishMaintenance(tool)}>
                <Wrench className="w-4 h-4" />
                Concluir manutenção
              </Button>
            )}
          </div>

          {/* Histórico */}
          <div>
            <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
              Histórico
            </h3>
            {events.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 py-2">
                Nenhuma retirada ou manutenção ainda.
              </p>
            ) : (
              <div className="space-y-2.5">{events.map((e) => <div key={e.key}>{e.node}</div>)}</div>
            )}
          </div>

          {/* Ações secundárias */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onEdit(tool)}
                className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-500 hover:text-produmar-600 dark:text-slate-400 dark:hover:text-produmar-400 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" />
                Editar
              </button>
              <button
                type="button"
                onClick={handleToggleActive}
                disabled={isPending}
                className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-400 transition-colors"
              >
                {tool.active ? (
                  <>
                    <Archive className="w-3.5 h-3.5" />
                    Baixar
                  </>
                ) : (
                  <>
                    <ArchiveRestore className="w-3.5 h-3.5" />
                    Reativar
                  </>
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium text-slate-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-3 py-2">
      <span className="text-slate-500 dark:text-slate-400 flex-shrink-0">{label}</span>
      <span className="font-medium text-slate-800 dark:text-slate-100 text-right">{value}</span>
    </div>
  );
}
