"use client";

import { useMemo } from "react";
import {
  ASSINA_PELA_PRODUMAR,
  MARCA_ASSINATURAS,
  paragrafosDaCompraEVenda,
  temConjuge,
} from "@/lib/compra-venda-contrato";
import type { PropertySaleContract } from "@/lib/types";

/**
 * O rótulo que abre o parágrafo ("VENDEDOR:", "CLÁUSULA TERCEIRA – DA POSSE:")
 * sai em negrito, como no contrato de aluguel. O resto do parágrafo segue normal.
 */
const RE_ROTULO =
  /^(VENDEDOR|COMPRADORA|CÔNJUGE DO VENDEDOR(?: \(se houver\))?|CLÁUSULA [^:]{1,60}|PARÁGRAFO [^:]{1,40}):/;

interface Props {
  contrato: PropertySaleContract;
  /** O modelo do contrato de aluguel — dele sai a qualificação da PRODUMAR. */
  modeloAluguel: string | null;
}

/**
 * O CONTRATO DE COMPRA E VENDA IMPRESSO.
 *
 * A PRODUMAR é sempre a compradora; o vendedor, o imóvel e o preço vêm do que
 * foi preenchido na tela. O que ficou em branco sai como linha para completar
 * à caneta.
 */
export function CompraVendaPrint({ contrato, modeloAluguel }: Props) {
  const paragrafos = useMemo(
    () => paragrafosDaCompraEVenda(contrato, modeloAluguel),
    [contrato, modeloAluguel]
  );

  const titulo = paragrafos[0];
  const corpo = paragrafos.slice(1);
  const emBranco = contrato.id === "em-branco";

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
        body { font-family: 'Times New Roman', Georgia, serif; background: #f1f5f9; color: #0f172a; }
        .doc { background: white; }
      `}</style>

      {/* Barra de cima — não sai na impressão */}
      <div
        className="no-print fixed top-0 inset-x-0 z-50 bg-produmar-700 text-white flex items-center justify-between px-6 pb-3 shadow-lg"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <span className="font-semibold text-sm truncate">
          Compra e venda
          {emBranco ? " · em branco" : contrato.seller_name ? ` · ${contrato.seller_name}` : ""}
        </span>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => {
              if (window.history.length > 1) window.history.back();
              else window.close();
            }}
            className="text-sm opacity-80 hover:opacity-100 transition-opacity"
          >
            ← Voltar
          </button>
          <button
            onClick={() => window.print()}
            className="bg-white text-produmar-700 font-semibold text-sm px-4 py-1.5 rounded-lg shadow hover:bg-produmar-50 transition-colors"
          >
            🖨 Imprimir / Salvar PDF
          </button>
        </div>
      </div>

      <div
        className="no-print"
        style={{ height: "calc(3.5rem + env(safe-area-inset-top))" }}
      />

      {/* A folha */}
      <div className="doc max-w-[794px] mx-auto my-6 shadow-xl text-[13px] leading-relaxed text-slate-900">
        <div className="p-10 space-y-3">
          <h1 className="text-center text-[15px] font-bold underline mb-4">{titulo}</h1>

          {corpo.map((p, i) =>
            p === MARCA_ASSINATURAS ? (
              <Assinaturas key={`assin-${i}`} contrato={contrato} />
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
  const rotulo = texto.match(RE_ROTULO);

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
 * O bloco de assinaturas: vendedor, cônjuge (quando entra no contrato), a
 * PRODUMAR e as duas testemunhas — são elas que fazem do contrato um título
 * executivo.
 */
function Assinaturas({ contrato }: { contrato: PropertySaleContract }) {
  const conjuge = temConjuge(contrato);
  return (
    <div className="avoid-break pt-10 space-y-10">
      <Linha
        nome={contrato.seller_name || "VENDEDOR"}
        detalhe={
          contrato.seller_document
            ? `VENDEDOR · CPF/CNPJ nº ${contrato.seller_document}`
            : contrato.seller_name
              ? "VENDEDOR"
              : undefined
        }
      />
      {conjuge && (
        <Linha
          nome={contrato.spouse_name || "CÔNJUGE DO VENDEDOR"}
          detalhe={
            contrato.spouse_document
              ? `CÔNJUGE · CPF nº ${contrato.spouse_document}`
              : contrato.spouse_name
                ? "CÔNJUGE DO VENDEDOR"
                : undefined
          }
        />
      )}
      <Linha
        nome="PRODUMAR SERVIÇOS LTDA"
        detalhe={`COMPRADORA · por ${ASSINA_PELA_PRODUMAR}, sócia administradora`}
      />
      <div className="grid grid-cols-2 gap-8 pt-4">
        <Testemunha />
        <Testemunha />
      </div>
    </div>
  );
}

function Linha({ nome, detalhe }: { nome: string; detalhe?: string }) {
  return (
    <div className="text-center max-w-[380px] mx-auto">
      <div className="border-t border-slate-800" />
      <p className="mt-1 font-bold text-[12px]">{nome}</p>
      {detalhe && <p className="text-[11px]">{detalhe}</p>}
    </div>
  );
}

function Testemunha() {
  return (
    <div className="text-[11px] space-y-1">
      <div className="border-t border-slate-800" />
      <p className="font-bold text-[12px] text-center">Testemunha</p>
      <p>Nome: ______________________________</p>
      <p>CPF: _______________________________</p>
    </div>
  );
}
