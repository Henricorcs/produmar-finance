"use client";

import { useMemo } from "react";
import { AlertTriangle, ChevronRight, Clock, Tractor } from "lucide-react";
import { MonthNav } from "@/components/ui/month-nav";
import { Money } from "@/components/ui/money";
import { SummaryStatCard } from "@/components/ui/summary-stat-card";
import {
  SITUACAO_PLURAL,
  SITUACAO_STYLE,
  situacaoDaMaquina,
  type SituacaoOs,
} from "@/lib/os-situacao";
import { cn, daysUntil, formatBRL, machineCategoryLabel } from "@/lib/utils";
import { categoryChip } from "./frota-shared";
import type { MachineResumo, MachineServico } from "@/lib/types";

/**
 * RELATÓRIO DE OS, MÁQUINA POR MÁQUINA.
 *
 * A pergunta que esta aba responde é a do dono olhando a frota: "o que cada
 * máquina fechou no mês, e o que ainda está pendurado nela?".
 *
 * O recorte do mês vale para o que FOI FEITO. Mas o mês esconde a OS esquecida
 * lá atrás — então cada card diz, à parte, quantas OS aquela máquina tem em
 * aberto HOJE, contando qualquer mês. E a máquina que não rodou no mês, mas
 * tem OS parada, aparece do mesmo jeito: senão a OS esquecida sumia justo do
 * relatório que deveria denunciá-la.
 */

/** O mês de uma máquina, do jeito que o card mostra. */
interface MaquinaNoMes {
  id: string;
  name: string;
  category: string | null;
  plate: string | null;
  finalizadas: MachineServico[];
  andamento: MachineServico[];
  pendentes: MachineServico[];
  /** Só o que já fechou — é o que dá para cobrar sem discussão. */
  valorFinalizado: number;
  /** Tudo que a máquina rodou no mês, fechado ou não. */
  valorTotal: number;
  /** Em aberto HOJE, contando meses anteriores. */
  emAbertoAgora: number;
  /** Há quantos dias a mais antiga em aberto está esperando. */
  maisAntiga: number;
}

interface Props {
  machines: MachineResumo[];
  /** As OS da ficha no mês da tela. */
  servicos: MachineServico[];
  /** As OS ainda em aberto, de qualquer mês — é o que o mês não mostra. */
  abertasDeSempre: MachineServico[];
  mesLabel: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** Tocar no card abre a ficha daquele veículo. */
  onAbrirFicha: (machineId: string) => void;
}

export function RelatorioOsTab({
  machines,
  servicos,
  abertasDeSempre,
  mesLabel,
  onPrevMonth,
  onNextMonth,
  onAbrirFicha,
}: Props) {
  const porMaquina = useMemo(() => {
    const dados = new Map(machines.map((m) => [m.id, m]));

    // Quantas OS cada máquina tem em aberto hoje, e desde quando.
    const abertas = new Map<string, { n: number; maisAntiga: number }>();
    for (const s of abertasDeSempre) {
      const cur = abertas.get(s.machine_id) ?? { n: 0, maisAntiga: 0 };
      cur.n += 1;
      cur.maisAntiga = Math.max(cur.maisAntiga, Math.max(0, -daysUntil(s.service_date)));
      abertas.set(s.machine_id, cur);
    }

    const novo = (id: string): MaquinaNoMes => {
      const m = dados.get(id);
      const emAberto = abertas.get(id);
      return {
        id,
        name: m?.name ?? "Máquina",
        category: m?.category ?? null,
        plate: m?.plate ?? null,
        finalizadas: [],
        andamento: [],
        pendentes: [],
        valorFinalizado: 0,
        valorTotal: 0,
        emAbertoAgora: emAberto?.n ?? 0,
        maisAntiga: emAberto?.maisAntiga ?? 0,
      };
    };

    const map = new Map<string, MaquinaNoMes>();

    for (const s of servicos) {
      if (!map.has(s.machine_id)) map.set(s.machine_id, novo(s.machine_id));
      const alvo = map.get(s.machine_id)!;
      const situacao = situacaoDaMaquina(s.status, s.started_at);
      const valor = Number(s.total ?? 0);

      if (situacao === "finalizada") {
        alvo.finalizadas.push(s);
        alvo.valorFinalizado += valor;
      } else if (situacao === "andamento") {
        alvo.andamento.push(s);
      } else {
        alvo.pendentes.push(s);
      }
      alvo.valorTotal += valor;
    }

    // A máquina parada no mês, mas com OS pendurada, entra do mesmo jeito.
    for (const machineId of abertas.keys()) {
      if (!map.has(machineId)) map.set(machineId, novo(machineId));
    }

    // Quem mais rodou primeiro; empate desempata pelo que já fechou em reais.
    return [...map.values()].sort((a, b) => {
      const qa = a.finalizadas.length + a.andamento.length + a.pendentes.length;
      const qb = b.finalizadas.length + b.andamento.length + b.pendentes.length;
      return qb - qa || b.valorFinalizado - a.valorFinalizado;
    });
  }, [machines, servicos, abertasDeSempre]);

  const totais = useMemo(
    () => ({
      finalizadas: porMaquina.reduce((s, m) => s + m.finalizadas.length, 0),
      abertasNoMes: porMaquina.reduce(
        (s, m) => s + m.andamento.length + m.pendentes.length,
        0
      ),
      valorFinalizado: porMaquina.reduce((s, m) => s + m.valorFinalizado, 0),
    }),
    [porMaquina]
  );

  const abertasHoje = abertasDeSempre.length;

  return (
    <div className="space-y-4">
      <MonthNav label={mesLabel} onPrev={onPrevMonth} onNext={onNextMonth} />

      <div className="grid grid-cols-3 gap-2">
        <SummaryStatCard
          tone="emerald"
          icon={Tractor}
          label="Finalizadas"
          value={String(totais.finalizadas)}
        />
        <SummaryStatCard
          tone="amber"
          icon={Clock}
          label="Abertas no mês"
          value={String(totais.abertasNoMes)}
        />
        <SummaryStatCard
          tone="produmar"
          icon={Tractor}
          label="Fechado"
          amount={totais.valorFinalizado}
        />
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        O que cada máquina fez em {mesLabel}. Toque numa delas para abrir a ficha.
        {abertasHoje > 0 && (
          <>
            {" "}
            Ao todo há{" "}
            <span className="font-medium text-amber-600 dark:text-amber-400">
              {abertasHoje} {abertasHoje === 1 ? "OS em aberto" : "OS em aberto"}
            </span>{" "}
            na frota hoje, contando meses anteriores.
          </>
        )}
      </p>

      {porMaquina.length === 0 ? (
        <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
          Nenhuma OS de máquina em {mesLabel}.
        </div>
      ) : (
        <div className="space-y-3">
          {porMaquina.map((m) => (
            <MaquinaCard key={m.id} m={m} onClick={() => onAbrirFicha(m.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Quanto tempo parada já é problema — uma semana ainda é o ritmo do serviço. */
function toneDias(dias: number): string {
  if (dias >= 15) return "text-red-600 dark:text-red-400 font-medium";
  if (dias >= 7) return "text-amber-600 dark:text-amber-400";
  return "text-slate-500 dark:text-slate-400";
}

function Selo({ situacao, valor }: { situacao: SituacaoOs; valor: number }) {
  return (
    <span
      className={cn(
        "text-[10px] font-medium px-2 py-0.5 rounded-full",
        SITUACAO_STYLE[situacao]
      )}
    >
      {valor} {SITUACAO_PLURAL[situacao]}
    </span>
  );
}

function MaquinaCard({ m, onClick }: { m: MaquinaNoMes; onClick: () => void }) {
  const total = m.finalizadas.length + m.andamento.length + m.pendentes.length;
  const falta = m.valorTotal - m.valorFinalizado;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 transition-colors hover:bg-produmar-50/40 dark:hover:bg-slate-800/40"
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p className="font-medium text-slate-800 dark:text-slate-100 truncate">
            {m.name}
          </p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {m.category && (
              <span
                className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded",
                  categoryChip(m.category)
                )}
              >
                {machineCategoryLabel(m.category)}
              </span>
            )}
            {m.plate && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                {m.plate}
              </span>
            )}
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              {total} no mês
            </span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            <Money value={m.valorFinalizado} />
          </p>
          <p className="text-[10px] text-slate-400 dark:text-slate-500">fechado</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        <Selo situacao="finalizada" valor={m.finalizadas.length} />
        <Selo situacao="andamento" valor={m.andamento.length} />
        <Selo situacao="pendente" valor={m.pendentes.length} />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {m.emAbertoAgora > 0 ? (
          <span className={cn("flex items-center gap-1", toneDias(m.maisAntiga))}>
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            {m.emAbertoAgora} em aberto hoje · a mais antiga há {m.maisAntiga}{" "}
            {m.maisAntiga === 1 ? "dia" : "dias"}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
            Nada em aberto nesta máquina
          </span>
        )}
        {falta > 0 && (
          <span className="text-slate-400 dark:text-slate-500 tabular-nums">
            falta fechar {formatBRL(falta)}
          </span>
        )}
        <span className="ml-auto flex items-center gap-0.5 text-produmar-600 dark:text-produmar-400">
          Abrir ficha <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </div>
    </button>
  );
}
