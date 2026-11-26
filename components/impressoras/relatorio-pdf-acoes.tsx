"use client";

import { useEffect, useState } from "react";
import { Download, FileText, Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompartilharArquivo } from "@/components/ui/aviso-compartilhado";
import { dadosDoRelatorio } from "@/app/(app)/impressoras/actions";
import { gerarRelatorioImpressoesPdf, nomeDoArquivo } from "@/lib/relatorio-impressoes-pdf";

/**
 * O RELATÓRIO EM PDF, pronto para mandar.
 *
 * O PDF é montado assim que isto aparece — busca a fatura, gera o arquivo no
 * próprio celular — e só DEPOIS os botões ficam ativos. É de propósito: o
 * iPhone só deixa compartilhar arquivo dentro do toque do dedo, e se o toque
 * ainda tivesse que esperar a geração, o Safari recusaria o compartilhamento.
 * Com o arquivo pronto, o toque em "Compartilhar" abre direto o menu do
 * celular (WhatsApp, e-mail, Arquivos).
 */
export function RelatorioPdfAcoes({ billingId }: { billingId: string }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [podeCompartilhar, setPodeCompartilhar] = useState(false);

  useEffect(() => {
    let vivo = true;
    let criada: string | null = null;
    setArquivo(null);
    setUrl(null);
    setErro(null);
    (async () => {
      try {
        const r = await dadosDoRelatorio(billingId);
        if ("error" in r) throw new Error(r.error);
        const blob = await gerarRelatorioImpressoesPdf(r.dados);
        if (!vivo) return;
        const file = new File([blob], nomeDoArquivo(r.dados), { type: "application/pdf" });
        criada = URL.createObjectURL(blob);
        setArquivo(file);
        setUrl(criada);
        setPodeCompartilhar(
          typeof navigator !== "undefined" &&
            typeof navigator.canShare === "function" &&
            navigator.canShare({ files: [file] })
        );
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : "Não foi possível gerar o PDF");
      }
    })();
    return () => {
      vivo = false;
      if (criada) URL.revokeObjectURL(criada);
    };
  }, [billingId]);

  // depois de compartilhar, o aviso "Documento compartilhado"
  const { compartilhar: compartilharArquivo, aviso } = useCompartilharArquivo();
  function compartilhar() {
    if (arquivo) void compartilharArquivo(arquivo);
  }

  if (erro) {
    return (
      <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
        {erro}
      </p>
    );
  }

  if (!arquivo || !url) {
    return (
      <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-500 dark:text-slate-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        Gerando o relatório em PDF…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 truncate">
        <FileText className="w-3.5 h-3.5 flex-shrink-0" />
        {arquivo.name}
      </p>
      {podeCompartilhar && (
        <Button type="button" onClick={compartilhar} className="w-full h-12 text-base">
          <Share2 className="w-4 h-4" />
          Compartilhar o PDF
        </Button>
      )}
      {aviso}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        download={arquivo.name}
        className="flex items-center justify-center gap-2 w-full h-12 rounded-md border border-produmar-200 dark:border-slate-700 text-base font-medium text-produmar-700 dark:text-produmar-300 hover:bg-produmar-50 dark:hover:bg-slate-800 transition-colors"
      >
        <Download className="w-4 h-4" />
        Abrir / baixar o PDF
      </a>
    </div>
  );
}
