"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Clock } from "lucide-react";
import { MonthNav } from "@/components/ui/month-nav";
import { Money } from "@/components/ui/money";
import { SummaryStatCard } from "@/components/ui/summary-stat-card";
import {
  SITUACAO_PLURAL,
  SITUACAO_STYLE,
  situacaoDaMaquina,
  situacaoDoServico,
  type SituacaoOs,
} from "@/lib/os-situacao";
import { cn, daysUntil, formatBRL, machineCategoryLabel } from "@/lib/utils";
import { Chip, categoryChip } from "./frota-shared";
import type {
  MachineResumo,
  OsDaFichaNoRelatorio,
  OsDeOperacoesNaMaquina,
} from "@/lib/types";

/**
 * RELATÓRIO DE OS, MÁQUINA POR MÁQUINA.
 *
 * A pergunta que esta aba responde é a do dono olhando a frota: "o que cada
 * máquina já fez, e o que ainda está pendurado nela?".
 *
 * Por isso ela NÃO é mensal como o resto da tela. O padrão é TUDO — toda OS
 * daquela máquina, fechada ou aberta, de qualquer mês. Um relatório que só
 * mostra o mês corrente esconde justamente as duas coisas que interessam: o
 * histórico de quanto a máquina rendeu e a OS esquecida lá atrás. O recorte do
 * mês continua disponível num toque, para quem quiser fechar o mês.
 *
 * E conta as DUAS famílias de OS da máquina: a da ficha do veículo
 * (machine_servicos) e a do módulo Operações que usou aquela máquina — que na
 * ficha aparece como "Vindas de Operações". Para quem olha a frota, as duas
 * são OS da máquina.
 */

/** Uma OS de máquina achatada — venha da ficha ou de Operações. */
interface OsDaMaquina {
  id: string;
  origem: "ficha" | "operacoes";
  machineId: string;
  data: string;
  situacao: SituacaoOs;
  valor: number;
}

/** O que uma máquina fez no recorte escolhido. */
interface MaquinaNoRelatorio {
  id: string;
  name: string;
  category: string | null;
  plate: string | null;
  finalizadas: number;
  andamento: number;
  pendentes: number;
  canceladas: number;
  daFicha: number;
  deOperacoes: number;
  /** Só o que já fechou — é o que dá para cobrar sem discussão. */
  valorFinalizado: number;
  /** Tudo que a máquina rodou, fechado ou não. */
  valorTotal: number;
  /** Em aberto HOJE, de qualquer mês — independe do recorte da tela. */
  emAbertoAgora: number;
  /** Há quantos dias a mais antiga em aberto está esperando. */
  maisAntiga: number;
}

type Recorte = "tudo" | "mes";

interface Props {
  machines: MachineResumo[];
  /** TODAS as OS da ficha — qualquer mês, qualquer situação. */
  todasAsOs: OsDaFichaNoRelatorio[];
  /** E as OS de Operações que usaram máquina. */
  osDeOperacoes: OsDeOperacoesNaMaquina[];
  /** "2026-09" — o mês da tela, usado só quando o recorte é o mês. */
  mes: string;
  mesLabel: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** Tocar no card abre a ficha daquele veículo. */
  onAbrirFicha: (machineId: string) => void;
}

export function RelatorioOsTab({
  machines,
  todasAsOs,
  osDeOperacoes,
  mes,
  mesLabel,
  onPrevMonth,
  onNextMonth,
  onAbrirFicha,
}: Props) {
  // Começa em TUDO: o relatório existe para mostrar o histórico inteiro, e um
  // filtro ligado por padrão é o que faz parecer que "não veio nada".
  const [recorte, setRecorte] = useState<Recorte>("tudo");

  /** As duas famílias viradas na mesma linha. */
  const todas = useMemo<OsDaMaquina[]>(
    () => [
      ...todasAsOs.map<OsDaMaquina>((s) => ({
        id: s.id,
        origem: "ficha",
        machineId: s.machine_id,
        data: s.service_date,
        situacao: situacaoDaMaquina(s.status, s.started_at),
        valor: Number(s.total ?? 0),
      })),
      ...osDeOperacoes.map<OsDaMaquina>((o) => ({
        id: o.id,
        origem: "operacoes",
        machineId: o.machine_id,
        // A OS de Operações conta no dia em que foi entregue; enquanto não
        // fecha, vale o dia em que foi aberta.
        data: o.delivery_date ?? o.issue_date,
        situacao: situacaoDoServico(o.status),
        valor: Number(o.total_amount ?? 0),
      })),
    ],
    [todasAsOs, osDeOperacoes]
  );

  const doRecorte = useMemo(
    () => (recorte === "tudo" ? todas : todas.filter((o) => o.data.startsWith(mes))),
    [todas, recorte, mes]
  );

  const porMaquina = useMemo(() => {
    const cadastro = new Map(machines.map((m) => [m.id, m]));

    // Em aberto HOJE — sempre de todas, nunca do recorte: é o que está
    // pendurado na máquina agora, e o mês da tela não muda isso.
    const abertas = new Map<string, { n: number; maisAntiga: number }>();
    for (const o of todas) {
      if (o.situacao !== "pendente" && o.situacao !== "andamento") continue;
      const cur = abertas.get(o.machineId) ?? { n: 0, maisAntiga: 0 };
      cur.n += 1;
      cur.maisAntiga = Math.max(cur.maisAntiga, Math.max(0, -daysUntil(o.data)));
      abertas.set(o.machineId, cur);
    }

    const novo = (id: string): MaquinaNoRelatorio => {
      const m = cadastro.get(id);
      const aberto = abertas.get(id);
      return {
        id,
        name: m?.name ?? "Máquina",
        category: m?.category ?? null,
        plate: m?.plate ?? null,
        finalizadas: 0,
        andamento: 0,
        pendentes: 0,
        canceladas: 0,
        daFicha: 0,
        deOperacoes: 0,
        valorFinalizado: 0,
        valorTotal: 0,
        emAbertoAgora: aberto?.n ?? 0,
        maisAntiga: aberto?.maisAntiga ?? 0,
      };
    };

    const map = new Map<string, MaquinaNoRelatorio>();

    for (const o of doRecorte) {
      if (!map.has(o.machineId)) map.set(o.machineId, novo(o.machineId));
      const alvo = map.get(o.machineId)!;

      if (o.origem === "ficha") alvo.daFicha += 1;
      else alvo.deOperacoes += 1;

      if (o.situacao === "cancelada") {
        alvo.canceladas += 1;
        continue;
      }
      if (o.situacao === "finalizada") {
        alvo.finalizadas += 1;
        alvo.valorFinalizado += o.valor;
      } else if (o.situacao === "andamento") {
        alvo.andamento += 1;
      } else {
        alvo.pendentes += 1;
      }
      alvo.valorTotal += o.valor;
    }

    // A máquina sem nada no recorte, mas com OS pendurada, aparece do mesmo
    // jeito — senão a OS esquecida some justo do relatório que a denuncia.
    for (const machineId of abertas.keys()) {
      if (!map.has(machineId)) map.set(machineId, novo(machineId));
    }

    // Quem mais rodou primeiro; empate desempata pelo que já fechou em reais.
    return [...map.values()].sort((a, b) => {
      const qa = a.finalizadas + a.andamento + a.pendentes;
      const qb = b.finalizadas + b.andamento + b.pendentes;
      return qb - qa || b.valorFinalizado - a.valorFinalizado;
    });
  }, [machines, doRecorte, todas]);

  const totais = useMemo(
    () => ({
      finalizadas: porMaquina.reduce((s, m) => s + m.finalizadas, 0),
      abertas: porMaquina.reduce((s, m) => s + m.andamento + m.pendentes, 0),
      valorFinalizado: porMaquina.reduce((s, m) => s + m.valorFinalizado, 0),
    }),
    [porMaquina]
  );

  const abertasHoje = useMemo(
    () =>
      todas.filter((o) => o.situacao === "pendente" || o.situacao === "andamento").length,
    [todas]
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        <Chip label="Tudo" ativo={recorte === "tudo"} onClick={() => setRecorte("tudo")} />
        <Chip
          label="Só este mês"
          ativo={recorte === "mes"}
          onClick={() => setRecorte("mes")}
        />
      </div>

      {recorte === "mes" && (
        <MonthNav label={mesLabel} onPrev={onPrevMonth} onNext={onNextMonth} />
      )}

      <div className="grid grid-cols-3 gap-2">
        <SummaryStatCard
          tone="emerald"
          icon={Clock}
          label="Finalizadas"
          value={String(totais.finalizadas)}
        />
        <SummaryStatCard
          tone="amber"
          icon={AlertTriangle}
          label="Em aberto"
          value={String(totais.abertas)}
        />
        <SummaryStatCard
          tone="produmar"
          icon={Clock}
          label="Fechado"
          amount={totais.valorFinalizado}
        />
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        {recorte === "tudo"
          ? "Toda OS de cada máquina, fechada ou aberta, de qualquer mês — da ficha do veículo e de Operações."
          : `As OS de cada máquina em ${mesLabel}.`}{" "}
        Toque numa máquina para abrir a ficha dela.
        {abertasHoje > 0 && (
          <>
            {" "}
            A frota tem{" "}
            <span className="font-medium text-amber-600 dark:text-amber-400">
              {abertasHoje} em aberto
            </span>{" "}
            hoje.
          </>
        )}
      </p>

      {porMaquina.length === 0 ? (
        <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
          {recorte === "tudo"
            ? "Nenhuma OS de máquina registrada ainda."
            : `Nenhuma OS de máquina em ${mesLabel}.`}
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

function MaquinaCard({
  m,
  onClick,
}: {
  m: MaquinaNoRelatorio;
  onClick: () => void;
}) {
  const total = m.finalizadas + m.andamento + m.pendentes;
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
              {total} {total === 1 ? "OS" : "OS"}
              {/* De onde vieram: ajuda a bater com o que a ficha mostra */}
              {m.deOperacoes > 0 && m.daFicha > 0
                ? ` · ${m.daFicha} da ficha, ${m.deOperacoes} de Operações`
                : m.deOperacoes > 0
                  ? " · de Operações"
                  : ""}
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
        <Selo situacao="finalizada" valor={m.finalizadas} />
        <Selo situacao="andamento" valor={m.andamento} />
        <Selo situacao="pendente" valor={m.pendentes} />
        {m.canceladas > 0 && <Selo situacao="cancelada" valor={m.canceladas} />}
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
