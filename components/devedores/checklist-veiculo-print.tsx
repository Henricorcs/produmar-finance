"use client";

import { formatDate } from "@/lib/utils";
import {
  ITENS_DO_CHECKLIST as ITENS,
  NIVEIS_DE_COMBUSTIVEL as NIVEIS_COMBUSTIVEL,
  REPRESENTANTE_DO_VENDEDOR,
  VENDEDOR_DO_CHECKLIST as VENDEDOR,
  ehCnpjDoComprador,
  localEDataDoChecklist,
} from "@/lib/checklist-veiculo";
import { gerarChecklistVeiculoPdf } from "@/lib/checklist-veiculo-pdf";
import { CompartilharPdf } from "@/components/ui/compartilhar-pdf";
import type { VehicleDeliveryChecklist } from "@/lib/types";

/**
 * A FOLHA DO CHECKLIST — cabe numa A4 só: comprador, veículo, a tabela dos
 * itens, combustível, avarias, observações, a declaração de recebimento e as
 * duas assinaturas. O que não foi preenchido no sistema sai com a linha para
 * completar à mão.
 */
export function ChecklistVeiculoPrint({ checklist: c }: { checklist: VehicleDeliveryChecklist }) {
  const ehCnpj = ehCnpjDoComprador(c);
  const veiculo = [c.vehicle_model, c.vehicle_plate && `placa ${c.vehicle_plate}`].filter(Boolean).join(", ");

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          html, body { background: white !important; }
          @page { size: A4; margin: 8mm 10mm; }
          /* folha só: tudo encolhe um pouco e nada se parte em duas páginas */
          html, body { height: auto !important; }
          .doc { zoom: 0.9; break-inside: avoid; page-break-inside: avoid; }
          .doc { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
          .doc-inner { padding: 0 !important; }
        }
        body { font-family: Arial, Helvetica, sans-serif; background: #f1f5f9; color: #0f172a;
               -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .doc { background: white; }
        .ck td, .ck th { border: 1px solid #334155; padding: 2px 5px; }
        .caixa { display: inline-block; width: 11px; height: 11px; border: 1.5px solid #0f172a; vertical-align: middle; }
        .linha { border-bottom: 1px solid #334155; height: 15px; }
      `}</style>

      {/* Barra de cima — não sai na impressão */}
      <div
        className="no-print fixed top-0 inset-x-0 z-50 bg-produmar-700 text-white flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 pb-3 shadow-lg"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <span className="font-semibold text-sm truncate min-w-0">Checklist de entrega · {c.buyer_name}</span>
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
          {/* o PDF da mesma folha, para mandar pelo WhatsApp ou e-mail */}
          <CompartilharPdf
            variante="barra"
            chave={`${c.id}-${c.updated_at}`}
            gerar={() => gerarChecklistVeiculoPdf(c)}
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

      {/* A folha: larga como a A4 no computador; no celular encolhe junto */}
      <div className="doc max-w-[794px] mx-auto my-4 sm:my-6 shadow-xl text-[10.5px] leading-tight text-slate-900">
        <div className="doc-inner p-4 sm:p-8 space-y-2">
          <header className="text-center border-b-2 border-slate-800 pb-2">
            <h1 className="text-[15px] font-bold tracking-wide">CHECKLIST DE ENTREGA DE VEÍCULO</h1>
            <p className="text-[11px] text-slate-600">
              Vendedor: {VENDEDOR} · Entrega em {formatDate(c.delivery_date)}
            </p>
          </header>

          {/* COMPRADOR */}
          <section>
            <h2 className="text-[11px] font-bold bg-slate-100 px-2 py-1 border border-slate-700 border-b-0">
              COMPRADOR
            </h2>
            <table className="ck w-full border-collapse">
              <tbody>
                <tr>
                  <Celula rotulo="Nome" valor={c.buyer_name} colSpan={3} />
                </tr>
                <tr>
                  <Celula rotulo={ehCnpj ? "CNPJ" : "CPF/CNPJ"} valor={c.buyer_document} />
                  <Celula rotulo="RG / órgão" valor={c.buyer_rg} />
                  <Celula rotulo="Telefone" valor={c.buyer_phone} />
                </tr>
                <tr>
                  <Celula rotulo="Endereço" valor={c.buyer_address} colSpan={3} />
                </tr>
              </tbody>
            </table>
          </section>

          {/* VEÍCULO */}
          <section>
            <h2 className="text-[11px] font-bold bg-slate-100 px-2 py-1 border border-slate-700 border-b-0">
              VEÍCULO
            </h2>
            <table className="ck w-full border-collapse">
              <tbody>
                <tr>
                  <Celula rotulo="Marca / modelo" valor={c.vehicle_model} colSpan={2} />
                  <Celula rotulo="Placa" valor={c.vehicle_plate} />
                  <Celula rotulo="Ano" valor={c.vehicle_year} />
                </tr>
                <tr>
                  <Celula rotulo="Cor" valor={c.vehicle_color} />
                  <Celula rotulo="Chassi" valor={c.vehicle_chassis} colSpan={2} />
                  <Celula rotulo="Km na entrega" valor={c.vehicle_km} />
                </tr>
                <tr>
                  <Celula rotulo="Renavam" valor={c.vehicle_renavam} colSpan={4} />
                </tr>
              </tbody>
            </table>
          </section>

          {/* OS ITENS */}
          <section>
            <table className="ck w-full border-collapse">
              <thead>
                <tr className="bg-slate-100 text-[11px]">
                  <th className="text-left">ITEM CONFERIDO</th>
                  <th className="w-[44px]">SIM</th>
                  <th className="w-[44px]">NÃO</th>
                  <th className="text-left w-[42%]">OBSERVAÇÃO</th>
                </tr>
              </thead>
              <tbody>
                {ITENS.map((item) => (
                  <tr key={item} style={{ height: "17px" }}>
                    <td>{item}</td>
                    <td className="text-center">
                      <span className="caixa" />
                    </td>
                    <td className="text-center">
                      <span className="caixa" />
                    </td>
                    <td />
                  </tr>
                ))}
                <tr style={{ height: "20px" }}>
                  <td className="font-semibold">Nível de combustível</td>
                  <td colSpan={3}>
                    <span className="flex flex-wrap gap-x-4 gap-y-1">
                      {NIVEIS_COMBUSTIVEL.map((n) => (
                        <span key={n} className="whitespace-nowrap">
                          <span className="caixa mr-1" /> {n}
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* AVARIAS E OBSERVAÇÕES */}
          <section className="space-y-1">
            <p className="font-bold text-[11px]">AVARIAS ENCONTRADAS:</p>
            <div className="linha" />
            <div className="linha" />
            <p className="font-bold text-[11px] pt-1">OBSERVAÇÕES:</p>
            {c.notes ? <p className="whitespace-pre-wrap">{c.notes}</p> : <div className="linha" />}
            <div className="linha" />
          </section>

          {/* DECLARAÇÃO */}
          <section className="pt-1">
            <p className="text-justify">
              Declaro, para os devidos fins, que recebi de <strong>{VENDEDOR}</strong> o veículo acima descrito
              {veiculo ? ` (${veiculo})` : ""}, nas condições indicadas neste checklist, que conferi pessoalmente
              item por item no ato da entrega, assumindo a partir desta data e hora a responsabilidade pela sua
              guarda e uso.
            </p>
            <p className="text-center font-semibold pt-2">
              {localEDataDoChecklist(c)}
            </p>
          </section>

          {/* ASSINATURAS */}
          <section className="grid grid-cols-2 gap-8 pt-[13mm] text-center text-[11px]" style={{ breakInside: "avoid" }}>
            <div>
              <div className="border-t border-slate-800" />
              <p className="mt-1 font-bold">{VENDEDOR}</p>
              <p>VENDEDOR · representada por {REPRESENTANTE_DO_VENDEDOR}</p>
            </div>
            <div>
              <div className="border-t border-slate-800" />
              <p className="mt-1 font-bold">{c.buyer_name}</p>
              <p>
                COMPRADOR
                {c.buyer_document ? ` · ${ehCnpj ? "CNPJ" : "CPF"} nº ${c.buyer_document}` : ""}
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

/** Uma caixinha do quadro: o rótulo pequeno em cima e o valor (ou em branco). */
function Celula({ rotulo, valor, colSpan }: { rotulo: string; valor: string | null; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className="align-top">
      <span className="block text-[9px] uppercase text-slate-500 leading-tight">{rotulo}</span>
      <span className="block font-semibold min-h-[15px] break-words">{valor?.trim() || " "}</span>
    </td>
  );
}
