"use client";

import { useMemo } from "react";
import {
  MARCA_ASSINATURAS,
  RE_ROTULO_CONFISSAO,
  assinaturasDaConfissao,
  nomeDoPdfDaConfissao,
  paragrafosDaConfissao,
  type DividaParaConfissao,
} from "@/lib/confissao-divida";
import { gerarContratoPdf } from "@/lib/contrato-pdf";
import { CompartilharPdf } from "@/components/ui/compartilhar-pdf";
import { AssinarComCertificado } from "@/components/ui/assinar-com-certificado";
import { FaixaAssinado, baixarAssinado } from "@/components/ui/faixa-assinado";
import { FolhasDoPdfAssinado } from "@/components/ui/visualizar-pdf";
import type { DocumentoAssinado } from "@/lib/types";

/**
 * A CONFISSÃO DE DÍVIDA IMPRESSA — a mesma folha dos contratos de Aluguéis:
 * assinam o devedor e a PRODUMAR, e duas testemunhas (são elas que fazem do
 * papel um título executivo). O mesmo conteúdo vira PDF para mandar, e a
 * PRODUMAR pode assinar com o certificado.
 */
export function ConfissaoPrint({
  divida,
  modeloAluguel,
  assinado = null,
}: {
  divida: DividaParaConfissao;
  /** O modelo do contrato de aluguel — dele sai a qualificação da PRODUMAR. */
  modeloAluguel: string | null;
  /** O PDF assinado com certificado guardado (123). */
  assinado?: DocumentoAssinado | null;
}) {
  const paragrafos = useMemo(() => paragrafosDaConfissao(divida, modeloAluguel), [divida, modeloAluguel]);
  const assinaturas = useMemo(() => assinaturasDaConfissao(divida.loan), [divida]);
  const titulo = paragrafos[0];
  const corpo = paragrafos.slice(1);
  const nomeArquivo = nomeDoPdfDaConfissao(divida.loan);

  /** O PDF — com os carimbos da assinatura com certificado, quando vier assinar. */
  const gerarPdf = (carimbos?: (string[] | null)[]) =>
    gerarContratoPdf({
      titulo,
      paragrafos: corpo,
      marcaAssinaturas: MARCA_ASSINATURAS,
      rotulo: RE_ROTULO_CONFISSAO,
      assinaturas,
      nomeArquivo,
      testemunhas: true,
      carimbos,
    });

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
          Confissão de dívida · {divida.loan.borrower_name}
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
            chave={assinado ? assinado.url : JSON.stringify([paragrafos, assinaturas])}
            gerar={() => (assinado ? baixarAssinado(assinado.url, nomeArquivo) : gerarPdf())}
          />
          <AssinarComCertificado
            assinaturas={assinaturas}
            gerar={gerarPdf}
            documento={{ tipo: "confissao_divida", id: divida.loan.id }}
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
      {assinado && <FaixaAssinado assinado={assinado} />}

      {/* A folha — assinada, é o próprio PDF assinado (o Imprimir imprime ele) */}
      {assinado ? (
        <FolhasDoPdfAssinado url={assinado.url} />
      ) : (
        <div className="doc max-w-[794px] mx-auto my-6 shadow-xl text-[13px] leading-relaxed text-slate-900">
          <div className="p-10 space-y-3">
            <h1 className="text-center text-[15px] font-bold underline mb-4">{titulo}</h1>
            {corpo.map((p, i) =>
              p === MARCA_ASSINATURAS ? (
                <Assinaturas key={`assin-${i}`} lista={assinaturas} />
              ) : (
                <Paragrafo key={i} texto={p} />
              )
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Paragrafo({ texto }: { texto: string }) {
  // A linha do "Cidade, data" fica centralizada.
  if (/^[^:]{3,60},\s*(\d{1,2}\s+de\s+\p{L}+\s+de\s+\d{4}|_+ de _+ de _+)\.?$/u.test(texto)) {
    return <p className="text-center font-semibold pt-6 pb-2">{texto}</p>;
  }
  // as parcelas da forma de pagamento, recuadas
  if (/^\d+ª parcela:/.test(texto)) return <p className="pl-6">{texto}</p>;
  const rotulo = texto.match(RE_ROTULO_CONFISSAO);
  if (!rotulo) return <p className="text-justify">{texto}</p>;
  return (
    <p className="text-justify">
      <strong>{rotulo[0]}</strong>
      {texto.slice(rotulo[0].length)}
    </p>
  );
}

/** Devedor, credora e as duas testemunhas — com elas o papel é título executivo. */
function Assinaturas({ lista }: { lista: { nome: string; detalhe?: string }[] }) {
  return (
    <div className="avoid-break pt-4">
      {lista.map((a, i) => (
        // uns 3,5 cm livres acima da linha: o carimbo da assinatura do gov.br
        <div key={i} className="text-center max-w-[420px] mx-auto pt-[35mm]">
          <div className="border-t border-slate-800" />
          <p className="mt-1 font-bold text-[12px]">{a.nome}</p>
          {a.detalhe && <p className="text-[11px]">{a.detalhe}</p>}
        </div>
      ))}
      <div className="grid grid-cols-2 gap-8">
        <Testemunha />
        <Testemunha />
      </div>
    </div>
  );
}

function Testemunha() {
  return (
    <div className="text-[11px] space-y-1 pt-[35mm]">
      <div className="border-t border-slate-800" />
      <p className="font-bold text-[12px] text-center">Testemunha</p>
      <p>Nome: ______________________________</p>
      <p>CPF: _______________________________</p>
    </div>
  );
}
