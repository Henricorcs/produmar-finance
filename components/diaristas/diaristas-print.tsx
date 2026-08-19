"use client";

import { formatBRL, formatDate } from "@/lib/utils";
import type { DiaristaDiaRow } from "@/lib/types";

interface Props {
  dias: DiaristaDiaRow[];
  from: string;
  to: string;
  /** Texto dos filtros usados (uma pessoa, uma obra) — sai no cabeçalho. */
  filterLabel?: string | null;
}

/** Um bloco do relatório: a pessoa, os dias dela e o total. */
interface Bloco {
  id: string;
  nome: string;
  pix: string | null;
  dias: DiaristaDiaRow[];
  total: number;
}

/**
 * O fechamento dos diaristas no período: um bloco por pessoa, com os dias que
 * ela veio, o que fez em cada um, a chave PIX e o total a pagar — mais o total
 * geral no fim. É a folha que o chefe leva para pagar.
 */
export function DiaristasPrint({ dias, from, to, filterLabel }: Props) {
  const porPessoa = new Map<string, Bloco>();
  for (const d of dias) {
    const key = d.diarista_id;
    const bloco = porPessoa.get(key) ?? {
      id: key,
      nome: d.diaristas?.name ?? "—",
      pix: d.diaristas?.pix_key ?? null,
      dias: [],
      total: 0,
    };
    bloco.dias.push(d);
    bloco.total += Number(d.daily_rate);
    porPessoa.set(key, bloco);
  }

  const blocos = [...porPessoa.values()].sort((a, b) => a.nome.localeCompare(b.nome));
  const totalGeral = blocos.reduce((s, b) => s + b.total, 0);
  const totalDias = dias.length;

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          html, body { background: white !important; }
          @page { size: A4 portrait; margin: 12mm; }
          .doc { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
          thead { display: table-header-group; }
          tr, .bloco { break-inside: avoid; }
        }
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; color: #0f172a; }
        .doc { background: white; }
        table { border-collapse: collapse; }
      `}</style>

      {/* Toolbar — só na tela */}
      <div
        className="no-print fixed top-0 inset-x-0 z-50 bg-produmar-700 text-white flex items-center justify-between px-6 pb-3 shadow-lg"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <span className="font-semibold text-sm">Diaristas</span>
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

      {/* Documento */}
      <div className="doc max-w-[794px] mx-auto my-6 shadow-xl text-[12px] leading-relaxed text-slate-800">
        <div className="p-6 space-y-4">
          {/* ── Cabeçalho ─────────────────────────────────────────────── */}
          <div className="flex items-start justify-between border-b-2 border-produmar-600 pb-3">
            <div>
              <h1 className="text-[22px] font-black text-produmar-700 tracking-tight leading-none">
                PRODUMAR
              </h1>
              <p className="text-[10px] text-slate-500 mt-1">Controle de diaristas</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.15em]">
                Fechamento de diárias
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {formatDate(from)} a {formatDate(to)}
                {filterLabel ? ` · ${filterLabel}` : ""}
              </p>
              <p className="text-[11px] text-slate-500">Emitido em {formatDate(new Date())}</p>
            </div>
          </div>

          {blocos.length === 0 ? (
            <p className="text-[12px] text-slate-500 py-8 text-center">
              Nenhuma diária lançada neste período.
            </p>
          ) : (
            <>
              {/* ── Resumo: quem, quantos dias, quanto ─────────────────── */}
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 text-left">
                    <th className="py-1.5 px-2 font-semibold border border-slate-200">Diarista</th>
                    <th className="py-1.5 px-2 font-semibold border border-slate-200">Chave PIX</th>
                    <th className="py-1.5 px-2 font-semibold border border-slate-200 text-center">
                      Dias
                    </th>
                    <th className="py-1.5 px-2 font-semibold border border-slate-200 text-right">
                      A pagar
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {blocos.map((b) => (
                    <tr key={b.id}>
                      <td className="py-1.5 px-2 border border-slate-200 font-semibold">
                        {b.nome}
                      </td>
                      <td className="py-1.5 px-2 border border-slate-200">{b.pix ?? "—"}</td>
                      <td className="py-1.5 px-2 border border-slate-200 text-center tabular-nums">
                        {b.dias.length}
                      </td>
                      <td className="py-1.5 px-2 border border-slate-200 text-right tabular-nums font-semibold">
                        {formatBRL(b.total)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-produmar-50">
                    <td
                      className="py-2 px-2 border border-slate-200 font-bold text-produmar-800"
                      colSpan={2}
                    >
                      TOTAL
                    </td>
                    <td className="py-2 px-2 border border-slate-200 text-center tabular-nums font-bold">
                      {totalDias}
                    </td>
                    <td className="py-2 px-2 border border-slate-200 text-right tabular-nums font-bold text-produmar-800">
                      {formatBRL(totalGeral)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* ── Detalhe: o que cada um fez, dia a dia ──────────────── */}
              <div className="space-y-4 pt-2">
                {blocos.map((b) => (
                  <div key={b.id} className="bloco space-y-1">
                    <div className="flex items-baseline justify-between border-b border-slate-300 pb-1">
                      <span className="text-[13px] font-bold text-produmar-800">{b.nome}</span>
                      <span className="text-[11px] text-slate-500">
                        {b.dias.length} {b.dias.length === 1 ? "diária" : "diárias"} ·{" "}
                        <strong className="text-slate-700">{formatBRL(b.total)}</strong>
                        {b.pix ? ` · PIX ${b.pix}` : ""}
                      </span>
                    </div>
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="text-slate-500 text-left">
                          <th className="py-1 px-2 font-semibold w-[70px]">Dia</th>
                          <th className="py-1 px-2 font-semibold w-[150px]">Obra</th>
                          <th className="py-1 px-2 font-semibold">O que fez</th>
                          <th className="py-1 px-2 font-semibold text-right w-[80px]">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...b.dias]
                          .sort((x, y) => x.work_date.localeCompare(y.work_date))
                          .map((d) => (
                            <tr key={d.id} className="border-t border-slate-200">
                              <td className="py-1 px-2 tabular-nums">
                                {formatDate(d.work_date).slice(0, 5)}
                              </td>
                              <td className="py-1 px-2 text-slate-600">
                                {d.supply_obras?.name ?? "—"}
                              </td>
                              <td className="py-1 px-2">{d.description || "—"}</td>
                              <td className="py-1 px-2 text-right tabular-nums">
                                {formatBRL(Number(d.daily_rate))}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-slate-400 pt-2 border-t border-slate-200">
                Os dias são marcados no calendário por quem acompanha o serviço; o valor
                de cada diária é o que estava combinado no dia em que foi lançada.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
