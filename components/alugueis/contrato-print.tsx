"use client";

import { useMemo } from "react";
import { camposDoContrato, preencherModelo } from "@/lib/alugueis-contrato";
import { gerarContratoPdf, paraNomeDeArquivo } from "@/lib/contrato-pdf";
import { CompartilharPdf } from "@/components/ui/compartilhar-pdf";
import type { RentalContractView } from "@/lib/types";

/** A linha que vira o bloco de assinaturas do fim do contrato. */
const MARCA_ASSINATURAS = "[[ASSINATURAS]]";

/**
 * O rótulo que abre o parágrafo ("CLÁUSULA TERCEIRA:", "LOCATÁRIO:") sai em
 * negrito, como no contrato de vocês. O resto do parágrafo segue normal.
 */
const RE_ROTULO =
  /^(LOCADOR|LOCATÁRIO|LOCADORA|CLÁUSULA [^:]{1,40}|PARÁGRAFO [^:]{1,40}|OBJETO):/;

interface Props {
  contrato: RentalContractView;
  /** O texto do modelo, ainda com os {{CAMPOS}}. */
  modelo: string;
  /** Nome de quem assina pela locadora. */
  assinaturaLocador?: string;
}

/**
 * O CONTRATO IMPRESSO.
 *
 * Pega o modelo de vocês, troca cada {{CAMPO}} pelo dado do contrato cadastrado
 * e monta a folha A4. O que era escrito à mão em vermelho agora sai digitado —
 * e o que ainda não foi preenchido vira uma linha para completar à caneta.
 */
export function ContratoPrint({
  contrato,
  modelo,
  assinaturaLocador = "NILMA PEREIRA DA COSTA",
}: Props) {
  const paragrafos = useMemo(() => {
    const preenchido = preencherModelo(modelo, camposDoContrato(contrato));
    return preenchido
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  }, [modelo, contrato]);

  const titulo = paragrafos[0] ?? "CONTRATO DE LOCAÇÃO";
  const corpo = paragrafos.slice(1);

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
        className="no-print fixed top-0 inset-x-0 z-50 bg-produmar-700 text-white flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 pb-3 shadow-lg"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <span className="font-semibold text-sm">
          Contrato · imóvel nº {contrato.property_code}
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
            chave={JSON.stringify(paragrafos)}
            gerar={() =>
              gerarContratoPdf({
                titulo,
                paragrafos: corpo,
                marcaAssinaturas: MARCA_ASSINATURAS,
                rotulo: RE_ROTULO,
                assinaturas: [
                  { nome: assinaturaLocador },
                  {
                    nome: contrato.tenant_name,
                    detalhe: contrato.tenant_document ? `CPF nº ${contrato.tenant_document}` : undefined,
                  },
                ],
                nomeArquivo: `contrato-locacao-${paraNomeDeArquivo(contrato.tenant_name) || "imovel"}.pdf`,
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

      <div
        className="no-print"
        style={{ height: "calc(4.5rem + env(safe-area-inset-top))" }}
      />

      {/* A folha */}
      <div className="doc max-w-[794px] mx-auto my-6 shadow-xl text-[13px] leading-relaxed text-slate-900">
        <div className="p-10 space-y-3">
          <h1 className="text-center text-[15px] font-bold underline mb-4">{titulo}</h1>

          {corpo.map((p, i) =>
            p === MARCA_ASSINATURAS ? (
              <Assinaturas
                key={`assin-${i}`}
                locador={assinaturaLocador}
                locatario={contrato.tenant_name}
                documento={contrato.tenant_document}
              />
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

  // A linha do "Cidade, data" fica centralizada, como no contrato de vocês.
  const ehDataLocal = /^[^:]{3,60},\s*\d{1,2}\s+de\s+\p{L}+\s+de\s+\d{4}\.?$/u.test(texto);
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

/** O bloco de assinaturas: locadora, locatário e as duas testemunhas. */
function Assinaturas({
  locador,
  locatario,
  documento,
}: {
  locador: string;
  locatario: string;
  documento: string | null;
}) {
  return (
    <div className="avoid-break pt-4">
      <Linha nome={locador} />
      <Linha nome={locatario} detalhe={documento ? `CPF nº ${documento}` : undefined} />
      <div className="grid grid-cols-2 gap-8">
        <Linha nome="Testemunha" pequena />
        <Linha nome="Testemunha" pequena />
      </div>
    </div>
  );
}

function Linha({
  nome,
  detalhe,
  pequena,
}: {
  nome: string;
  detalhe?: string;
  pequena?: boolean;
}) {
  return (
    // uns 3,5 cm livres acima de cada linha: é onde entra o carimbo da
    // assinatura digital do gov.br, bem maior que uma rubrica
    <div className={pequena ? "text-center pt-[35mm]" : "text-center max-w-[420px] mx-auto pt-[35mm]"}>
      <div className="border-t border-slate-800" />
      <p className="mt-1 font-bold text-[12px]">{nome}</p>
      {detalhe && <p className="text-[11px]">{detalhe}</p>}
    </div>
  );
}
