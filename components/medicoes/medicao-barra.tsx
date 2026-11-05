"use client";

import { CompartilharPdf } from "@/components/ui/compartilhar-pdf";
import { gerarMedicaoPdf, type MedicaoParaPdf } from "@/lib/medicao-pdf";

/** A barra de cima da medição impressa — não sai no papel. Compartilha o PDF ou imprime. */
export function MedicaoBarra({ medicao }: { medicao: MedicaoParaPdf }) {
  return (
    <>
      <div
        className="no-print fixed inset-x-0 top-0 z-50 flex flex-wrap items-center justify-between gap-2 bg-produmar-700 px-4 pb-3 text-white shadow-lg sm:px-6"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <span className="text-sm font-semibold">Medição do lote</span>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            onClick={() => {
              if (window.history.length > 1) window.history.back();
              else window.close();
            }}
            className="text-sm opacity-80 transition-opacity hover:opacity-100"
          >
            ← Voltar
          </button>
          <CompartilharPdf variante="barra" chave={JSON.stringify(medicao)} gerar={() => gerarMedicaoPdf(medicao)} />
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-produmar-700 shadow transition-colors hover:bg-produmar-50"
          >
            🖨 Imprimir
          </button>
        </div>
      </div>
      <div className="no-print" style={{ height: "calc(4.5rem + env(safe-area-inset-top))" }} />
    </>
  );
}
