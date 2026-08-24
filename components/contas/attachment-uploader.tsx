"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Paperclip,
  X,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  File as FileIcon,
} from "lucide-react";
import {
  getAttachmentSignedUrl,
  deleteAttachment,
} from "@/app/(app)/contas/actions";
import type { TransactionAttachment } from "@/lib/types";
import { comprimirImagens } from "@/lib/comprimir-imagem";

const MAX_SIZE_MB = 10;
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;

interface Props {
  newFiles: File[];
  onNewFilesChange: (files: File[]) => void;
  existingAttachments?: TransactionAttachment[];
  onExistingChange?: (attachments: TransactionAttachment[]) => void;
  disabled?: boolean;
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
  if (lower.includes("xml")) return <FileText className="w-4 h-4 text-amber-500" />;
  return <FileIcon className="w-4 h-4" />;
}

export function AttachmentUploader({
  newFiles,
  onNewFilesChange,
  existingAttachments,
  onExistingChange,
  disabled,
}: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<Map<File, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  // Generate / clean up object URLs for image previews
  useEffect(() => {
    const next = new Map<File, string>();
    newFiles.forEach((file) => {
      if (file.type.startsWith("image/")) {
        const existing = previews.get(file);
        next.set(file, existing ?? URL.createObjectURL(file));
      }
    });
    previews.forEach((url, file) => {
      if (!next.has(file)) URL.revokeObjectURL(url);
    });
    setPreviews(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newFiles]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  async function addFiles(files: FileList | null) {
    if (!files) return;
    // Encolhe as fotos antes de medir: comprovante de 12 MB tirado no celular
    // vira uns 300 kB e passa a caber, em vez de ser recusado. PDF e XML de
    // nota fiscal passam intactos.
    const escolhidos = await comprimirImagens(Array.from(files));
    const ok: File[] = [];
    const errs: string[] = [];
    escolhidos.forEach((f) => {
      if (f.size > MAX_SIZE) {
        errs.push(`${f.name}: máx ${MAX_SIZE_MB} MB`);
        return;
      }
      ok.push(f);
    });
    if (errs.length) setError(errs.join(" · "));
    else setError(null);
    if (ok.length) onNewFilesChange([...newFiles, ...ok]);
  }

  function removeNew(idx: number) {
    onNewFilesChange(newFiles.filter((_, i) => i !== idx));
  }

  async function removeExisting(att: TransactionAttachment) {
    if (!confirm("Remover este anexo?")) return;
    const result = await deleteAttachment(att.id);
    if ("error" in result) {
      setError(result.error ?? "Erro");
      return;
    }
    onExistingChange?.((existingAttachments ?? []).filter((a) => a.id !== att.id));
  }

  async function openExisting(att: TransactionAttachment) {
    // Montar o endereço não falha mais (é só um caminho para /api/arquivo). Se o
    // arquivo não estiver lá, quem avisa é a própria rota, ao abrir.
    const result = await getAttachmentSignedUrl(att.storage_path);
    window.open(result.url, "_blank", "noopener,noreferrer");
  }

  const totalCount = (existingAttachments?.length ?? 0) + newFiles.length;

  return (
    <div className="space-y-2">
      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => cameraRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
        >
          <Camera className="w-3.5 h-3.5" />
          Câmera
        </button>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <button
          type="button"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
        >
          <Paperclip className="w-3.5 h-3.5" />
          Anexar arquivo
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf,.xml,application/pdf,text/xml"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {error && (
        <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>
      )}

      {totalCount === 0 ? (
        <p className="text-[10px] text-slate-400 dark:text-slate-500">
          Foto, PDF ou XML · até {MAX_SIZE_MB} MB cada
        </p>
      ) : (
        <div className="space-y-1.5">
          {/* Existing attachments */}
          {existingAttachments?.map((att) => (
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
                {att.file_size && (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">
                    {formatFileSize(att.file_size)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => openExisting(att)}
                title="Abrir"
                className="p-1 text-slate-400 hover:text-produmar-600 dark:hover:text-produmar-400"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => removeExisting(att)}
                title="Remover"
                className="p-1 text-slate-400 hover:text-red-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {/* New files */}
          {newFiles.map((file, idx) => (
            <div
              key={`${file.name}-${idx}-${file.size}`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-produmar-50/60 dark:bg-produmar-900/20 border border-produmar-100 dark:border-produmar-900/30"
            >
              <div className="w-7 h-7 rounded-md flex-shrink-0 overflow-hidden bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300">
                {file.type.startsWith("image/") && previews.get(file) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previews.get(file)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  getFileIconFor(file.type || file.name)
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                  {file.name}
                </p>
                <p className="text-[10px] text-produmar-600 dark:text-produmar-400">
                  Novo · {formatFileSize(file.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeNew(idx)}
                title="Remover"
                className="p-1 text-slate-400 hover:text-red-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
