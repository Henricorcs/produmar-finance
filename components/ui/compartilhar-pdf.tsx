"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompartilharArquivo } from "@/components/ui/aviso-compartilhado";

/**
 * COMPARTILHAR O PDF (WhatsApp, e-mail, Arquivos...).
 *
 * O PDF é gerado assim que isto aparece, e só DEPOIS o botão fica ativo. É de
 * propósito: o iPhone só deixa compartilhar arquivo dentro do toque do dedo —
 * se o toque ainda tivesse que esperar a geração, o Safari recusaria. Onde o
 * aparelho não sabe compartilhar arquivo (computador), o botão baixa o PDF.
 *
 * `chave` muda quando o conteúdo muda: aí o PDF é gerado de novo.
 */
export function CompartilharPdf({
  gerar,
  chave,
  variante = "bloco",
}: {
  gerar: () => Promise<File>;
  chave: string;
  /**
   * "barra" = botão branco da barra azul da impressão; "bloco" = largo, no
   * diálogo; "link" = pequeno, no meio de uma linha de lista.
   */
  variante?: "barra" | "bloco" | "link";
}) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const gerarRef = useRef(gerar);
  gerarRef.current = gerar;

  useEffect(() => {
    let vivo = true;
    let criada: string | null = null;
    setArquivo(null);
    setUrl(null);
    setErro(null);
    gerarRef
      .current()
      .then((f) => {
        if (!vivo) return;
        criada = URL.createObjectURL(f);
        setArquivo(f);
        setUrl(criada);
      })
      .catch((e) => {
        if (vivo) setErro(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
      });
    return () => {
      vivo = false;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [chave]);

  const podeCompartilhar =
    !!arquivo &&
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [arquivo] });

  // depois de compartilhar, o aviso "Documento compartilhado" (cancelar o
  // menu não avisa nada: o PDF continua para baixar)
  const { compartilhar: compartilharArquivo, aviso } = useCompartilharArquivo();
  function compartilhar() {
    if (arquivo) void compartilharArquivo(arquivo);
  }

  const estilo =
    variante === "barra"
      ? "bg-white text-produmar-700 font-semibold text-sm px-3 py-1.5 rounded-lg shadow hover:bg-produmar-50"
      : variante === "link"
        ? "text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 [&_svg]:w-3 [&_svg]:h-3"
        : "w-full h-12 rounded-md bg-produmar-600 text-white text-base font-medium hover:bg-produmar-700";

  if (erro) {
    return (
      <span className={cn("text-xs", variante === "barra" ? "text-white/80" : "text-red-600")}>
        PDF: {erro}
      </span>
    );
  }

  if (!arquivo || !url) {
    return (
      <span className={cn(estilo, "inline-flex items-center justify-center gap-1.5 opacity-70")}>
        <Loader2 className="w-4 h-4 animate-spin" />
        Gerando PDF…
      </span>
    );
  }

  if (podeCompartilhar) {
    return (
      <>
        <button
          type="button"
          onClick={compartilhar}
          className={cn(estilo, "inline-flex items-center justify-center gap-1.5 transition-colors")}
        >
          <Share2 className="w-4 h-4" />
          Compartilhar PDF
        </button>
        {aviso}
      </>
    );
  }

  return (
    <a
      href={url}
      download={arquivo.name}
      className={cn(estilo, "inline-flex items-center justify-center gap-1.5 transition-colors")}
    >
      <Download className="w-4 h-4" />
      Baixar PDF
    </a>
  );
}
