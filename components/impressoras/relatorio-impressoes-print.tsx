"use client";

import { formatBRL, formatDate } from "@/lib/utils";
import { formatPaginas, formatPreco, nomeDoMes } from "@/lib/impressoras";
import type { Printer, PrinterBilling, PrinterContract, PrinterReading } from "@/lib/types";

interface Props {
  billing: PrinterBilling;
  contract: PrinterContract | null;
  readings: PrinterReading[];
  printers: Printer[];
}

/** Dinheiro sem o "R$" — na planilha o símbolo fica na coluna ao lado. */
function valor(n: number): string {
  return formatBRL(n).replace(/^R\$\s?/, "");
}

/**
 * O RELATÓRIO MENSAL DE IMPRESSÕES — folha A4 deitada.
 *
 * Copia o desenho da planilha que já ia para o cliente: uma linha por
 * impressora com as duas leituras, as páginas, a mensalidade e o valor; embaixo,
 * as datas da leitura com os totais, a franquia do contrato descontada e o total
 * da fatura. Os números são os que ficaram gravados no fechamento do mês.
 */
export function RelatorioImpressoesPrint({ billing, contract, readings, printers }: Props) {
  const porId = new Map(printers.map((p) => [p.id, p]));
  const linhas = readings
    .map((r) => {
      const p = porId.get(r.printer_id);
      const pages = Number(r.current_reading) - Number(r.previous_reading);
      return { r, p, pages, valor: Math.round(pages * Number(r.page_price) * 100) / 100 };
    })
    .sort((a, b) => (a.p?.unit ?? 0) - (b.p?.unit ?? 0));

  const franquiaAplicada = Math.min(Number(billing.franchise_pages), Number(billing.total_pages));
  const contratoTexto = [
    contract?.contract_number ? `CONTRATO Nº ${contract.contract_number}` : null,
    contract?.client_name ?? null,
  ]
    .filter(Boolean)
    .join("/");

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          html, body { background: white !important; }
          @page { size: A4 landscape; margin: 10mm; }
          .folha { box-shadow: none !important; margin: 0 !important; }
        }
        body { background: #f1f5f9; color: #0f172a; font-family: Arial, Helvetica, sans-serif; }
        .rel th, .rel td { border: 1px solid #0f172a; padding: 3px 8px; }
        .rel th { font-size: 12px; font-weight: 700; }
        .rel td { font-size: 14px; }
      `}</style>

      <div
        className="no-print fixed top-0 inset-x-0 z-50 bg-produmar-700 text-white flex items-center justify-between px-6 pb-3 shadow-lg"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <span className="font-semibold text-sm capitalize">
          Impressões · {contract?.client_name} · {nomeDoMes(billing.competencia)}
        </span>
        <div className="flex items-center gap-3">
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
      <div className="no-print" style={{ height: "calc(3.5rem + env(safe-area-inset-top))" }} />

      <div className="folha bg-white max-w-[1123px] mx-auto my-6 shadow-xl p-6 overflow-x-auto">
        <table className="rel w-full border-collapse tabular-nums">
          <thead>
            <tr>
              <th colSpan={2} className="text-left !border-r-0" style={{ fontSize: 20, color: "#1d4ed8" }}>
                {contract?.issuer_name ?? ""}
              </th>
              <th colSpan={7} className="!border-l-0 text-center" style={{ fontSize: 20, letterSpacing: "0.35em", fontWeight: 400 }}>
                RELATÓRIO MENSAL DE IMPRESSÕES
              </th>
            </tr>
            <tr>
              <th>UNID</th>
              <th>NÚMERO DE SÉRIE</th>
              <th>MOD IMPRESSORA</th>
              <th>
                LEITURA
                <br />
                ANTERIOR
              </th>
              <th>
                LEITURA
                <br />
                ATUAL
              </th>
              <th>
                PÁGINAS
                <br />
                IMPRESSAS
              </th>
              <th>MENSALIDADE</th>
              <th>IMPRESSÃO</th>
              <th>
                VALOR
                <br />
                IMPRESSÕES
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ r, p, pages, valor: v }) => (
              <tr key={r.id}>
                <td className="text-center font-bold">{p?.unit}</td>
                <td className="text-center">{p?.serial_number}</td>
                <td className="text-center">{p?.model}</td>
                <td className="text-right">{r.previous_reading}</td>
                <td className="text-right">{r.current_reading}</td>
                <td className="text-right">{pages}</td>
                <td className="text-right">{valor(Number(r.monthly_fee))}</td>
                <td className="text-right">{formatPreco(Number(r.page_price))}</td>
                <td className="text-right">{valor(v)}</td>
              </tr>
            ))}

            <tr className="font-bold">
              <td colSpan={3} className="text-right">DATA DA LEITURA</td>
              <td className="text-right">{billing.previous_date ? formatDate(billing.previous_date) : ""}</td>
              <td className="text-right">{formatDate(billing.reading_date)}</td>
              <td className="text-right">{billing.total_pages}</td>
              <td>
                <span className="flex justify-between gap-2">
                  <span>R$</span>
                  <span>{valor(Number(billing.total_fees))}</span>
                </span>
              </td>
              <td colSpan={2}>
                <span className="flex justify-between gap-2">
                  <span>R$</span>
                  <span>{valor(Number(billing.total_prints))}</span>
                </span>
              </td>
            </tr>

            <tr className="font-bold">
              <td colSpan={5} className="text-right">
                FRANQUIA DE PÁGINAS IMPRESSAS{contratoTexto ? ` (${contratoTexto})` : ""}
              </td>
              <td className="text-right">{franquiaAplicada}</td>
              <td>
                <span className="flex justify-between gap-2">
                  <span>R$</span>
                  <span>{formatPreco(Number(billing.franchise_price))}</span>
                </span>
              </td>
              <td colSpan={2}>
                <span className="flex justify-between gap-2">
                  <span>R$</span>
                  <span>{valor(Number(billing.franchise_amount))}</span>
                </span>
              </td>
            </tr>

            <tr className="font-bold">
              <td colSpan={3} />
              <td colSpan={3} className="text-center" style={{ letterSpacing: "0.35em" }}>
                TOTAL DA FATURA
              </td>
              <td colSpan={3}>
                <span className="flex justify-between gap-2">
                  <span>R$</span>
                  <span>{valor(Number(billing.total_amount))}</span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <p className="mt-3 text-[11px] text-slate-500">
          Total = mensalidades ({formatBRL(Number(billing.total_fees))}) + impressões (
          {formatBRL(Number(billing.total_prints))}) − franquia de {formatPaginas(franquiaAplicada)}{" "}
          páginas ({formatBRL(Number(billing.franchise_amount))})
          {billing.due_date ? ` · vencimento ${formatDate(billing.due_date)}` : ""}
        </p>
      </div>
    </>
  );
}
