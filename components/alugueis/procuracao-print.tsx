"use client";

import { useMemo } from "react";
import {
  MARCA_ASSINATURAS,
  RE_ROTULO_PROCURACAO,
  assinaturasDaProcuracao,
  nomeDoPdfDaProcuracao,
  paragrafosDaProcuracao,
} from "@/lib/procuracao";
import { gerarContratoPdf } from "@/lib/contrato-pdf";
import { CompartilharPdf } from "@/components/ui/compartilhar-pdf";
import type { PowerOfAttorney } from "@/lib/types";

/**
 * A PROCURAÇÃO IMPRESSA — a mesma folha da compra e venda, sem testemunhas:
 * assinam o outorgante e o outorgado. O mesmo conteúdo vira PDF.
 */
export function ProcuracaoPrint({ procuracao }: { procuracao: PowerOfAttorney }) {
  const paragrafos = useMemo(() => paragrafosDaProcuracao(procuracao), [procuracao]);
  const assinaturas = useMemo(() => assinaturasDaProcuracao(procuracao), [procuracao]);

  const titulo = paragrafos[0];
  const corpo = paragrafos.slice(1);
  const emBranco = procuracao.id === "em-branco";

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          html, body { background: white !important; }
          @page { size: A4; margin: 18mm 16mm; }
          .doc { box-shadow: none !important; margin: 0 !important; }
          .avoid-break { break-inside: avoid; }
        }
        body { font-family: Arial, Helvetica, sans-serif; background: #f1f5f9; color: #0f172a; }
        .doc { background: white; }
      `}</style>

      {/* Barra de cima — não sai na impressão */}
      <div
        className="no-print fixed top-0 inset-x-0 z-50 bg-produmar-700 text-white flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 pb-3 shadow-lg"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <span className="font-semibold text-sm truncate min-w-0">
          Procuração
          {emBranco ? " · em branco" : procuracao.grantor_name ? ` · ${procuracao.grantor_name}` : ""}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => {
              if (window.history.length > 1) window.history.back();
              else window.close();
            }}
            className="text-sm opacity-80 hover:opacity-100 transition-opacity"
          >
            ← Voltar
          </button>
          <CompartilharPdf
            variante="barra"
            chave={JSON.stringify([paragrafos, assinaturas])}
            gerar={() =>
              gerarContratoPdf({
                titulo,
                paragrafos: corpo,
                marcaAssinaturas: MARCA_ASSINATURAS,
                rotulo: RE_ROTULO_PROCURACAO,
                assinaturas,
                nomeArquivo: nomeDoPdfDaProcuracao(procuracao),
                testemunhas: false,
              })
            }
          />
          <button
            onClick={() => window.print()}
            className="bg-white text-produmar-700 font-semibold text-sm px-3 py-1.5 rounded-lg shadow hover:bg-produmar-50 transition-colors"
          >
            🖨 Imprimir
          </button>
        </div>
      </div>

      <div className="no-print" style={{ height: "calc(4.5rem + env(safe-area-inset-top))" }} />

      {/* A folha */}
      <div className="doc max-w-[794px] mx-auto my-6 shadow-xl text-[13px] leading-relaxed text-slate-900">
        <div className="p-10 space-y-3">
          <h1 className="text-center text-[15px] font-bold underline mb-4">{titulo}</h1>

          {corpo.map((p, i) =>
            p === MARCA_ASSINATURAS ? (
              <div key={`assin-${i}`} className="avoid-break pt-4">
                {assinaturas.map((a, j) => (
                  // uns 3,5 cm livres acima da linha: o carimbo da assinatura do gov.br
                  <div key={j} className="text-center max-w-[420px] mx-auto pt-[35mm]">
                    <div className="border-t border-slate-800" />
                    <p className="mt-1 font-bold text-[12px]">{a.nome}</p>
                    {a.detalhe && <p className="text-[11px]">{a.detalhe}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <Paragrafo key={i} texto={p} />
            )
          )}
        </div>
      </div>
    </>
  );
}

function Paragrafo({ texto }: { texto: string }) {
  // A linha do "Cidade, data" fica centralizada.
  if (/^[^:]{3,60},\s*(\d{1,2}\s+de\s+\p{L}+\s+de\s+\d{4}|_+ de _+ de _+)\.?$/u.test(texto)) {
    return <p className="text-center font-semibold pt-6 pb-2">{texto}</p>;
  }
  const rotulo = texto.match(RE_ROTULO_PROCURACAO);
  if (!rotulo) return <p className="text-justify">{texto}</p>;
  return (
    <p className="text-justify">
      <strong>{rotulo[0]}</strong>
      {texto.slice(rotulo[0].length)}
    </p>
  );
}
