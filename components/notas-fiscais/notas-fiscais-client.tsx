"use client";

import { useRef, useState, useTransition } from "react";
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  Clock,
  Trash2,
  Plus,
  X,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL, formatDate } from "@/lib/utils";
import { formatCNPJ, parseNFeXml } from "@/lib/nfe-parser";
import {
  saveInvoice,
  deleteInvoice,
  createTransactionFromInvoice,
} from "@/app/(app)/notas-fiscais/actions";
import type { Category, CostCenter, Invoice } from "@/lib/types";

interface Props {
  invoices: Invoice[];
  categories: Category[];
  costCenters: CostCenter[];
}

export function NotasFiscaisClient({ invoices, categories, costCenters }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // ── "Criar lançamento" modal state ───────────────────────────────────────
  const [modalInvoice, setModalInvoice] = useState<Invoice | null>(null);
  const [modalCategory, setModalCategory] = useState("");
  const [modalCostCenter, setModalCostCenter] = useState("");
  const [modalPending, setModalPending] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // ── File processing ────────────────────────────────────────────────────
  async function processFiles(files: FileList | File[]) {
    const xmlFiles = Array.from(files).filter(
      (f) => f.name.endsWith(".xml") || f.type === "text/xml"
    );

    if (xmlFiles.length === 0) {
      setUploadError("Selecione arquivos .xml de NF-e.");
      return;
    }

    setUploading(true);
    setUploadError(null);
    const errors: string[] = [];

    for (const file of xmlFiles) {
      try {
        const text = await file.text();
        const parsed = parseNFeXml(text);

        const result = await saveInvoice(parsed);
        if (result.error) errors.push(`${file.name}: ${result.error}`);
      } catch (e) {
        errors.push(
          `${file.name}: ${e instanceof Error ? e.message : "Erro ao processar"}`
        );
      }
    }

    setUploading(false);
    if (errors.length > 0) setUploadError(errors.join("\n"));
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) processFiles(e.target.files);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files) processFiles(e.dataTransfer.files);
  }

  // ── Delete ─────────────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm("Excluir esta nota fiscal?")) return;
    startTransition(async () => {
      const result = await deleteInvoice(id);
      if (result.error) alert(result.error);
    });
  }

  // ── Create transaction modal ───────────────────────────────────────────
  function openModal(inv: Invoice) {
    setModalInvoice(inv);
    setModalCategory("");
    setModalCostCenter("");
    setModalError(null);
  }

  async function handleCreateTransaction() {
    if (!modalInvoice) return;
    setModalPending(true);
    setModalError(null);

    const result = await createTransactionFromInvoice(
      modalInvoice.id,
      modalCategory || null,
      modalCostCenter || null
    );

    setModalPending(false);
    if (result.error) {
      setModalError(result.error);
    } else {
      setModalInvoice(null);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  const pending = invoices.filter((i) => !i.processed);
  const processed = invoices.filter((i) => i.processed);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">
            Notas Fiscais
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Importe NF-e em XML e gere lançamentos automaticamente
          </p>
        </div>
        <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          <UploadCloud className="w-4 h-4" />
          {uploading ? "Processando…" : "Importar XML"}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,text/xml"
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed
          px-6 py-10 cursor-pointer transition-colors select-none
          ${dragging
            ? "border-produmar-500 bg-produmar-50/60 dark:bg-produmar-900/20"
            : "border-slate-200 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/40 hover:border-produmar-300 dark:hover:border-slate-600"
          }
        `}
      >
        <UploadCloud className={`w-8 h-8 ${dragging ? "text-produmar-500" : "text-slate-400"}`} />
        <div className="text-center">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Arraste arquivos XML aqui ou clique para selecionar
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            NF-e versão 4.0 · múltiplos arquivos suportados
          </p>
        </div>
      </div>

      {/* Upload error */}
      {uploadError && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">
              Erro ao importar
            </p>
            <pre className="text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap mt-0.5">
              {uploadError}
            </pre>
          </div>
          <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Empty state */}
      {invoices.length === 0 && !uploading && (
        <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 flex flex-col items-center gap-3">
          <FileText className="w-10 h-10 text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center">
            Nenhuma nota fiscal importada ainda.
            <br />
            Importe um arquivo XML de NF-e para começar.
          </p>
        </div>
      )}

      {/* Pending invoices */}
      {pending.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Aguardando lançamento
            </h2>
            <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
              {pending.length}
            </span>
          </div>
          <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
            {pending.map((inv) => (
              <InvoiceRow
                key={inv.id}
                invoice={inv}
                onCreateTransaction={() => openModal(inv)}
                onDelete={() => handleDelete(inv.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Processed invoices */}
      {processed.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Lançamentos criados
            </h2>
            <span className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">
              {processed.length}
            </span>
          </div>
          <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 opacity-80">
            {processed.map((inv) => (
              <InvoiceRow
                key={inv.id}
                invoice={inv}
                onDelete={() => handleDelete(inv.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Create transaction modal */}
      {modalInvoice && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setModalInvoice(null)}
          />
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
              {/* Modal header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Criar lançamento
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    NF {modalInvoice.number ?? "s/n"} ·{" "}
                    {modalInvoice.direction === "saida" ? "Despesa" : "Receita"}
                  </p>
                </div>
                <button
                  onClick={() => setModalInvoice(null)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* NF-e summary */}
              <div className="px-5 pt-4 pb-2">
                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">
                      {modalInvoice.direction === "saida" ? "Fornecedor" : "Cliente"}
                    </span>
                    <span className="font-medium text-slate-800 dark:text-slate-200 text-right max-w-[60%] truncate">
                      {modalInvoice.direction === "saida"
                        ? modalInvoice.emitter_name
                        : modalInvoice.receiver_name}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Emissão</span>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {modalInvoice.issue_date
                        ? formatDate(modalInvoice.issue_date)
                        : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400">Valor total</span>
                    <span
                      className={`font-semibold ${
                        modalInvoice.direction === "saida"
                          ? "text-red-600 dark:text-red-400"
                          : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {formatBRL(modalInvoice.total_amount ?? 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Form */}
              <div className="px-5 pb-4 space-y-3">
                {/* Category */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                    Categoria
                  </label>
                  <select
                    value={modalCategory}
                    onChange={(e) => setModalCategory(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-produmar-500"
                  >
                    <option value="">— Sem categoria —</option>
                    {categories
                      .filter(
                        (c) =>
                          !c.type ||
                          c.type === modalInvoice.direction
                      )
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Cost center */}
                {costCenters.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                      Centro de custo
                    </label>
                    <select
                      value={modalCostCenter}
                      onChange={(e) => setModalCostCenter(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-produmar-500"
                    >
                      <option value="">— Sem centro de custo —</option>
                      {costCenters.map((cc) => (
                        <option key={cc.id} value={cc.id}>
                          {cc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {modalError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{modalError}</p>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setModalInvoice(null)}
                    className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreateTransaction}
                    disabled={modalPending}
                    className="flex-1 px-4 py-2.5 text-sm rounded-lg bg-produmar-600 hover:bg-produmar-700 text-white font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
                  >
                    {modalPending ? (
                      "Criando…"
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Criar lançamento
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Invoice row ──────────────────────────────────────────────────────────────

function InvoiceRow({
  invoice: inv,
  onCreateTransaction,
  onDelete,
}: {
  invoice: Invoice;
  onCreateTransaction?: () => void;
  onDelete: () => void;
}) {
  const isExpense = inv.direction === "saida";
  const counterpart = isExpense
    ? (inv.emitter_name ?? "Fornecedor desconhecido")
    : (inv.receiver_name ?? "Cliente desconhecido");
  const counterpartDoc = isExpense ? inv.emitter_document : inv.receiver_document;

  return (
    <div className="flex items-center gap-3 px-4 py-3.5 group hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
      {/* Direction icon */}
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isExpense
            ? "bg-red-50 dark:bg-red-950/40"
            : "bg-emerald-50 dark:bg-emerald-950/40"
        }`}
      >
        {isExpense ? (
          <ArrowUpCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
        ) : (
          <ArrowDownCircle className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
          {counterpart}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-slate-400 dark:text-slate-500">
            NF {inv.number ?? "s/n"}{inv.series ? ` · Série ${inv.series}` : ""}
          </span>
          {inv.issue_date && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              · {formatDate(inv.issue_date)}
            </span>
          )}
          {counterpartDoc && (
            <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:inline">
              · {formatCNPJ(counterpartDoc)}
            </span>
          )}
        </div>
      </div>

      {/* Amount + status */}
      <div className="text-right flex-shrink-0">
        <p
          className={`text-sm font-semibold tabular-nums ${
            isExpense
              ? "text-red-600 dark:text-red-400"
              : "text-emerald-600 dark:text-emerald-400"
          }`}
        >
          {isExpense ? "−" : "+"}
          {formatBRL(inv.total_amount ?? 0)}
        </p>
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
            inv.processed
              ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400"
              : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400"
          }`}
        >
          {inv.processed ? "Lançado" : "Pendente"}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex-shrink-0">
        {!inv.processed && onCreateTransaction && (
          <button
            onClick={onCreateTransaction}
            title="Criar lançamento"
            className="p-1.5 rounded-lg text-slate-400 hover:text-produmar-600 dark:hover:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={onDelete}
          title="Excluir nota"
          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
