"use client";

import { useMemo } from "react";
import { montarAnexo, type AnexoParaFolha, type Trecho } from "@/lib/anexo-mobilia";
import { gerarAnexoMobiliaPdf } from "@/lib/anexo-mobilia-pdf";
import { CompartilharPdf } from "@/components/ui/compartilhar-pdf";
import type { RentalContractView } from "@/lib/types";

/**
 * O ANEXO DE MOBÍLIA IMPRESSO — a folha do modelo do Word (com a moldura),
 * com os dados do contrato. O mesmo conteúdo vira PDF.
 */
export function AnexoMobiliaPrint({
  anexo,
  contrato,
  modeloAluguel,
}: {
  anexo: AnexoParaFolha;
  contrato: RentalContractView;
  modeloAluguel: string | null;
}) {
  const a = useMemo(() => montarAnexo(anexo, contrato, modeloAluguel), [anexo, contrato, modeloAluguel]);

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          html, body { background: white !important; }
          @page { size: A4; margin: 9mm; }
          .doc { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
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
        <span className="font-semibold text-sm truncate min-w-0">Anexo de mobília · {contrato.tenant_name}</span>
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
          <CompartilharPdf variante="barra" chave={JSON.stringify(a)} gerar={() => gerarAnexoMobiliaPdf(a)} />
          <button
            onClick={() => window.print()}
            className="bg-white text-produmar-700 font-semibold text-sm px-3 py-1.5 rounded-lg shadow hover:bg-produmar-50 transition-colors"
          >
            🖨 Imprimir
          </button>
        </div>
      </div>

      <div className="no-print" style={{ height: "calc(4.5rem + env(safe-area-inset-top))" }} />

      <div className="doc max-w-[794px] mx-auto my-6 shadow-xl p-3">
        <FolhaDoAnexo a={a} />
      </div>
    </>
  );
}

/** A folha: moldura, texto do modelo, a mobília por cômodo e as assinaturas. */
export function FolhaDoAnexo({ a }: { a: ReturnType<typeof montarAnexo> }) {
  return (
    <div className="border border-slate-800 px-8 py-7 text-[13px] leading-snug text-slate-900 space-y-2.5">
      <h1 className="text-center text-[15px] font-bold mb-4">{a.titulo}</h1>

      {a.partes.map((p, i) => (
        <Rico key={i} trechos={p} />
      ))}
      <p className="text-justify">{a.recebimento}</p>

      <div className="space-y-2 pt-1">
        {a.comodos.map((c) => (
          <div key={c.titulo} className="avoid-break">
            <p className="font-bold">{c.titulo}</p>
            <table className="w-full">
              <tbody>
                {c.itens.map((item, i) => (
                  <tr key={i} className="align-top">
                    <td className="pl-4 pr-2">{item.texto}</td>
                    <td className="w-[150px] whitespace-nowrap pr-2">{item.estado}</td>
                    <td className="w-[90px] whitespace-nowrap">
                      {item.valor && (
                        <span className="flex justify-between tabular-nums">
                          <span>R$</span>
                          <span>{item.valor.replace(/^R\$\s*/, "")}</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {a.observacoes && (
        <div className="pt-1">
          <p className="font-bold">Observações Gerais:</p>
          <p className="text-justify">{a.observacoes}</p>
        </div>
      )}

      <div className="avoid-break pt-4">
        <p className="text-center font-bold">{a.localEData}</p>
        {a.assinaturas.map((s, i) => (
          <div key={i} className="text-center max-w-[420px] mx-auto pt-[16mm]">
            <div className="border-t border-slate-800" />
            <p className="mt-1 font-bold text-[12px]">{s.nome}</p>
            {s.detalhe && <p className="text-[11px]">{s.detalhe}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Rico({ trechos }: { trechos: Trecho[] }) {
  return (
    <p className="text-justify">
      {trechos.map((t, i) => (t.negrito ? <strong key={i}>{t.texto}</strong> : <span key={i}>{t.texto}</span>))}
    </p>
  );
}
