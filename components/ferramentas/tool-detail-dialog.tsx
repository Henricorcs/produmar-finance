"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ArrowRightLeft,
  Undo2,
  Wrench,
  Pencil,
  Trash2,
  Ban,
  RotateCcw,
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
  deleteToolPhoto,
  getToolPhotos,
  getToolPhotoUrl,
  undoWriteoff,
} from "@/app/(app)/ferramentas/actions";
import { CONDITION_LABELS, STATUS_META, fmtDateTime, lossValue } from "./tool-shared";
import type {
  Obra,
  ToolLoan,
  ToolMaintenance,
  ToolWithStatus,
  ToolWriteoff,
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  tool: ToolWithStatus | null;
  /** Histórico já filtrado deste patrimônio. */
  loans: ToolLoan[];
  maintenance: ToolMaintenance[];
  writeoffs: ToolWriteoff[];
  obras?: Obra[];
  onEdit: (tool: ToolWithStatus) => void;
  onCheckout: (tool: ToolWithStatus) => void;
  onWriteoff: (tool: ToolWithStatus) => void;
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
  writeoffs,
  obras = [],
  onEdit,
  onCheckout,
  onWriteoff,
  onReturn,
  onMaintenance,
  onFinishMaintenance,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [photos, setPhotos] = useState<{ id: string; url: string | null }[]>([]);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [receiverPhotoUrls, setReceiverPhotoUrls] = useState<Record<string, string>>({});

  const obraNameById = new Map(obras.map((o) => [o.id, o.name]));

  // carrega as fotos sob demanda (URLs assinadas)
  useEffect(() => {
    setPhotos([]);
    if (!open || !tool?.id) return;
    let cancelled = false;
    getToolPhotos(tool.id).then((r) => {
      if (cancelled || !("photos" in r)) return;
      setPhotos((r.photos ?? []).map((p) => ({ id: p.id, url: p.url })));
    });
    return () => {
      cancelled = true;
    };
  }, [open, tool?.id]);

  function handleDeletePhoto(photoId: string) {
    if (!confirm("Remover esta foto?")) return;
    setDeletingPhotoId(photoId);
    startTransition(async () => {
      const r = await deleteToolPhoto(photoId);
      setDeletingPhotoId(null);
      if (r && "error" in r) {
        alert(r.error);
        return;
      }
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    });
  }

  // fotos de quem recebeu, uma por retirada
  useEffect(() => {
    setReceiverPhotoUrls({});
    if (!open) return;
    let cancelled = false;
    loans.forEach((l) => {
      if (!l.receiver_photo_path) return;
      getToolPhotoUrl(l.receiver_photo_path).then((r) => {
        if (!cancelled && "url" in r && r.url) {
          setReceiverPhotoUrls((prev) => ({ ...prev, [l.id]: r.url! }));
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [open, loans]);

  if (!tool) return null;

  const meta = STATUS_META[tool.status];
  const totalValue = tool.quantity * tool.unit_value;

  function handleDelete() {
    const t = tool!;
    if (
      !confirm(
        `Excluir "${t.name}"? Isso apaga também todo o histórico de baixas, manutenções e inutilizações. Para registrar uma perda sem apagar o cadastro, use "Inutilizar".`
      )
    )
      return;
    startTransition(async () => {
      await deleteTool(t.id);
      onClose();
    });
  }

  function handleUndoWriteoff(id: string) {
    if (!confirm("Desfazer esta inutilização? O saldo é reposto.")) return;
    startTransition(async () => {
      await undoWriteoff(id);
    });
  }

  // histórico unificado (baixas + manutenções + inutilizações), mais recente primeiro
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
              <span className="font-medium">{l.borrower_name}</span> baixou
              {l.quantity > 1 ? ` ${l.quantity} ${tool!.unit}` : ""}
              {l.destination ? ` · ${l.destination}` : ""}
              {l.obra_id && obraNameById.get(l.obra_id) ? ` · Obra: ${obraNameById.get(l.obra_id)}` : ""}
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
            {(l.receiver_signature || receiverPhotoUrls[l.id]) && (
              <div className="flex items-center gap-2 mt-1.5">
                {l.receiver_signature && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={l.receiver_signature}
                    alt="Assinatura de quem recebeu"
                    className="h-8 rounded border border-slate-200 dark:border-slate-700 bg-white"
                  />
                )}
                {receiverPhotoUrls[l.id] && (
                  <a
                    href={receiverPhotoUrls[l.id]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-medium text-produmar-600 dark:text-produmar-400 hover:underline"
                  >
                    Ver foto
                  </a>
                )}
              </div>
            )}
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
    ...writeoffs.map((w) => {
      const loss = lossValue(w.quantity, tool);
      return {
        key: `wo-${w.id}`,
        date: w.created_at,
        node: (
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex items-center justify-center w-7 h-7 rounded-lg bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400 flex-shrink-0">
              <Ban className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-800 dark:text-slate-100">
                Inutilizado {w.quantity > 1 ? `${w.quantity} ${tool!.unit}` : ""}
                {w.reason ? ` · ${w.reason}` : ""}
              </p>
              <p className="text-[11px] text-slate-400">
                {fmtDateTime(w.created_at)}
                {loss > 0 ? ` · perda ${formatBRL(loss)}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleUndoWriteoff(w.id)}
              disabled={isPending}
              className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-produmar-600 dark:hover:text-produmar-400 flex-shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Desfazer
            </button>
          </div>
        ),
      };
    }),
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
          {/* Fotos (galeria) */}
          {photos.length > 0 && (
            <div className={photos.length === 1 ? "" : "grid grid-cols-2 gap-2"}>
              {photos.map((p) => (
                <div key={p.id} className="relative group">
                  {p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.url}
                      alt={tool.name}
                      className="w-full max-h-56 object-cover rounded-xl border border-slate-200 dark:border-slate-700"
                    />
                  ) : (
                    <div className="w-full h-32 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeletePhoto(p.id)}
                    disabled={deletingPhotoId === p.id}
                    aria-label="Remover foto"
                    className="absolute top-1.5 right-1.5 p-1.5 rounded-full bg-black/50 text-white hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Informações */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            <InfoRow label="Nº" value={`#${tool.tool_number}`} />
            {tool.code && <InfoRow label="Código" value={tool.code} />}
            <InfoRow label="Estado" value={CONDITION_LABELS[tool.condition]} />
            <InfoRow
              label="Saldo"
              value={`${tool.available_qty} disp.${
                tool.in_use_qty > 0 ? ` · ${tool.in_use_qty} em uso` : ""
              }${tool.written_off_qty > 0 ? ` · ${tool.written_off_qty} inutil.` : ""} de ${
                tool.quantity
              } ${tool.unit}`}
            />
            <InfoRow label="Valor unitário" value={formatBRL(tool.unit_value)} />
            {tool.replacement_value > 0 && (
              <InfoRow label="Valor de reposição" value={formatBRL(tool.replacement_value)} />
            )}
            <InfoRow label="Valor total" value={formatBRL(totalValue)} />
            {tool.notes && <InfoRow label="Obs." value={tool.notes} />}
          </div>

          {/* Ações principais conforme o status */}
          {tool.status === "disponivel" && (
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => onCheckout(tool)}>
                <ArrowRightLeft className="w-4 h-4" />
                Baixar
              </Button>
              <Button
                variant="outline"
                onClick={() => onWriteoff(tool)}
                className="border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <Ban className="w-4 h-4" />
                Inutilizar
              </Button>
              <Button variant="outline" className="col-span-2" onClick={() => onMaintenance(tool)}>
                <Wrench className="w-4 h-4" />
                Manutenção
              </Button>
            </div>
          )}
          {tool.status === "em_uso" && (
            <Button className="w-full" onClick={() => onReturn(tool)}>
              <Undo2 className="w-4 h-4" />
              Registrar devolução
            </Button>
          )}
          {tool.status === "manutencao" && (
            <Button className="w-full" onClick={() => onFinishMaintenance(tool)}>
              <Wrench className="w-4 h-4" />
              Concluir manutenção
            </Button>
          )}

          {/* Histórico */}
          <div>
            <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
              Histórico
            </h3>
            {events.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 py-2">
                Nenhuma baixa, manutenção ou inutilização ainda.
              </p>
            ) : (
              <div className="space-y-2.5">{events.map((e) => <div key={e.key}>{e.node}</div>)}</div>
            )}
          </div>

          {/* Ações secundárias */}
          <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
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
