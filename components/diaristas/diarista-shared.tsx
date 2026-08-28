"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, localDateISO } from "@/lib/utils";
import type { DiaristaDia } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// Contas de calendário — tudo em YYYY-MM-DD no fuso LOCAL
// ─────────────────────────────────────────────────────────────────────────────
// Nada de `toISOString()`: depois das 21h (BRT) o ISO já está no dia seguinte e
// o diarista apareceria trabalhando amanhã. `localDateISO` resolve isso.

export const WEEKDAY_INITIALS = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Mês por extenso ("agosto de 2026"). */
export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

/**
 * As casas do calendário: os buracos até o primeiro dia (domingo à esquerda) e
 * depois um YYYY-MM-DD por dia do mês.
 */
export function monthCells(year: number, month: number): (string | null)[] {
  const startPad = new Date(year, month, 1).getDay();
  const total = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(startPad).fill(null);
  for (let d = 1; d <= total; d++) cells.push(localDateISO(new Date(year, month, d)));
  return cells;
}

/** Primeiro e último dia do mês, em YYYY-MM-DD. */
export function monthRange(year: number, month: number): { from: string; to: string } {
  return {
    from: localDateISO(new Date(year, month, 1)),
    to: localDateISO(new Date(year, month + 1, 0)),
  };
}

/**
 * "2026-08-12" → "Quarta-feira, 12 de agosto" (o dia clicado, por extenso).
 * Só a primeira letra sobe: o `capitalize` do Tailwind subiria TODAS as
 * palavras e sairia "Quarta-Feira, 12 De Agosto".
 */
export function longDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const texto = new Date(y, m - 1, d).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// O CALENDÁRIO
// ─────────────────────────────────────────────────────────────────────────────

interface CalendarProps {
  year: number;
  month: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** Os dias que já estão lançados, por data (YYYY-MM-DD). */
  launched: Map<string, DiaristaDia>;
  /** Os dias tocados agora, ainda não salvos (ficam azuis). */
  selected: Set<string>;
  /** Tocou num dia livre. */
  onToggle: (iso: string) => void;
  /** Tocou num dia que já estava lançado. */
  onOpenLaunched: (dia: DiaristaDia) => void;
}

/**
 * O calendário do mês de UM diarista. Toca no dia e ele fica azul; o que já foi
 * lançado fica verde e, ao tocar, abre o que foi feito naquele dia. Meia diária
 * fica AMARELA — dá para bater o olho no mês e ver os dias que valem metade.
 *
 * Depois do acerto o dia fica CINZA (migration 068): cor forte quer dizer "ainda
 * devo esse dia", cinza quer dizer "já paguei".
 *
 * Dia futuro fica apagado e não aceita toque: ninguém trabalhou amanhã.
 */
export function DiaristaCalendar({
  year,
  month,
  onPrevMonth,
  onNextMonth,
  launched,
  selected,
  onToggle,
  onOpenLaunched,
}: CalendarProps) {
  const cells = monthCells(year, month);
  const today = localDateISO();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPrevMonth}
          aria-label="Mês anterior"
          className="w-11 h-11 flex items-center justify-center rounded-lg text-produmar-600 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-slate-800 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-sm font-semibold text-produmar-800 dark:text-slate-100 capitalize">
          {monthLabel(year, month)}
        </span>
        <button
          type="button"
          onClick={onNextMonth}
          aria-label="Próximo mês"
          className="w-11 h-11 flex items-center justify-center rounded-lg text-produmar-600 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-slate-800 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_INITIALS.map((w, i) => (
          <span
            key={i}
            className="text-center text-[11px] font-semibold text-slate-400 dark:text-slate-500 py-1"
          >
            {w}
          </span>
        ))}

        {cells.map((iso, i) => {
          if (!iso) return <span key={`v${i}`} />;

          const dia = launched.get(iso);
          const isSelected = selected.has(iso);
          const isToday = iso === today;
          const isFuture = iso > today;
          const numero = Number(iso.split("-")[2]);

          return (
            <button
              key={iso}
              type="button"
              disabled={isFuture}
              onClick={() => (dia ? onOpenLaunched(dia) : onToggle(iso))}
              aria-label={`Dia ${numero}${
                dia
                  ? dia.acerto_id
                    ? " — já acertado"
                    : dia.half_day
                      ? " — meia diária lançada"
                      : " — já lançado"
                  : ""
              }`}
              // o dia lançado não é um botão de marcar: ele abre o lançamento
              aria-pressed={dia ? undefined : isSelected}
              className={cn(
                // quadrado do tamanho da coluna, SEM min-h: com aspect-ratio o
                // mínimo de altura vira mínimo de largura também, e a linha de
                // 7 dias estourava a caixa nas telas estreitas
                "aspect-square rounded-lg border text-sm font-semibold tabular-nums flex items-center justify-center transition-colors active:scale-95",
                isFuture && "opacity-30",
                dia
                  ? dia.acerto_id
                    ? // já acertado: cinza. A cor forte quer dizer "ainda devo"
                      // — depois de pago o dia apaga e some do que se deve
                      "bg-slate-300 border-slate-300 text-slate-600 dark:bg-slate-600 dark:border-slate-600 dark:text-slate-200"
                    : dia.half_day
                      ? // meia diária: amarelo com número escuro (branco em cima
                        // de amarelo não se lê no sol)
                        "bg-amber-400 border-amber-400 text-amber-950"
                      : "bg-emerald-500 border-emerald-500 text-white"
                  : isSelected
                    ? "bg-produmar-600 border-produmar-600 text-white shadow-sm"
                    : "bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300",
                isToday && !dia && !isSelected && "border-produmar-400 dark:border-produmar-600"
              )}
            >
              {numero}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
        <Legenda className="bg-produmar-600" label="marcado agora" />
        <Legenda className="bg-emerald-500" label="dia inteiro" />
        <Legenda className="bg-amber-400" label="meia diária" />
        <Legenda className="bg-slate-300 dark:bg-slate-600" label="já acertado" />
      </div>
    </div>
  );
}

function Legenda({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
      <span className={cn("w-3 h-3 rounded", className)} />
      {label}
    </span>
  );
}
