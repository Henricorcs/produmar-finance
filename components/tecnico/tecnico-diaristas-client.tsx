"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Check, ChevronRight, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatBRL, formatDate, getInitials, localDateISO } from "@/lib/utils";
import { DiaristaCalendar, monthRange } from "@/components/diaristas/diarista-shared";
import { DiasDialog, type DiaristaObra } from "@/components/diaristas/dias-dialog";
import { DiaDetailDialog } from "@/components/diaristas/dia-detail-dialog";
import type { Diarista, DiaristaDia, SupplyObraSector } from "@/lib/types";

interface Props {
  /** Só os diaristas ativos: o técnico escolhe, nunca cadastra. */
  diaristas: Diarista[];
  /** Dias já lançados (de todo mundo) — é o que já está verde no calendário. */
  dias: DiaristaDia[];
  obras: DiaristaObra[];
  sectors: SupplyObraSector[];
  /** Quem está usando a tela: ele só apaga o dia que ele mesmo marcou. */
  meId: string;
}

/**
 * A tela do técnico para dizer QUEM veio trabalhar. Mesma ideia da tela do
 * material: ele informa, não cadastra. Toca no diarista, toca nos dias que ele
 * veio (ficam azuis) e escreve o que foi feito — vários dias de uma vez.
 */
export function TecnicoDiaristasClient({ diaristas, dias, obras, sectors, meId }: Props) {
  const hoje = new Date();
  const [openId, setOpenId] = useState<string | null>(null);
  const [year, setYear] = useState(hoje.getFullYear());
  const [month, setMonth] = useState(hoje.getMonth());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lancarOpen, setLancarOpen] = useState(false);
  const [detalheDia, setDetalheDia] = useState<DiaristaDia | null>(null);
  /** A obra do último lançamento: quem está numa obra marca vários seguidos. */
  const [ultimaObraId, setUltimaObraId] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const diarista = useMemo(
    () => diaristas.find((d) => d.id === openId) ?? null,
    [diaristas, openId]
  );

  /** Os dias já lançados do diarista aberto, por data. */
  const launched = useMemo(() => {
    const map = new Map<string, DiaristaDia>();
    if (!openId) return map;
    for (const d of dias) if (d.diarista_id === openId) map.set(d.work_date, d);
    return map;
  }, [dias, openId]);

  /** Quantos dias cada um já tem no mês que está na tela (para a lista). */
  const { from, to } = monthRange(year, month);
  const diasNoMes = useMemo(() => {
    const count = new Map<string, number>();
    for (const d of dias) {
      if (d.work_date < from || d.work_date > to) continue;
      count.set(d.diarista_id, (count.get(d.diarista_id) ?? 0) + 1);
    }
    return count;
  }, [dias, from, to]);

  function abrir(id: string) {
    setOpenId(id);
    setSelected(new Set());
    setSuccess(null);
    // volta sempre para o mês de hoje: o técnico marca o que acabou de acontecer
    setYear(hoje.getFullYear());
    setMonth(hoje.getMonth());
  }

  function voltar() {
    setOpenId(null);
    setSelected(new Set());
  }

  function toggleDia(iso: string) {
    setSuccess(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  }

  function stepMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  const marcados = [...selected].sort();
  const totalMarcado = (diarista?.daily_rate ?? 0) * marcados.length;

  // ── Lista de diaristas ────────────────────────────────────────────────────
  if (!diarista) {
    return (
      <div className="space-y-4 pb-24">
        <Cabecalho />

        {success && <Sucesso texto={success} />}

        {diaristas.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center space-y-1">
              <Users className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Nenhum diarista cadastrado ainda.
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Quem cadastra é o chefe — peça para ele incluir a pessoa.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            {diaristas.map((d) => {
              const n = diasNoMes.get(d.id) ?? 0;
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => abrir(d.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-slate-800 transition-colors"
                  >
                    <span className="w-10 h-10 rounded-xl bg-produmar-50 dark:bg-produmar-900/40 text-produmar-600 dark:text-produmar-300 flex items-center justify-center flex-shrink-0 text-xs font-bold">
                      {getInitials(d.name)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {d.name}
                      </span>
                      <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate">
                        {Number(d.daily_rate) > 0
                          ? `${formatBRL(Number(d.daily_rate))} por dia`
                          : "Diária não combinada"}
                        {n > 0 && ` · ${n === 1 ? "1 dia" : `${n} dias`} este mês`}
                      </span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 flex-shrink-0" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-[11px] text-center text-slate-400 dark:text-slate-500">
          Toque na pessoa para marcar os dias que ela veio.
        </p>
      </div>
    );
  }

  // ── Calendário de um diarista ─────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-40">
      <button
        type="button"
        onClick={voltar}
        className="flex items-center gap-1.5 min-h-[44px] -ml-1 px-1 text-sm font-medium text-produmar-600 dark:text-produmar-400"
      >
        <ArrowLeft className="w-4 h-4" />
        Diaristas
      </button>

      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-xl bg-produmar-50 dark:bg-produmar-900/40 text-produmar-600 dark:text-produmar-300 flex items-center justify-center flex-shrink-0 text-sm font-bold">
          {getInitials(diarista.name)}
        </span>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100 truncate">
            {diarista.name}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {Number(diarista.daily_rate) > 0
              ? `${formatBRL(Number(diarista.daily_rate))} por dia`
              : "Diária não combinada"}
          </p>
        </div>
      </div>

      {success && <Sucesso texto={success} />}

      <Card>
        {/* px-3 no celular: cada dia do calendário fica com o dedo inteiro */}
        <CardContent className="pt-5 px-3 sm:px-5">
          <DiaristaCalendar
            year={year}
            month={month}
            onPrevMonth={() => stepMonth(-1)}
            onNextMonth={() => stepMonth(1)}
            launched={launched}
            selected={selected}
            onToggle={toggleDia}
            onOpenLaunched={setDetalheDia}
          />
        </CardContent>
      </Card>

      <p className="text-[11px] text-center text-slate-400 dark:text-slate-500">
        Toque nos dias que ele veio — dá para marcar vários de uma vez.
      </p>

      {/* Barra do lançamento: só aparece quando há dia marcado */}
      {marcados.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {marcados.length === 1 ? "1 dia marcado" : `${marcados.length} dias marcados`}
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                {totalMarcado > 0 ? formatBRL(totalMarcado) : "Toque em Lançar para descrever"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="ml-auto min-h-[48px] px-3 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={() => setLancarOpen(true)}
              className="flex items-center gap-2 min-h-[48px] px-4 rounded-xl bg-produmar-600 text-white text-sm font-semibold shadow-sm active:scale-[0.98] transition-transform"
            >
              <CalendarDays className="w-4 h-4" />
              Lançar
            </button>
          </div>
        </div>
      )}

      <DiasDialog
        open={lancarOpen}
        onClose={() => setLancarOpen(false)}
        diarista={diarista}
        dates={marcados}
        obras={obras}
        sectors={sectors}
        defaultObraId={ultimaObraId}
        onSaved={(obraId) => {
          setUltimaObraId(obraId || null);
          setSuccess(
            marcados.length === 1
              ? `1 dia lançado para ${diarista.name}.`
              : `${marcados.length} dias lançados para ${diarista.name}.`
          );
          setSelected(new Set());
        }}
      />

      <DiaDetailDialog
        open={!!detalheDia}
        onClose={() => setDetalheDia(null)}
        dia={detalheDia}
        diaristaName={diarista.name}
        obras={obras}
        sectors={sectors}
        canDelete={detalheDia?.created_by === meId}
      />
    </div>
  );
}

function Cabecalho() {
  return (
    <div className="flex items-center gap-3 pt-1">
      <div className="w-11 h-11 rounded-xl bg-produmar-50 dark:bg-produmar-900/40 flex items-center justify-center flex-shrink-0">
        <Users className="w-6 h-6 text-produmar-600 dark:text-produmar-300" />
      </div>
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Diaristas</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Hoje, {formatDate(localDateISO())}
        </p>
      </div>
    </div>
  );
}

function Sucesso({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
      <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{texto}</p>
    </div>
  );
}
