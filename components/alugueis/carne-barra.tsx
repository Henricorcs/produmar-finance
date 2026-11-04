"use client";

import { CompartilharPdf } from "@/components/ui/compartilhar-pdf";
import { gerarCarnePdf, type CarneParaPdf } from "@/lib/carne-pdf";

/** A barra de cima do carnê — não sai na impressão. Compartilha o PDF ou imprime. */
export function CarneBarra({ titulo, carne }: { titulo: string; carne: CarneParaPdf }) {
  return (
    <>
      <div
        className="no-print fixed top-0 inset-x-0 z-50 bg-produmar-700 text-white flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 pb-3 shadow-lg"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <span className="font-semibold text-sm">{titulo}</span>
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
            chave={JSON.stringify(carne)}
            gerar={() => gerarCarnePdf(carne)}
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
    </>
  );
}
