"use client";

import { useRef, useState, useTransition } from "react";
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
  uploadLoanAttachments,
  getLoanAttachmentSignedUrl,
  deleteLoanAttachment,
} from "@/app/(app)/devedores/actions";
import type { LoanAttachment } from "@/lib/types";
import { comprimirImagens } from "@/lib/comprimir-imagem";

const MAX_SIZE_MB = 10;
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;

interface Props {
  loanId: string;
  attachments: LoanAttachment[];
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

export function LoanComprovantes({ loanId, attachments }: Props) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    // Encolhe as fotos antes de medir: comprovante de 12 MB tirado no celular
    // vira uns 300 kB e passa a caber, em vez de ser recusado.
    const escolhidos = await comprimirImagens(Array.from(files));
    const fd = new FormData();
    const errs: string[] = [];
    let count = 0;
    escolhidos.forEach((f) => {
      if (f.size > MAX_SIZE) {
        errs.push(`${f.name}: máx ${MAX_SIZE_MB} MB`);
        return;
      }
      fd.append("files", f);
      count++;
    });
    setError(errs.length ? errs.join(" · ") : null);
    if (count === 0) return;

    startTransition(async () => {
      const res = await uploadLoanAttachments(loanId, fd);
      if (res && "error" in res) setError(res.error ?? "Erro ao enviar");
      else if (res && "warning" in res && res.warning) setError(res.warning);
    });
  }

  async function openAtt(att: LoanAttachment) {
    // Montar o endereço não falha mais (é só um caminho para /api/arquivo). Se o
    // arquivo não estiver lá, quem avisa é a própria rota, ao abrir.
    const res = await getLoanAttachmentSignedUrl(att.storage_path);
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  function removeAtt(att: LoanAttachment) {
    if (!confirm("Remover este comprovante?")) return;
    startTransition(async () => {
      const res = await deleteLoanAttachment(att.id);
      if (res && "error" in res) setError(res.error ?? "Erro ao remover");
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          Comprovantes
        </p>
        {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-produmar-500" />}
      </div>

      {/* Botões de upload */}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => cameraRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
        >
          <Camera className="w-4 h-4" />
          Câmera
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
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
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

      {attachments.length === 0 ? (
        <p className="text-[10px] text-slate-400 dark:text-slate-500">
          Print do PIX/transferência, foto ou PDF · até {MAX_SIZE_MB} MB cada
        </p>
      ) : (
        <div className="space-y-1.5">
          {attachments.map((att) => (
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
              <button
                type="button"
                onClick={() => openAtt(att)}
                title="Abrir"
                className="p-1.5 text-slate-400 hover:text-produmar-600 dark:hover:text-produmar-400"
              >
                <ExternalLink className="w-4 h-4" />
              </button>
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
