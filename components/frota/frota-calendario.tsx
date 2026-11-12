"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn, localDateISO } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Contas de calendário — tudo em YYYY-MM-DD no fuso LOCAL
// ─────────────────────────────────────────────────────────────────────────────
// Nada de `toISOString()`: depois das 21h (BRT) o ISO já está no dia seguinte e
// a OS apareceria lançada amanhã. `localDateISO` resolve isso. Mesma conta do
// calendário dos Colaboradores.

export const WEEKDAY_INITIALS = ["D", "S", "T", "Q", "Q", "S", "S"];

/** Mês por extenso ("setembro de 2026"). */
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

/** O que aconteceu num dia do calendário do veículo. */
export interface DiaDaFrota {
  /** OS ainda em andamento — é o que pinta o dia de verde. */
  abertas: number;
  /** Todas as OS do dia (abertas + concluídas). */
  total: number;
}

interface Props {
  year: number;
  /** Mês 0-11, como no Date do JavaScript. */
  month: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** As OS de cada dia (YYYY-MM-DD). */
  porDia: Map<string, DiaDaFrota>;
  /** Tocou num dia — abre a caixa da OS NOVA daquele dia, sempre. */
  onDayClick: (iso: string) => void;
}

/**
 * O CALENDÁRIO DO VEÍCULO — o mês inteiro da máquina numa olhada.
 *
 * Toca no dia e abre a caixa para lançar a ordem de serviço daquele dia; toca
 * de novo e abre outra, quantas vezes precisar (um dia pode ter várias OS). Dia
 * com OS ABERTA fica VERDE — é o serviço que ainda não foi concluído. Quando
 * tudo do dia foi concluído ele fica CINZA, e dia sem nada continua normal.
 *
 * Para corrigir uma OS já lançada, é na lista debaixo do calendário: aqui o
 * toque é sempre para lançar uma nova, do jeito que foi pedido.
 */
export function FrotaCalendario({
  year,
  month,
  onPrevMonth,
  onNextMonth,
  porDia,
  onDayClick,
}: Props) {
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

          const dia = porDia.get(iso);
          const temAberta = !!dia && dia.abertas > 0;
          const temAlguma = !!dia && dia.total > 0;
          const isToday = iso === today;
          const numero = Number(iso.split("-")[2]);

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onDayClick(iso)}
              aria-label={`Dia ${numero}${
                temAberta
                  ? ` — ${dia.abertas} ${dia.abertas === 1 ? "OS aberta" : "OS abertas"}`
                  : temAlguma
                    ? " — OS concluída"
                    : " — sem OS"
              }. Lançar nova OS`}
              className={cn(
                // quadrado do tamanho da coluna, SEM min-h: com aspect-ratio o
                // mínimo de altura vira mínimo de largura também, e a linha de
                // 7 dias estouraria a caixa nas telas estreitas
                "relative aspect-square rounded-lg border text-sm font-semibold tabular-nums flex items-center justify-center transition-colors active:scale-95",
                temAberta
                  ? "bg-emerald-500 border-emerald-500 text-white"
                  : temAlguma
                    ? // tudo concluído: cinza. A cor forte quer dizer "ainda
                      // tem serviço em aberto"
                      "bg-slate-300 border-slate-300 text-slate-600 dark:bg-slate-600 dark:border-slate-600 dark:text-slate-200"
                    : "bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300",
                isToday && !temAlguma && "border-produmar-400 dark:border-produmar-600"
              )}
            >
              {numero}
              {/* mais de uma OS no mesmo dia: o número no canto avisa */}
              {dia && dia.total > 1 && (
                <span className="absolute top-0.5 right-1 text-[9px] leading-none opacity-80">
                  {dia.total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
        <Legenda className="bg-emerald-500" label="OS aberta" />
        <Legenda className="bg-slate-300 dark:bg-slate-600" label="tudo concluído" />
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          toque no dia para lançar uma OS — pode ter várias no mesmo dia
        </span>
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
