"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * O PDF NA TELA, PÁGINA POR PÁGINA.
 *
 * O Safari do iPhone, dentro de uma janela, mostra só a PRIMEIRA página de um
 * PDF — e a assinatura fica no fim. Aqui cada página é desenhada como imagem
 * pelo pdf.js (o leitor de PDF do Firefox), igual em qualquer aparelho. A
 * biblioteca só é baixada quando há um PDF para mostrar. Versão "legacy":
 * a que funciona também em iPhone mais antigo.
 */
async function desenharPaginas(
  bytes: Uint8Array,
  alvo: HTMLElement,
  opcoes: { largura: number; nitidez: number; classe: string },
  vivo: () => boolean
) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // o ajudante do pdf.js vai pronto em /public: o minificador do Next não
  // consegue processar esse arquivo (quebra o build). Trocou a versão do
  // pdfjs-dist? Copie o novo legacy/build/pdf.worker.min.mjs com o nome novo.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker-4.10.38.min.mjs";
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  for (let n = 1; n <= pdf.numPages; n++) {
    if (!vivo()) return;
    const pagina = await pdf.getPage(n);
    const escala = opcoes.largura / pagina.getViewport({ scale: 1 }).width;
    const vp = pagina.getViewport({ scale: escala * opcoes.nitidez });
    const canvas = document.createElement("canvas");
    canvas.width = vp.width;
    canvas.height = vp.height;
    canvas.className = opcoes.classe;
    await pagina.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
    if (!vivo()) return;
    alvo.appendChild(canvas);
  }
}

/**
 * As páginas do PDF como imagens (para a tela de tocar onde vai a
 * assinatura). `proporcao` = altura ÷ largura da página.
 */
export async function paginasComoImagens(
  bytes: Uint8Array,
  largura: number
): Promise<{ src: string; proporcao: number }[]> {
  const alvo = document.createElement("div");
  await desenharPaginas(bytes, alvo, { largura, nitidez: Math.min(window.devicePixelRatio || 1, 2), classe: "" }, () => true);
  return [...alvo.querySelectorAll("canvas")].map((c) => ({
    src: c.toDataURL("image/jpeg", 0.85),
    proporcao: c.height / c.width,
  }));
}

/** Na janela do "PDF assinado": as páginas numa caixa com rolagem. */
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
      await desenharPaginas(
        new Uint8Array(await arquivo.arrayBuffer()),
        alvo,
        {
          largura: alvo.clientWidth || 600,
          nitidez: Math.min(window.devicePixelRatio || 1, 2),
          classe: "block w-full bg-white shadow border border-slate-200 mb-3",
        },
        () => vivo
      );
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

/**
 * Na IMPRESSÃO de um documento já assinado: as folhas SÃO o PDF assinado —
 * na tela e no papel (o "Imprimir" imprime o que tem o carimbo, não a versão
 * sem assinatura). Cada página do PDF vira uma folha A4 inteira.
 */
export function FolhasDoPdfAssinado({ url }: { url: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<"carregando" | "pronto" | "erro">("carregando");

  useEffect(() => {
    let vivo = true;
    const alvo = caixa.current;
    if (!alvo) return;
    alvo.innerHTML = "";
    setEstado("carregando");
    (async () => {
      const r = await fetch(url, { credentials: "same-origin" });
      if (!r.ok) throw new Error("PDF assinado não encontrado");
      await desenharPaginas(
        new Uint8Array(await r.arrayBuffer()),
        alvo,
        // 794px = A4 na tela; ×2 para o papel sair nítido
        { largura: 794, nitidez: 2, classe: "pagina-pdf" },
        () => vivo
      );
      if (vivo) setEstado("pronto");
    })().catch(() => vivo && setEstado("erro"));
    return () => {
      vivo = false;
    };
  }, [url]);

  return (
    <>
      <style>{`
        .pagina-pdf { display: block; width: 100%; max-width: 794px; height: auto; margin: 24px auto; background: white; box-shadow: 0 10px 25px rgba(0,0,0,.15); }
        @media print {
          @page { size: A4; margin: 0; }
          .pagina-pdf { width: 210mm; max-width: none; height: 297mm; margin: 0; box-shadow: none; break-after: page; }
          .pagina-pdf:last-child { break-after: auto; }
        }
      `}</style>
      {estado === "carregando" && (
        <p className="no-print flex items-center justify-center gap-2 py-16 text-sm text-slate-500 font-sans">
          <Loader2 className="w-4 h-4 animate-spin" />
          Abrindo o PDF assinado…
        </p>
      )}
      {estado === "erro" && (
        <p className="no-print py-16 text-center text-sm text-red-600 font-sans">
          Não foi possível abrir o PDF assinado. Use &quot;Ver PDF assinado&quot; acima.
        </p>
      )}
      <div ref={caixa} className="px-2 sm:px-0" />
    </>
  );
}
