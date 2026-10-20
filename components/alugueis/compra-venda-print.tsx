"use client";

import { useMemo } from "react";
import {
  MARCA_ASSINATURAS,
  RE_ROTULO_COMPRA_VENDA,
  assinaturasDaCompraEVenda,
  nomeDoPdfDaCompraEVenda,
  paragrafosDaCompraEVenda,
} from "@/lib/compra-venda-contrato";
import { gerarContratoPdf } from "@/lib/contrato-pdf";
import { CompartilharPdf } from "@/components/ui/compartilhar-pdf";
import { AssinarComCertificado } from "@/components/ui/assinar-com-certificado";
import { FaixaAssinado, baixarAssinado } from "@/components/ui/faixa-assinado";
import { FolhasDoPdfAssinado } from "@/components/ui/visualizar-pdf";
import type { DocumentoAssinado, PropertyBuyer, PropertySaleContract } from "@/lib/types";

interface Props {
  contrato: PropertySaleContract;
  /** O modelo do contrato de aluguel — dele sai a qualificação da PRODUMAR. */
  modeloAluguel: string | null;
  /** Quem compra (migration 115). Vazio = a PRODUMAR. */
  comprador?: PropertyBuyer | null;
  /** O PDF assinado com certificado guardado (123). */
  assinado?: DocumentoAssinado | null;
}

/**
 * O CONTRATO DE COMPRA E VENDA IMPRESSO.
 *
 * Quem compra é a PRODUMAR, outra empresa ou uma pessoa física; o vendedor, o
 * imóvel e o preço vêm do que foi preenchido na tela. No contrato preenchido,
 * o que ficou em branco não sai; no "em branco", sai como linha para a caneta.
 * O mesmo conteúdo vira PDF para compartilhar.
 */
export function CompraVendaPrint({ contrato, modeloAluguel, comprador = null, assinado = null }: Props) {
  const paragrafos = useMemo(
    () => paragrafosDaCompraEVenda(contrato, modeloAluguel, comprador),
    [contrato, modeloAluguel, comprador]
  );
  const assinaturas = useMemo(
    () => assinaturasDaCompraEVenda(contrato, comprador, modeloAluguel),
    [contrato, comprador, modeloAluguel]
  );

  const titulo = paragrafos[0];
  const corpo = paragrafos.slice(1);
  const emBranco = contrato.id === "em-branco";

  /** O PDF — com os carimbos da assinatura com certificado, quando vier assinar. */
  const gerarPdf = (carimbos?: (string[] | null)[]) =>
    gerarContratoPdf({
      titulo,
      paragrafos: corpo,
      marcaAssinaturas: MARCA_ASSINATURAS,
      rotulo: RE_ROTULO_COMPRA_VENDA,
      assinaturas,
      nomeArquivo: nomeDoPdfDaCompraEVenda(contrato),
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
          Compra e venda
          {emBranco ? " · em branco" : contrato.seller_name ? ` · ${contrato.seller_name}` : ""}
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
            gerar={() =>
              assinado ? baixarAssinado(assinado.url, nomeDoPdfDaCompraEVenda(contrato)) : gerarPdf()
            }
          />
          {!emBranco && (
            <AssinarComCertificado
              assinaturas={assinaturas}
              gerar={gerarPdf}
              documento={{ tipo: "compra_venda", id: contrato.id }}
            />
          )}
          <button
            onClick={() => window.print()}
            className="bg-white text-produmar-700 font-semibold text-sm px-3 py-1.5 rounded-lg shadow hover:bg-produmar-50 transition-colors"
          >
            🖨 Imprimir
          </button>
        </div>
      </div>

      <div
        className="no-print"
        style={{ height: "calc(4.5rem + env(safe-area-inset-top))" }}
      />
      {assinado && <FaixaAssinado assinado={assinado} />}

      {/* A folha — assinada, é o próprio PDF assinado (o Imprimir imprime ele) */}
      {assinado ? <FolhasDoPdfAssinado url={assinado.url} /> : (
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
  const rotulo = texto.match(RE_ROTULO_COMPRA_VENDA);

  // A linha do "Cidade, data" fica centralizada, como no contrato de aluguel.
  const ehDataLocal = /^[^:]{3,60},\s*(\d{1,2}\s+de\s+\p{L}+\s+de\s+\d{4}|_+ de _+ de _+)\.?$/u.test(
    texto
  );
  if (ehDataLocal) {
    return <p className="text-center font-semibold pt-6 pb-2">{texto}</p>;
  }

  if (!rotulo) {
    return <p className="text-justify">{texto}</p>;
  }

  const marca = rotulo[0];
  return (
    <p className="text-justify">
      <strong>{marca}</strong>
      {texto.slice(marca.length)}
    </p>
  );
}

/**
 * O bloco de assinaturas: vendedor, cônjuge (quando entra no contrato), quem
 * compra e as duas testemunhas — são elas que fazem do contrato um título
 * executivo.
 */
function Assinaturas({ lista }: { lista: { nome: string; detalhe?: string }[] }) {
  return (
    <div className="avoid-break pt-4">
      {lista.map((a, i) => (
        <Linha key={i} nome={a.nome} detalhe={a.detalhe} />
      ))}
      <div className="grid grid-cols-2 gap-8">
        <Testemunha />
        <Testemunha />
      </div>
    </div>
  );
}

/**
 * Cada assinatura tem uns 3,5 cm livres acima da linha: é onde entra o carimbo
 * da assinatura digital do gov.br, que é bem maior que uma rubrica.
 */
function Linha({ nome, detalhe }: { nome: string; detalhe?: string }) {
  return (
    <div className="text-center max-w-[420px] mx-auto pt-[35mm]">
      <div className="border-t border-slate-800" />
      <p className="mt-1 font-bold text-[12px]">{nome}</p>
      {detalhe && <p className="text-[11px]">{detalhe}</p>}
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
