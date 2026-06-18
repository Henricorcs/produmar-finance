"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Camera,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  File as FileIcon,
  Loader2,
} from "lucide-react";
import {
  uploadServiceOrderAttachments,
  getServiceOrderAttachmentSignedUrl,
  deleteServiceOrderAttachment,
} from "@/app/(app)/operacoes/actions";
import type { ServiceOrderAttachment } from "@/lib/types";

const MAX_SIZE_MB = 10;
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;

interface Props {
  orderId: string;
  attachments: ServiceOrderAttachment[];
}

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIconFor(mimeOrName: string) {
  const lower = mimeOrName.toLowerCase();
  if (lower.startsWith("image/") || /\.(png|jpe?g|gif|webp|heic)$/i.test(lower)) {
    return <ImageIcon className="w-4 h-4" />;
  }
  if (lower.includes("pdf")) return <FileText className="w-4 h-4 text-red-500" />;
  return <FileIcon className="w-4 h-4" />;
}

/**
 * Comprovantes de uma OS (foto do recibo / PDF). O upload é imediato (a OS já
 * existe). Botões grandes, pensados para celular. Lista local otimista para o
 * operador ver o anexo na hora, sem depender de revalidação.
 */
export function ServiceOrderComprovantes({ orderId, attachments }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<ServiceOrderAttachment[]>(attachments);

  // Sincroniza quando a lista chega do servidor (no escritório o fetch é
  // assíncrono — sem isso a lista ficaria vazia após o carregamento).
  useEffect(() => setList(attachments), [attachments]);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const fd = new FormData();
    const errs: string[] = [];
    const pendingNames: string[] = [];
    Array.from(files).forEach((f) => {
      if (f.size > MAX_SIZE) {
        errs.push(`${f.name}: máx ${MAX_SIZE_MB} MB`);
        return;
      }
      fd.append("files", f);
      pendingNames.push(f.name);
    });
    setError(errs.length ? errs.join(" · ") : null);
    if (pendingNames.length === 0) return;

    startTransition(async () => {
      const res = await uploadServiceOrderAttachments(orderId, fd);
      if (res && "error" in res) {
        setError(res.error ?? "Erro ao enviar");
        return;
      }
      if (res && "warning" in res && res.warning) setError(res.warning);
      // Otimista: marca os arquivos enviados na lista (id temporário). A próxima
      // revalidação traz os registros reais; aqui é só feedback visual imediato.
      setList((prev) => [
        ...prev,
        ...pendingNames.map((name, i) => ({
          id: `tmp_${Date.now()}_${i}`,
          service_order_id: orderId,
          file_name: name,
          file_size: null,
          mime_type: null,
          storage_path: "",
          created_by: null,
          created_at: new Date().toISOString(),
        })),
      ]);
    });
  }

  async function openAtt(att: ServiceOrderAttachment) {
    if (!att.storage_path) return; // anexo otimista ainda sem caminho
    const res = await getServiceOrderAttachmentSignedUrl(att.storage_path);
    if ("error" in res) {
      setError(res.error ?? "Erro ao abrir");
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  function removeAtt(att: ServiceOrderAttachment) {
    if (att.id.startsWith("tmp_")) {
      setList((prev) => prev.filter((a) => a.id !== att.id));
      return;
    }
    if (!confirm("Remover este comprovante?")) return;
    startTransition(async () => {
      const res = await deleteServiceOrderAttachment(att.id);
      if (res && "error" in res) {
        setError(res.error ?? "Erro ao remover");
        return;
      }
      setList((prev) => prev.filter((a) => a.id !== att.id));
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          Comprovante
        </p>
        {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-produmar-500" />}
      </div>

      {/* Botões de upload */}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => cameraRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
        >
          <Camera className="w-4 h-4" />
          Tirar foto
        </button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <button
          type="button"
          disabled={isPending}
          onClick={() => fileRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
        >
          <Paperclip className="w-4 h-4" />
          Anexar arquivo
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}

      {list.length === 0 ? (
        <p className="text-[10px] text-slate-400 dark:text-slate-500">
          Foto do recibo, nota ou PDF · até {MAX_SIZE_MB} MB cada (opcional)
        </p>
      ) : (
        <div className="space-y-1.5">
          {list.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700"
            >
              <div className="w-7 h-7 rounded-md bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 flex-shrink-0">
                {getFileIconFor(att.mime_type ?? att.file_name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                  {att.file_name}
                </p>
                {att.file_size != null && (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">
                    {formatFileSize(att.file_size)}
                  </p>
                )}
              </div>
              {att.storage_path && (
                <button
                  type="button"
                  onClick={() => openAtt(att)}
                  title="Abrir"
                  className="p-1.5 text-slate-400 hover:text-produmar-600 dark:hover:text-produmar-400"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => removeAtt(att)}
                disabled={isPending}
                title="Remover"
                className="p-1.5 text-slate-400 hover:text-red-600 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
