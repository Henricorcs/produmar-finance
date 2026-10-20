"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * O PDF NA TELA, PÁGINA POR PÁGINA — para conferir antes de compartilhar.
 *
 * O Safari do iPhone, dentro de uma janela, mostra só a PRIMEIRA página de um
 * PDF — e a assinatura fica no fim. Aqui cada página é desenhada como imagem
 * pelo pdf.js (o leitor de PDF do Firefox), igual em qualquer aparelho. A
 * biblioteca só é baixada quando há um PDF para mostrar. Versão "legacy":
 * a que funciona também em iPhone mais antigo.
 */
export function VisualizarPdf({ arquivo }: { arquivo: File }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<"carregando" | "pronto" | "erro">("carregando");

  useEffect(() => {
    let vivo = true;
    const alvo = caixa.current;
    if (!alvo) return;
    alvo.innerHTML = "";
    setEstado("carregando");

    (async () => {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      // o ajudante do pdf.js vai pronto em /public: o minificador do Next não
      // consegue processar esse arquivo (quebra o build). Trocou a versão do
      // pdfjs-dist? Copie o novo legacy/build/pdf.worker.min.mjs com o nome novo.
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker-4.10.38.min.mjs";
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
      const largura = alvo.clientWidth || 600;
      const nitidez = Math.min(window.devicePixelRatio || 1, 2);
      for (let n = 1; n <= pdf.numPages; n++) {
        if (!vivo) return;
        const pagina = await pdf.getPage(n);
        const escala = largura / pagina.getViewport({ scale: 1 }).width;
        const vp = pagina.getViewport({ scale: escala * nitidez });
        const canvas = document.createElement("canvas");
        canvas.width = vp.width;
        canvas.height = vp.height;
        canvas.style.width = "100%";
        canvas.style.display = "block";
        canvas.className = "bg-white shadow border border-slate-200 mb-3";
        await pagina.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
        if (!vivo) return;
        alvo.appendChild(canvas);
      }
      if (vivo) setEstado("pronto");
    })().catch(() => vivo && setEstado("erro"));

    return () => {
      vivo = false;
    };
  }, [arquivo]);

  return (
    <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2 max-h-[55vh] overflow-y-auto">
      {estado === "carregando" && (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          Abrindo o PDF assinado…
        </p>
      )}
      {estado === "erro" && (
        <p className="py-6 text-center text-sm text-slate-500">
          Não deu para mostrar o PDF aqui — ele está assinado do mesmo jeito; compartilhe e abra no
          aparelho para conferir.
        </p>
      )}
      <div ref={caixa} />
    </div>
  );
}
