"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDate } from "@/lib/utils";
import {
  Download,
  Paperclip,
  ArrowDownCircle,
  ArrowUpCircle,
  Eye,
} from "lucide-react";
import { getAttachmentSignedUrl } from "@/app/(app)/contas/actions";
import type { Transaction, TransactionAttachment } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  pendente:  "Pendente",
  pago:      "Pago",
  recebido:  "Recebido",
  vencido:   "Vencido",
  cancelado: "Cancelado",
};

const STATUS_STYLE: Record<string, string> = {
  pendente:  "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400",
  pago:      "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400",
  recebido:  "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400",
  vencido:   "bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400",
  cancelado: "bg-slate-100 dark:bg-slate-800 text-slate-500",
};

export type DetailTransaction = Transaction & {
  categories: { name: string; color: string } | null;
  cost_centers: { name: string } | null;
  transaction_attachments?: TransactionAttachment[];
};

interface Props {
  open: boolean;
  transaction: DetailTransaction | null;
  onClose: () => void;
}

export function TransactionDetailsDialog({ open, transaction, onClose }: Props) {
  const [downloading, setDownloading] = useState<string | null>(null);

  if (!transaction) return null;
  const t = transaction;
  const isEntrada = t.type === "entrada";

  async function openAttachment(att: TransactionAttachment) {
    setDownloading(att.id);
    try {
      const result = await getAttachmentSignedUrl(att.storage_path);
      if ("url" in result && result.url) {
        window.open(result.url, "_blank");
      } else if ("error" in result) {
        alert(result.error);
      }
    } finally {
      setDownloading(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="dark:text-slate-100 flex items-center gap-2">
            <Eye className="w-4 h-4 text-slate-400" />
            Detalhes do lançamento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tipo + status */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
                isEntrada
                  ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400"
                  : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400"
              }`}
            >
              {isEntrada ? (
                <ArrowDownCircle className="w-3.5 h-3.5" />
              ) : (
                <ArrowUpCircle className="w-3.5 h-3.5" />
              )}
              {isEntrada ? "Receita" : "Despesa"}
            </span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                STATUS_STYLE[t.status] ?? STATUS_STYLE.pendente
              }`}
            >
              {STATUS_LABEL[t.status] ?? t.status}
            </span>
          </div>

          {/* Descrição */}
          <Field
            label="Descrição"
            value={t.description}
            highlight
          />

          {/* Valor */}
          <div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold tracking-wider">
              Valor
            </p>
            <p
              className={`text-2xl font-bold tabular-nums mt-0.5 ${
                isEntrada
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {isEntrada ? "+" : "−"} {formatBRL(t.amount)}
            </p>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Vencimento" value={formatDate(t.due_date)} mono />
            <Field
              label="Data de pagamento"
              value={t.paid_date ? formatDate(t.paid_date) : "—"}
              mono
            />
          </div>

          {/* Categoria + centro de custo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold tracking-wider">
                Categoria
              </p>
              {t.categories ? (
                <span
                  className="inline-flex text-xs px-2 py-0.5 rounded-full text-white font-semibold mt-1"
                  style={{ backgroundColor: t.categories.color }}
                >
                  {t.categories.name}
                </span>
              ) : (
                <p className="text-sm text-slate-400 mt-0.5">—</p>
              )}
            </div>
            <Field
              label="Centro de custo"
              value={t.cost_centers?.name ?? "—"}
            />
          </div>

          {/* Observações */}
          {t.notes && (
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold tracking-wider">
                Observações
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-300 mt-0.5 whitespace-pre-wrap break-words">
                {t.notes}
              </p>
            </div>
          )}

          {/* Anexos */}
          {t.transaction_attachments && t.transaction_attachments.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold tracking-wider flex items-center gap-1 mb-1.5">
                <Paperclip className="w-3 h-3" />
                Anexos ({t.transaction_attachments.length})
              </p>
              <div className="space-y-1.5">
                {t.transaction_attachments.map((att) => (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => openAttachment(att)}
                    disabled={downloading === att.id}
                    className="w-full flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors text-left disabled:opacity-50"
                  >
                    <Download className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                        {att.file_name}
                      </p>
                      {att.file_size != null && (
                        <p className="text-[10px] text-slate-400">
                          {(att.file_size / 1024).toFixed(0)} KB
                        </p>
                      )}
                    </div>
                    {downloading === att.id && (
                      <span className="text-[10px] text-slate-400">abrindo…</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Aviso de modo leitura */}
          <div className="text-[10px] text-slate-400 dark:text-slate-500 italic flex items-center gap-1 pt-2 border-t border-slate-100 dark:border-slate-800">
            <Eye className="w-3 h-3" />
            Modo de visualização — você não tem permissão para editar este lançamento.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-component ────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  highlight,
  mono,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-semibold tracking-wider">
        {label}
      </p>
      <p
        className={`mt-0.5 break-words ${mono ? "tabular-nums" : ""} ${
          highlight
            ? "text-base font-semibold text-slate-800 dark:text-slate-100"
            : "text-sm text-slate-700 dark:text-slate-300"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
