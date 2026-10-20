"use client";

import { BadgeCheck, ExternalLink } from "lucide-react";
import type { DocumentoAssinado } from "@/lib/types";

/**
 * "✓ Assinado digitalmente por ..." — embaixo da barra azul da impressão,
 * quando o documento já tem o PDF assinado guardado. Não sai no papel.
 */
export function FaixaAssinado({ assinado }: { assinado: DocumentoAssinado }) {
  const quando = new Date(assinado.assinadoEm).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Fortaleza",
  });
  const quem =
    assinado.assinantes.length > 1
      ? `${assinado.assinantes.slice(0, -1).join(", ")} e ${assinado.assinantes[assinado.assinantes.length - 1]}`
      : assinado.assinantes[0] ?? "certificado digital";
  return (
    <div className="no-print max-w-[794px] mx-auto mt-4 px-4 sm:px-0 font-sans">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
        <BadgeCheck className="w-4 h-4 flex-shrink-0" />
        <span className="min-w-0 flex-1">
          <strong>Assinado digitalmente</strong> por {quem} em {quando}. O &quot;Compartilhar
          PDF&quot; manda o assinado. Se o documento for editado, a assinatura é descartada.
        </span>
        <a
          href={assinado.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Ver PDF assinado
        </a>
      </div>
    </div>
  );
}

/** Busca o PDF assinado guardado, para o botão de compartilhar. */
export async function baixarAssinado(url: string, nome: string): Promise<File> {
  const r = await fetch(url, { credentials: "same-origin" });
  if (!r.ok) throw new Error("PDF assinado não encontrado");
  return new File([await r.blob()], nome.replace(/\.pdf$/i, "") + "-assinado.pdf", { type: "application/pdf" });
}
