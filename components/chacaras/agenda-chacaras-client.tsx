"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, CalendarDays, HandCoins, Plus, Trees, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonthNav } from "@/components/ui/month-nav";
import { SummaryStatCard } from "@/components/ui/summary-stat-card";
import { CalendarioDoMes, LegendaDaAgenda } from "@/components/chacaras/calendario-do-mes";
import { ReservaDialog, type AberturaReserva } from "@/components/chacaras/reserva-dialog";
import { cn, formatBRL } from "@/lib/utils";
import {
  SITUACAO_LABEL,
  cruzam,
  diasNoMes,
  faltaPagar,
  formaLabel,
  isoDia,
  mesLabel,
  periodoLabel,
  somarMes,
  totalDeDias,
} from "@/lib/chacaras";
import type { Chacara, ChacaraReserva } from "@/lib/types";

/**
 * AGENDA DAS CHÁCARAS — o calendário do mês de cada chácara, em cima; embaixo,
 * as reservas do mês com o total, o recebido e o que falta receber.
 *
 * Tocar num dia livre abre a reserva nova já com a chácara e o dia; tocar num
 * dia ocupado abre a reserva de quem está nele.
 */
export function AgendaChacarasClient({
  chacaras,
  reservas,
  mes,
  podeGravar,
  migrationPendente,
}: {
  chacaras: Chacara[];
  reservas: ChacaraReserva[];
  mes: string;
  podeGravar: boolean;
  migrationPendente: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [navegando, startTransition] = useTransition();
  const [abertura, setAbertura] = useState<AberturaReserva | null>(null);
  const [filtro, setFiltro] = useState<string>("todas");

  const [ano, mesNum] = mes.split("-").map(Number);
  const inicioMes = `${mes}-01`;
  const fimMes = isoDia(ano, mesNum, diasNoMes(ano, mesNum));

  function irParaMes(delta: number) {
    startTransition(() => router.push(`${pathname}?m=${somarMes(mes, delta)}`));
  }

  const doMes = useMemo(
    () => reservas.filter((r) => cruzam(r.data_inicio, r.data_fim, inicioMes, fimMes)),
    [reservas, inicioMes, fimMes]
  );
  const lista = filtro === "todas" ? doMes : doMes.filter((r) => r.chacara_id === filtro);

  // O dinheiro conta no mês em que a reserva começa — a que vira o mês não soma duas vezes.
  const somadas = lista.filter((r) => r.data_inicio >= inicioMes);
  const deOutroMes = lista.length - somadas.length;
  const totais = somadas.reduce(
    (t, r) => ({
      valor: t.valor + Number(r.valor),
      recebido: t.recebido + Number(r.valor_pago),
      aReceber: t.aReceber + faltaPagar(r),
    }),
    { valor: 0, recebido: 0, aReceber: 0 }
  );

  const nomeDa = (id: string) => chacaras.find((c) => c.id === id)?.nome ?? "—";

  function tocarDia(chacaraId: string, dia: string, reserva: ChacaraReserva | null) {
    if (reserva) setAbertura({ tipo: "existente", reserva });
    else if (podeGravar) setAbertura({ tipo: "nova", chacaraId, dia });
  }

  return (
    <div className={cn("mx-auto max-w-3xl space-y-4 animate-fade-in", navegando && "opacity-60")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">Agenda das chácaras</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Os dias reservados e pagos — o sistema não deixa alugar o mesmo dia duas vezes
          </p>
        </div>
        {podeGravar && !migrationPendente && (
          <Button onClick={() => setAbertura({ tipo: "nova" })} className="h-11 text-base sm:h-10 sm:text-sm">
            <Plus className="h-4 w-4" />
            Nova reserva
          </Button>
        )}
      </div>

      {migrationPendente && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>Rode a migration 142 no Supabase para a agenda das chácaras funcionar.</span>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <MonthNav label={mesLabel(ano, mesNum)} onPrev={() => irParaMes(-1)} onNext={() => irParaMes(1)} />
        <LegendaDaAgenda />
      </div>

      {/* Um calendário por chácara */}
      <div className="grid gap-3 md:grid-cols-2">
        {chacaras.map((c) => {
          const daChacara = reservas.filter((r) => r.chacara_id === c.id);
          const noMes = doMes.filter((r) => r.chacara_id === c.id);
          const diasOcupados = noMes.reduce((s, r) => {
            const i = r.data_inicio < inicioMes ? inicioMes : r.data_inicio;
            const f = r.data_fim > fimMes ? fimMes : r.data_fim;
            return s + totalDeDias(i, f);
          }, 0);
          return (
            <div
              key={c.id}
              className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-100">
                  <Trees className="h-4 w-4 text-green-600 dark:text-green-400" />
                  {c.nome}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {diasOcupados === 0
                    ? "Tudo livre"
                    : `${diasOcupados} ${diasOcupados === 1 ? "dia ocupado" : "dias ocupados"}`}
                </p>
              </div>
              <CalendarioDoMes
                ano={ano}
                mes={mesNum}
                reservas={daChacara}
                onToque={(dia, r) => tocarDia(c.id, dia, r)}
              />
            </div>
          );
        })}
      </div>

      {/* As reservas do mês */}
      <div className="space-y-3 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">Reservas do mês</h2>
          <div className="flex gap-1.5 overflow-x-auto">
            {[{ id: "todas", nome: "Todas" }, ...chacaras].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setFiltro(c.id)}
                className={cn(
                  "h-8 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-colors",
                  filtro === c.id
                    ? "border-produmar-600 bg-produmar-600 text-white"
                    : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                )}
              >
                {c.nome}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <SummaryStatCard tone="produmar" icon={Wallet} label="Aluguéis" amount={totais.valor} />
          <SummaryStatCard tone="emerald" icon={HandCoins} label="Recebido" amount={totais.recebido} />
          <SummaryStatCard tone="amber" icon={CalendarClock} label="A receber" amount={totais.aReceber} />
        </div>
        {deOutroMes > 0 && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            {deOutroMes === 1 ? "1 reserva começou" : `${deOutroMes} reservas começaram`} no mês anterior e{" "}
            {deOutroMes === 1 ? "está somada" : "estão somadas"} lá.
          </p>
        )}

        {lista.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center dark:border-slate-700">
            <CalendarDays className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Nenhuma reserva neste mês.
              {podeGravar && !migrationPendente ? " Toque num dia do calendário para reservar." : ""}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {lista.map((r) => {
              const dias = totalDeDias(r.data_inicio, r.data_fim);
              const falta = faltaPagar(r);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setAbertura({ tipo: "existente", reserva: r })}
                  className="flex w-full items-stretch gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800/60"
                >
                  <span
                    className={cn(
                      "w-1.5 shrink-0 rounded-full",
                      r.situacao === "pago" ? "bg-emerald-500" : "bg-amber-400"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-800 dark:text-slate-100">{r.cliente_nome}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      {periodoLabel(r.data_inicio, r.data_fim)} · {dias} {dias === 1 ? "dia" : "dias"}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {nomeDa(r.chacara_id)} · {formaLabel(r.forma_pagamento)}
                      {r.observacao ? ` · ${r.observacao}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                      {formatBRL(Number(r.valor))}
                    </p>
                    <span
                      className={cn(
                        "mt-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium",
                        r.situacao === "pago"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                      )}
                    >
                      {SITUACAO_LABEL[r.situacao]}
                    </span>
                    {falta > 0 && (
                      <p className="mt-0.5 text-[11px] tabular-nums text-amber-700 dark:text-amber-400">
                        falta {formatBRL(falta)}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <ReservaDialog
        abertura={abertura}
        onClose={() => setAbertura(null)}
        chacaras={chacaras}
        reservas={reservas}
        mesDaTela={mes}
        podeGravar={podeGravar}
      />
    </div>
  );
}
