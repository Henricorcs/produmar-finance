"use client";

import { useEffect } from "react";
import { formatDate } from "@/lib/utils";
import {
  categoryLabel,
  formatMl,
  formatWeight,
  pariuLabel,
  suggestedDoseMl,
  vaccineStatusFor,
} from "./animal-shared";
import type {
  AnimalBirth,
  AnimalVaccination,
  AnimalVaccine,
  AnimalWithInfo,
} from "@/lib/types";

interface Props {
  animals: AnimalWithInfo[];
  vaccines: AnimalVaccine[];
  vaccinations: AnimalVaccination[];
  /** Partos (para a coluna "Pariu"). */
  births?: AnimalBirth[];
  /** Texto do filtro usado (aparece no cabeçalho). */
  filterLabel?: string | null;
  autoPrint?: boolean;
}

/**
 * Lista do rebanho com a grade de vacinas — a folha que substitui o caderno no
 * curral: uma linha por animal, uma coluna por vacina, com a dose em ml que
 * aquele animal deve receber e um quadradinho para marcar depois de aplicar.
 */
export function RebanhoVacinasPrint({
  animals,
  vaccines,
  vaccinations,
  births = [],
  filterLabel,
  autoPrint,
}: Props) {
  useEffect(() => {
    if (autoPrint) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [autoPrint]);

  /** Última aplicação de cada par animal+vacina. */
  const lastByKey = new Map<string, AnimalVaccination>();
  for (const v of vaccinations) {
    const key = `${v.animal_id}|${v.vaccine_id}`;
    const cur = lastByKey.get(key);
    if (!cur || cur.applied_at < v.applied_at) lastByKey.set(key, v);
  }

  /** Partos por mãe (para a coluna "Pariu"). */
  const birthsByMother = new Map<string, AnimalBirth[]>();
  for (const b of births) {
    const arr = birthsByMother.get(b.mother_id);
    if (arr) arr.push(b);
    else birthsByMother.set(b.mother_id, [b]);
  }

  const pendingCount = animals.filter((a) => a.vaccines_due > 0).length;

  /** Quanto levar: soma dos ml pendentes de cada vacina (dos animais da folha). */
  const totals = vaccines.map((v) => {
    let count = 0;
    let ml = 0;
    for (const a of animals) {
      const last = lastByKey.get(`${a.id}|${v.id}`) ?? null;
      const { status } = vaccineStatusFor(last?.applied_at ?? null, v.recurrence_months);
      if (status === "em_dia") continue;
      count++;
      const dose = suggestedDoseMl(v, Number(a.weight));
      if (dose) ml += dose;
    }
    return { count, ml: Math.round(ml * 10) / 10 };
  });

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          html, body { background: white !important; }
          /* paisagem: cabem as colunas de todas as vacinas */
          @page { size: A4 landscape; margin: 10mm; }
          .doc { box-shadow: none !important; margin: 0 !important; max-width: none !important; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
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
        <span className="font-semibold text-sm">Guia de vacinação</span>
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
      <div className="doc max-w-[1123px] mx-auto my-6 shadow-xl text-[12px] leading-relaxed text-slate-800">
        <div className="p-6 space-y-3">
          {/* ── Cabeçalho ─────────────────────────────────────────────── */}
          <div className="flex items-start justify-between border-b-2 border-produmar-600 pb-3">
            <div>
              <h1 className="text-[22px] font-black text-produmar-700 tracking-tight leading-none">
                PRODUMAR
              </h1>
              <p className="text-[10px] text-slate-500 mt-1">Controle de rebanho</p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.15em]">
                Guia de vacinação
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {animals.length} animais
                {filterLabel ? ` · ${filterLabel}` : ""} · {pendingCount} com vacina pendente
              </p>
              <p className="text-[11px] text-slate-500">{formatDate(new Date())}</p>
            </div>
          </div>

          {animals.length === 0 ? (
            <p className="text-[12px] text-slate-500 py-6 text-center">
              Nenhum animal para listar.
            </p>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-left">
                  <th className="py-1.5 px-1.5 font-semibold border border-slate-200">Nº</th>
                  <th className="py-1.5 px-1.5 font-semibold border border-slate-200">Cat.</th>
                  <th className="py-1.5 px-1.5 font-semibold border border-slate-200">Raça</th>
                  <th className="py-1.5 px-1.5 font-semibold border border-slate-200">Peso</th>
                  <th className="py-1.5 px-1.5 font-semibold border border-slate-200">Pariu</th>
                  {vaccines.map((v) => (
                    <th
                      key={v.id}
                      className="py-1.5 px-1.5 font-semibold border border-slate-200 capitalize text-center"
                    >
                      {v.name}
                      {/* o remédio usado nessa vacina (cadastrado como "remédio/marca") */}
                      {v.default_brand && (
                        <span className="block text-[10px] font-normal text-slate-500">
                          {v.default_brand}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {animals.map((a) => {
                  const weightKg = Number(a.weight);
                  return (
                    <tr key={a.id}>
                      <td className="py-1.5 px-1.5 border border-slate-200 font-bold">{a.tag}</td>
                      <td className="py-1.5 px-1.5 border border-slate-200">
                        {categoryLabel(a.category, a.sex)}
                      </td>
                      <td className="py-1.5 px-1.5 border border-slate-200 capitalize">
                        {a.breed_name ?? "—"}
                      </td>
                      <td className="py-1.5 px-1.5 border border-slate-200 tabular-nums whitespace-nowrap">
                        {weightKg > 0 ? formatWeight(weightKg) : "—"}
                      </td>
                      <td className="py-1.5 px-1.5 border border-slate-200 tabular-nums whitespace-nowrap">
                        {pariuLabel(a.sex, birthsByMother.get(a.id) ?? [])}
                      </td>
                      {vaccines.map((v) => {
                        const last = lastByKey.get(`${a.id}|${v.id}`) ?? null;
                        const { status } = vaccineStatusFor(
                          last?.applied_at ?? null,
                          v.recurrence_months
                        );
                        const dose = suggestedDoseMl(v, weightKg);
                        const due = status !== "em_dia";
                        return (
                          <td
                            key={v.id}
                            className={`py-1.5 px-1.5 border border-slate-200 text-center whitespace-nowrap ${
                              due ? "bg-red-50" : ""
                            }`}
                          >
                            {due ? (
                              <span className="inline-flex items-center gap-1">
                                {/* quadradinho para marcar à caneta */}
                                <span className="inline-block w-3 h-3 border border-slate-500" />
                                <span className="font-bold tabular-nums">
                                  {dose ? formatMl(dose) : "aplicar"}
                                </span>
                              </span>
                            ) : (
                              <span className="text-slate-400">
                                ok{last ? ` ${formatDate(last.applied_at).slice(3)}` : ""}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-produmar-50">
                  <td
                    colSpan={5}
                    className="py-1.5 px-1.5 border border-slate-200 text-right font-bold text-[10px] uppercase tracking-wide text-produmar-700"
                  >
                    Levar (total das pendentes)
                  </td>
                  {vaccines.map((v, i) => (
                    <td
                      key={v.id}
                      className="py-1.5 px-1.5 border border-slate-200 text-center whitespace-nowrap"
                    >
                      {totals[i].count > 0 ? (
                        <>
                          <span className="font-bold tabular-nums">
                            {totals[i].ml > 0 ? formatMl(totals[i].ml) : "—"}
                          </span>
                          <span className="text-[10px] text-slate-500"> · {totals[i].count}</span>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          )}

          <p className="text-[10px] text-slate-500 pt-1">
            Fundo vermelho = vacina atrasada ou nunca aplicada; o valor é a dose em ml para
            aquele animal. Marque o quadradinho ao aplicar. &quot;ok&quot; = em dia, com o mês
            da última aplicação. Pariu = crias (M = macho, F = fêmea). &quot;Levar&quot; = soma
            dos ml pendentes e quantos animais faltam de cada vacina.
          </p>
        </div>
      </div>
    </>
  );
}
