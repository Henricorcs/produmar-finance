"use client";

import { useEffect } from "react";
import { formatDate } from "@/lib/utils";
import {
  VACCINE_STATUS_META,
  categoryLabel,
  doseRuleLabel,
  formatAge,
  formatMl,
  formatWeight,
  pariuLabel,
  suggestedDoseMl,
  vaccineStatusFor,
  SEX_LABELS,
} from "./animal-shared";
import type {
  AnimalBirth,
  AnimalTreatment,
  AnimalVaccination,
  AnimalVaccine,
  AnimalWithInfo,
} from "@/lib/types";

interface Props {
  animal: AnimalWithInfo;
  vaccines: AnimalVaccine[];
  vaccinations: AnimalVaccination[];
  /** Tratamentos deste animal (com o remédio usado). */
  treatments?: AnimalTreatment[];
  /** Partos deste animal (uma linha por bezerro). */
  births?: AnimalBirth[];
  /** URL assinada da foto principal (opcional). */
  photoUrl?: string | null;
  /** Dispara a impressão sozinho ao abrir. */
  autoPrint?: boolean;
}

/** Linhas em branco para anotar à caneta no curral. */
const BLANK_ROWS = 6;

/**
 * Ficha do animal em uma página — é o papel que vai para o curral na hora de
 * vacinar: identificação, situação de cada vacina com a dose em ml a aplicar e
 * linhas em branco para anotar o que foi feito.
 */
export function AnimalFichaPrint({
  animal,
  vaccines,
  vaccinations,
  treatments = [],
  births = [],
  photoUrl,
  autoPrint,
}: Props) {
  useEffect(() => {
    if (autoPrint) {
      const t = setTimeout(() => window.print(), 400);
      return () => clearTimeout(t);
    }
  }, [autoPrint]);

  const weightKg = Number(animal.weight);

  const rows = vaccines.map((v) => {
    const applications = vaccinations
      .filter((x) => x.vaccine_id === v.id)
      .sort((a, b) => (a.applied_at < b.applied_at ? 1 : -1));
    const last = applications[0] ?? null;
    const { status, nextDate } = vaccineStatusFor(last?.applied_at ?? null, v.recurrence_months);
    return { vaccine: v, last, status, nextDate, dose: suggestedDoseMl(v, weightKg) };
  });

  // histórico completo, mais recente primeiro
  const history = [...vaccinations].sort((a, b) => (a.applied_at < b.applied_at ? 1 : -1));
  const vaccineNameById = new Map(vaccines.map((v) => [v.id, v.name]));

  const info: { label: string; value: string }[] = [
    { label: "Número", value: animal.tag },
    { label: "Categoria", value: categoryLabel(animal.category, animal.sex) },
    { label: "Sexo", value: SEX_LABELS[animal.sex] },
    { label: "Raça", value: animal.breed_name ?? "—" },
    { label: "Nascimento", value: animal.birth_date ? formatDate(animal.birth_date) : "—" },
    { label: "Idade", value: formatAge(animal.age_months) },
    { label: "Peso", value: weightKg > 0 ? formatWeight(weightKg) : "—" },
  ];
  if (animal.sex === "femea") {
    info.push({
      label: "Pariu",
      value:
        births.length === 0
          ? "Não"
          : `${pariuLabel(animal.sex, births)} · último em ${formatDate(births[0].birth_date)}`,
    });
  }

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          html, body { background: white !important; }
          @page { size: A4; margin: 12mm; }
          .doc { box-shadow: none !important; margin: 0 !important; }
          .avoid-break { break-inside: avoid; }
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
        <span className="font-semibold text-sm">Ficha do Animal</span>
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
      <div className="doc max-w-[794px] mx-auto my-6 shadow-xl text-[13px] leading-relaxed text-slate-800">
        <div className="p-8 space-y-4">
          {/* ── Cabeçalho ─────────────────────────────────────────────── */}
          <div className="flex items-start justify-between border-b-2 border-produmar-600 pb-4">
            <div>
              <h1 className="text-[26px] font-black text-produmar-700 tracking-tight leading-none">
                PRODUMAR
              </h1>
              <p className="text-[11px] text-slate-500 mt-1">Controle de rebanho</p>
            </div>
            <div className="text-right">
              <p className="text-[12px] font-bold text-slate-500 uppercase tracking-[0.15em]">
                Ficha do Animal
              </p>
              <p className="text-[22px] font-black text-slate-800 leading-tight mt-0.5">
                {animal.tag}
              </p>
              <p className="text-[11px] text-slate-500">
                {categoryLabel(animal.category, animal.sex)}
                {animal.breed_name ? ` · ${animal.breed_name}` : ""}
              </p>
            </div>
          </div>

          {/* ── Identificação + foto ──────────────────────────────────── */}
          <div className="flex gap-4 avoid-break">
            <table className="flex-1 text-[13px]">
              <tbody>
                {info.map((i) => (
                  <tr key={i.label} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap w-[110px]">
                      {i.label}
                    </td>
                    <td className="py-1.5 font-semibold">{i.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={`Animal ${animal.tag}`}
                className="w-[170px] h-[170px] object-cover rounded-lg border border-slate-300"
              />
            ) : (
              <div className="w-[170px] h-[170px] rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400 text-center px-2">
                sem foto cadastrada
              </div>
            )}
          </div>

          {animal.notes && (
            <p className="text-[12.5px] text-slate-600 border border-slate-200 rounded-lg px-3 py-2">
              <span className="text-slate-400 uppercase tracking-wide text-[10px] mr-1.5">
                Obs.
              </span>
              {animal.notes}
            </p>
          )}

          {/* ── Situação da vacinação ─────────────────────────────────── */}
          <div className="avoid-break">
            <h2 className="text-[14px] font-bold text-produmar-700 uppercase tracking-wide mb-1.5">
              Situação da vacinação
            </h2>
            {rows.length === 0 ? (
              <p className="text-[12px] text-slate-500">Nenhuma vacina cadastrada.</p>
            ) : (
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 text-left">
                    <th className="py-1.5 px-2 font-semibold">Vacina</th>
                    <th className="py-1.5 px-2 font-semibold">Dose a aplicar</th>
                    <th className="py-1.5 px-2 font-semibold">Última</th>
                    <th className="py-1.5 px-2 font-semibold">Remédio</th>
                    <th className="py-1.5 px-2 font-semibold">Próxima</th>
                    <th className="py-1.5 px-2 font-semibold">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ vaccine, last, status, nextDate, dose }) => (
                    <tr key={vaccine.id} className="border-b border-slate-100">
                      <td className="py-1.5 px-2 font-semibold capitalize">{vaccine.name}</td>
                      <td className="py-1.5 px-2 font-bold tabular-nums">
                        {dose ? formatMl(dose) : "—"}
                      </td>
                      <td className="py-1.5 px-2 tabular-nums">
                        {last ? formatDate(last.applied_at) : "—"}
                      </td>
                      <td className="py-1.5 px-2">{last?.brand ?? "—"}</td>
                      <td className="py-1.5 px-2 tabular-nums">
                        {nextDate
                          ? formatDate(nextDate)
                          : vaccine.recurrence_months
                          ? "—"
                          : "dose única"}
                      </td>
                      <td className="py-1.5 px-2">
                        <span
                          className={
                            status === "em_dia"
                              ? "font-semibold text-emerald-700"
                              : "font-bold text-red-600"
                          }
                        >
                          {VACCINE_STATUS_META[status].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {rows.some((r) => r.vaccine.dose_ml_per_weight && r.vaccine.dose_weight_kg) && (
              <p className="text-[11px] text-slate-500 mt-1">
                {rows
                  .filter((r) => r.vaccine.dose_ml_per_weight && r.vaccine.dose_weight_kg)
                  .map((r) => `${r.vaccine.name}: ${doseRuleLabel(r.vaccine, weightKg)}`)
                  .join(" · ")}
              </p>
            )}
          </div>

          {/* ── Linhas em branco para anotar ──────────────────────────── */}
          <div className="avoid-break">
            <h2 className="text-[14px] font-bold text-produmar-700 uppercase tracking-wide mb-1.5">
              Aplicações desta vez
            </h2>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-left">
                  <th className="py-1.5 px-2 font-semibold w-[34%]">Vacina</th>
                  <th className="py-1.5 px-2 font-semibold w-[16%]">Data</th>
                  <th className="py-1.5 px-2 font-semibold w-[14%]">Dose (ml)</th>
                  <th className="py-1.5 px-2 font-semibold w-[22%]">Remédio</th>
                  <th className="py-1.5 px-2 font-semibold w-[14%]">Quem aplicou</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: BLANK_ROWS }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-200">
                    <td className="py-2.5 px-2">&nbsp;</td>
                    <td className="py-2.5 px-2">&nbsp;</td>
                    <td className="py-2.5 px-2">&nbsp;</td>
                    <td className="py-2.5 px-2">&nbsp;</td>
                    <td className="py-2.5 px-2">&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Partos ────────────────────────────────────────────────── */}
          {births.length > 0 && (
            <div className="avoid-break">
              <h2 className="text-[14px] font-bold text-produmar-700 uppercase tracking-wide mb-1.5">
                Partos
              </h2>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 text-left">
                    <th className="py-1.5 px-2 font-semibold">Data</th>
                    <th className="py-1.5 px-2 font-semibold">Bezerro</th>
                    <th className="py-1.5 px-2 font-semibold">Nº</th>
                  </tr>
                </thead>
                <tbody>
                  {births.map((b) => (
                    <tr key={b.id} className="border-b border-slate-100">
                      <td className="py-1.5 px-2 tabular-nums">{formatDate(b.birth_date)}</td>
                      <td className="py-1.5 px-2">
                        {b.calf_sex === "macho"
                          ? "Macho"
                          : b.calf_sex === "femea"
                          ? "Fêmea"
                          : "—"}
                      </td>
                      <td className="py-1.5 px-2">{b.calf_tag ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Tratamentos (com o remédio usado) ─────────────────────── */}
          {treatments.length > 0 && (
            <div className="avoid-break">
              <h2 className="text-[14px] font-bold text-produmar-700 uppercase tracking-wide mb-1.5">
                Tratamentos
              </h2>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 text-left">
                    <th className="py-1.5 px-2 font-semibold">Data</th>
                    <th className="py-1.5 px-2 font-semibold">Tratamento</th>
                    <th className="py-1.5 px-2 font-semibold">Remédio</th>
                    <th className="py-1.5 px-2 font-semibold">Dose</th>
                  </tr>
                </thead>
                <tbody>
                  {treatments.map((t) => (
                    <tr key={t.id} className="border-b border-slate-100">
                      <td className="py-1.5 px-2 tabular-nums">{formatDate(t.applied_at)}</td>
                      <td className="py-1.5 px-2">{t.description}</td>
                      <td className="py-1.5 px-2">{t.medicine ?? "—"}</td>
                      <td className="py-1.5 px-2">{t.dose ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Histórico ─────────────────────────────────────────────── */}
          {history.length > 0 && (
            <div className="avoid-break">
              <h2 className="text-[14px] font-bold text-produmar-700 uppercase tracking-wide mb-1.5">
                Histórico de vacinação
              </h2>
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 text-left">
                    <th className="py-1.5 px-2 font-semibold">Data</th>
                    <th className="py-1.5 px-2 font-semibold">Vacina</th>
                    <th className="py-1.5 px-2 font-semibold">Dose</th>
                    <th className="py-1.5 px-2 font-semibold">Remédio</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b border-slate-100">
                      <td className="py-1.5 px-2 tabular-nums">{formatDate(h.applied_at)}</td>
                      <td className="py-1.5 px-2 capitalize">
                        {vaccineNameById.get(h.vaccine_id) ?? "—"}
                      </td>
                      <td className="py-1.5 px-2 tabular-nums">
                        {h.dose_ml ? formatMl(Number(h.dose_ml)) : "—"}
                      </td>
                      <td className="py-1.5 px-2">{h.brand ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[11px] text-slate-500 text-right pt-2 border-t border-slate-100">
            Ficha gerada em {formatDate(new Date())}
          </p>
        </div>
      </div>
    </>
  );
}
