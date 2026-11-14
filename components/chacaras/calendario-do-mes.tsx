"use client";

import { cn, localDateISO } from "@/lib/utils";
import { diasNoMes, isoDia, ocupaDia, primeiroNome, semanaDoDia1 } from "@/lib/chacaras";
import type { ChacaraReserva } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// O CALENDÁRIO DO MÊS DE UMA CHÁCARA
// ─────────────────────────────────────────────────────────────────────────────
// Usado duas vezes: na agenda (ver quem ocupa cada dia) e na reserva nova
// (escolher os dias, com os ocupados já bloqueados). Cada quadradinho é um dia:
//   branco  → livre
//   amarelo → reservado (nada pago ou só o sinal)
//   verde   → pago
// No celular são 7 colunas numa tela de 375px — o quadradinho tem uns 45px,
// cabe o número do dia e o primeiro nome do cliente.
// ─────────────────────────────────────────────────────────────────────────────

const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

export const COR_SITUACAO = {
  reservado:
    "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800/60",
  sinal:
    "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800/60",
  pago:
    "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800/60",
} as const;

export function LegendaDaAgenda({ className }: { className?: string }) {
  const item = (cor: string, texto: string) => (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded border", cor)} />
      {texto}
    </span>
  );
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400", className)}>
      {item("bg-white border-slate-300 dark:bg-slate-900 dark:border-slate-600", "Livre")}
      {item(COR_SITUACAO.reservado, "Reservado")}
      {item(COR_SITUACAO.pago, "Pago")}
    </div>
  );
}

export function CalendarioDoMes({
  ano,
  mes,
  reservas,
  onToque,
  selecao,
  mostrarNome = true,
}: {
  ano: number;
  /** 1–12 */
  mes: number;
  /** Só as reservas DESTA chácara. */
  reservas: ChacaraReserva[];
  onToque?: (dia: string, reserva: ChacaraReserva | null) => void;
  /** Os dias escolhidos na reserva nova. */
  selecao?: { inicio: string; fim: string } | null;
  mostrarNome?: boolean;
}) {
  const hoje = localDateISO();
  const total = diasNoMes(ano, mes);
  const vazios = semanaDoDia1(ano, mes);

  const celulas: (string | null)[] = [
    ...Array.from({ length: vazios }, () => null),
    ...Array.from({ length: total }, (_, i) => isoDia(ano, mes, i + 1)),
  ];

  return (
    <div className="select-none">
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[10px] font-semibold text-slate-400 dark:text-slate-500">
        {SEMANA.map((s, i) => (
          <span key={i}>{s}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {celulas.map((dia, i) => {
          if (!dia) return <span key={`v${i}`} />;
          const reserva = reservas.find((r) => ocupaDia(r, dia)) ?? null;
          const escolhido = !!selecao && selecao.inicio <= dia && dia <= selecao.fim;
          const passado = dia < hoje;
          const numero = Number(dia.slice(8));
          // o nome sai só no primeiro dia da reserva (ou no dia 1 do mês, se ela vem de antes)
          const primeiroDoBloco = !!reserva && (reserva.data_inicio === dia || numero === 1);
          return (
            <button
              key={dia}
              type="button"
              disabled={!onToque}
              onClick={() => onToque?.(dia, reserva)}
              aria-label={`Dia ${numero}${reserva ? ` — ${reserva.cliente_nome}` : " — livre"}`}
              className={cn(
                "relative flex h-12 min-w-0 flex-col items-start justify-between overflow-hidden rounded-lg border px-1 py-0.5 text-left transition-colors",
                escolhido
                  ? "border-produmar-600 bg-produmar-600 text-white"
                  : reserva
                    ? COR_SITUACAO[reserva.situacao]
                    : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
                !escolhido && !reserva && passado && "opacity-50",
                !escolhido && dia === hoje && "ring-2 ring-produmar-400 ring-offset-1 dark:ring-offset-slate-900",
                onToque && "active:scale-95"
              )}
            >
              <span className="text-xs font-semibold tabular-nums leading-tight">{numero}</span>
              {mostrarNome && reserva && !escolhido && (
                <span className="w-full truncate text-[9px] font-medium leading-tight">
                  {primeiroDoBloco ? primeiroNome(reserva.cliente_nome) : "•"}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
