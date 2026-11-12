"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  HandCoins,
  Plus,
  Receipt,
  Search,
  Tractor,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { MonthNav } from "@/components/ui/month-nav";
import { SummaryStatCard } from "@/components/ui/summary-stat-card";
import { QuickCreateMachineDialog } from "@/components/operacoes/quick-create-machine-dialog";
import { cn, formatBRL, formatDate, machineCategoryLabel } from "@/lib/utils";
import { DespesaDialog } from "./despesa-dialog";
import { RelatorioOsTab } from "./relatorio-os-tab";
import { RelatorioMensalTab } from "./relatorio-mensal-tab";
import { VeiculoFichaDialog } from "./veiculo-ficha-dialog";
import { ParceriasTab } from "./parcerias-tab";
import { Chip, categoryChip, toneResultado } from "./frota-shared";
import {
  MACHINE_CATEGORIES,
  type MachineDespesa,
  type MachineFichaLinha,
  type MachineParceiro,
  type MachineParceiroSaldo,
  type MachineParceiroVeiculo,
  type MachineResumo,
  type MachineServico,
  type MachineTroca,
  type OsDaFichaNoRelatorio,
  type OsDeOperacoesNaMaquina,
} from "@/lib/types";

interface Props {
  machines: MachineResumo[];
  /** A ficha de todos os veículos, no mês da tela. */
  ficha: MachineFichaLinha[];
  servicos: MachineServico[];
  despesas: MachineDespesa[];
  /** Operadores com login — a OS pode ser enviada para o celular de um deles. */
  operators: { id: string; name: string }[];
  /** A troca de diárias de máquina com o parceiro (aba 2). */
  parceiros: MachineParceiro[];
  trocas: MachineTroca[];
  saldos: MachineParceiroSaldo[];
  veiculosDeParceiro: MachineParceiroVeiculo[];
  month: string;
  /**
   * TODAS as OS da ficha — de qualquer mês e em qualquer situação. É a base do
   * relatório, que não é mensal: a pergunta lá é o que a máquina já fez e o
   * que ainda deve.
   */
  todasAsOs: OsDaFichaNoRelatorio[];
  /** E as OS de Operações que usaram máquina — o relatório conta junto. */
  osDeOperacoes: OsDeOperacoesNaMaquina[];
  /** Migration 073 ainda não rodou: a tela abre, mas avisa. */
  migrationPendente?: boolean;
  /** Migration 076 ainda não rodou: a aba da parceria avisa. */
  parceriaPendente?: boolean;
  /** Migration 132 já rodou: a ficha deixa cadastrar o valor da hora. */
  valorHoraPronto?: boolean;
}

/**
 * Os recortes da tela: a frota, o relatório do mês (o que cada máquina fez,
 * pra quem, quem trabalhou e quanto arrecadou), o relatório de OS de cada
 * máquina e o escambo de diárias com o parceiro.
 */
type Aba = "veiculos" | "mensal" | "relatorio" | "parceria";

const ABAS = [
  { value: "veiculos" as const, label: "Veículos" },
  { value: "mensal" as const, label: "Relatório do mês" },
  { value: "relatorio" as const, label: "Relatório de OS" },
  { value: "parceria" as const, label: "Troca com parceiro" },
];

/** O que um veículo fez no mês — é o que o card mostra. */
interface NoMes {
  receitas: number;
  despesas: number;
  resultado: number;
  internos: number;
  aReceber: number;
  lancamentos: number;
  /** OS da ficha que ainda não foram concluídas — o verde do calendário. */
  abertas: number;
}

const ZERO: NoMes = {
  receitas: 0,
  despesas: 0,
  resultado: 0,
  internos: 0,
  aReceber: 0,
  lancamentos: 0,
  abertas: 0,
};

/**
 * MÁQUINAS E VEÍCULOS — a frota com a conta de cada um no mês.
 *
 * A OS é do cliente; a ficha é do veículo. Aqui o dono vê, de relance, o que
 * cada máquina rendeu e custou no mês, quem ainda deve por serviço prestado, e
 * abre a ficha de qualquer uma para lançar diária, viagem, frete ou despesa.
 */
export function FrotaPageClient({
  machines,
  ficha,
  servicos,
  despesas,
  operators,
  todasAsOs,
  osDeOperacoes,
  parceiros,
  trocas,
  saldos,
  veiculosDeParceiro,
  month,
  migrationPendente = false,
  parceriaPendente = false,
  valorHoraPronto = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const [aba, setAba] = useState<Aba>("veiculos");
  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState<string>("todas");
  const [fichaMachineId, setFichaMachineId] = useState<string | null>(null);

  const [despesaOpen, setDespesaOpen] = useState(false);
  const [novoVeiculoOpen, setNovoVeiculoOpen] = useState(false);

  const [year, monthNum] = month.split("-").map(Number);
  const mesLabel = new Date(year, monthNum - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  function navigateMonth(dir: -1 | 1) {
    const d = new Date(year, monthNum - 1 + dir, 1);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    startTransition(() => router.push(`${pathname}?m=${m}`));
  }

  /** As linhas do mês, separadas por veículo. */
  const fichaPorMaquina = useMemo(() => {
    const map = new Map<string, MachineFichaLinha[]>();
    for (const l of ficha) {
      const atual = map.get(l.machine_id);
      if (atual) atual.push(l);
      else map.set(l.machine_id, [l]);
    }
    return map;
  }, [ficha]);

  /** A conta do mês de cada veículo. */
  const noMesPorMaquina = useMemo(() => {
    const map = new Map<string, NoMes>();
    for (const l of ficha) {
      const cur = { ...(map.get(l.machine_id) ?? ZERO) };
      const v = Number(l.value);
      cur.lancamentos += 1;
      if (l.kind === "servico" && l.status === "aberta") cur.abertas += 1;
      if (l.internal) cur.internos += v;
      else if (l.flow === "receita") {
        cur.receitas += v;
        if (l.paid === false) cur.aReceber += v;
      } else cur.despesas += v;
      cur.resultado = cur.receitas - cur.despesas;
      map.set(l.machine_id, cur);
    }
    return map;
  }, [ficha]);

  /** Os nomes que já contrataram — viram sugestão no lançamento. */
  const contratantes = useMemo(() => {
    const nomes = new Set<string>();
    for (const l of ficha) if (l.flow === "receita" && l.person) nomes.add(l.person);
    return [...nomes].sort();
  }, [ficha]);

  /** O que cada contratante deve e já pagou no mês — a pergunta "pra quem foi". */
  const porContratante = useMemo(() => {
    const map = new Map<string, { nome: string; total: number; aReceber: number; servicos: number }>();
    for (const l of ficha) {
      if (l.flow !== "receita" || l.internal) continue;
      const nome = l.person?.trim() || "SEM CONTRATANTE";
      const cur = map.get(nome) ?? { nome, total: 0, aReceber: 0, servicos: 0 };
      cur.total += Number(l.value);
      if (l.paid === false) cur.aReceber += Number(l.value);
      cur.servicos += 1;
      map.set(nome, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [ficha]);

  /** Veículo inativo só aparece se ainda teve movimento no mês. */
  const visiveis = useMemo(() => {
    const q = search.trim().toUpperCase();
    return machines.filter((m) => {
      if (!m.active && !fichaPorMaquina.has(m.id)) return false;
      if (categoria !== "todas" && (m.category ?? "outro") !== categoria) return false;
      if (!q) return true;
      return (
        m.name.toUpperCase().includes(q) ||
        (m.plate ?? "").toUpperCase().includes(q) ||
        machineCategoryLabel(m.category).toUpperCase().includes(q)
      );
    });
  }, [machines, search, categoria, fichaPorMaquina]);

  /** Ordenado pelo que mais movimentou no mês — o resto desce. */
  const ordenados = useMemo(
    () =>
      [...visiveis].sort((a, b) => {
        const ma = noMesPorMaquina.get(a.id) ?? ZERO;
        const mb = noMesPorMaquina.get(b.id) ?? ZERO;
        if (mb.lancamentos !== ma.lancamentos) return mb.lancamentos - ma.lancamentos;
        return a.name.localeCompare(b.name);
      }),
    [visiveis, noMesPorMaquina]
  );

  /** O total do mês, só dos veículos que a tela está mostrando. */
  const totais = useMemo(() => {
    let receitas = 0;
    let gastos = 0;
    let aReceber = 0;
    for (const m of visiveis) {
      const n = noMesPorMaquina.get(m.id) ?? ZERO;
      receitas += n.receitas;
      gastos += n.despesas;
      aReceber += n.aReceber;
    }
    return { receitas, gastos, aReceber, resultado: receitas - gastos };
  }, [visiveis, noMesPorMaquina]);

  const fichaMachine = useMemo(
    () => machines.find((m) => m.id === fichaMachineId) ?? null,
    [machines, fichaMachineId]
  );

  /** Só veículo ativo entra no seletor de um lançamento novo. */
  const ativos = useMemo(() => machines.filter((m) => m.active), [machines]);

  const categoriasComVeiculo = useMemo(() => {
    const usadas = new Set(machines.filter((m) => m.active).map((m) => m.category ?? "outro"));
    return MACHINE_CATEGORIES.filter((c) => usadas.has(c.value));
  }, [machines]);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">
            Máquinas e Veículos
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            A ficha de cada um: a OS no calendário — diária, frete, viagem — com despesas
            e receitas
          </p>
        </div>
        {/* O cadastro de veículo é da primeira aba; na parceria ele só atrapalha */}
        {aba === "veiculos" && (
          <Button
            variant="outline"
            className="flex-shrink-0"
            onClick={() => setNovoVeiculoOpen(true)}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Veículo</span>
          </Button>
        )}
      </div>

      {/* As duas metades da tela */}
      <FilterTabs tabs={ABAS} active={aba} onChange={setAba} />

      {migrationPendente && (
        <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            Rode a migration 073 no Supabase para a ficha começar a guardar serviço e
            despesa. Até lá a tela mostra só o cadastro dos veículos.
          </span>
        </p>
      )}

      {aba === "veiculos" ? (
      <>
      {/* Mês */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
        <MonthNav
          label={mesLabel}
          onPrev={() => navigateMonth(-1)}
          onNext={() => navigateMonth(1)}
        />
        {/* A OS saiu daqui: solta ela pedia escolher o veículo na mão, e era
            aí que ia para a máquina errada. Agora só nasce dentro da ficha,
            onde a máquina já vem travada. */}
        <Button
          variant="outline"
          className="h-11 sm:h-10"
          onClick={() => setDespesaOpen(true)}
        >
          <Plus className="w-4 h-4" />
          Despesa
        </Button>
      </div>

      {/* O mês inteiro da frota */}
      <div className="grid grid-cols-3 gap-2">
        <SummaryStatCard
          tone="emerald"
          icon={HandCoins}
          label="Receitas"
          amount={totais.receitas}
        />
        <SummaryStatCard tone="red" icon={Receipt} label="Despesas" amount={totais.gastos} />
        <SummaryStatCard
          tone={totais.resultado < 0 ? "red" : "produmar"}
          icon={TrendingUp}
          label="Resultado"
          amount={totais.resultado}
        />
      </div>

      {totais.aReceber > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400 tabular-nums">
          Falta receber {formatBRL(totais.aReceber)} de serviço já feito neste mês.
        </p>
      )}

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, placa ou tipo..."
          className="w-full h-11 sm:h-10 pl-9 pr-3 rounded-lg border border-produmar-100 dark:border-slate-700 bg-white dark:bg-slate-800 text-base sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-produmar-500"
        />
      </div>

      {/* Filtro por tipo de veículo */}
      {categoriasComVeiculo.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
          <Chip
            label="Todos"
            ativo={categoria === "todas"}
            onClick={() => setCategoria("todas")}
          />
          {categoriasComVeiculo.map((c) => (
            <Chip
              key={c.value}
              label={c.label}
              ativo={categoria === c.value}
              onClick={() => setCategoria(categoria === c.value ? "todas" : c.value)}
            />
          ))}
        </div>
      )}

      {/* A frota */}
      {ordenados.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
          <Tractor className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {machines.length === 0
              ? "Nenhuma máquina cadastrada ainda."
              : "Nenhum veículo com esse filtro."}
          </p>
          {machines.length === 0 && (
            <Button className="mt-3" onClick={() => setNovoVeiculoOpen(true)}>
              <Plus className="w-4 h-4" />
              Cadastrar o primeiro
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ordenados.map((m) => {
            const n = noMesPorMaquina.get(m.id) ?? ZERO;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setFichaMachineId(m.id)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-left transition-colors hover:border-produmar-300 dark:hover:border-produmar-700 active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {m.name}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      {m.category && (
                        <span
                          className={cn(
                            "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                            categoryChip(m.category)
                          )}
                        >
                          {machineCategoryLabel(m.category)}
                        </span>
                      )}
                      {m.plate && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          {m.plate}
                        </span>
                      )}
                      {!m.active && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          INATIVO
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-base font-bold tabular-nums flex-shrink-0",
                      toneResultado(n.resultado)
                    )}
                  >
                    {formatBRL(n.resultado)}
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] tabular-nums">
                  <span className="text-slate-500 dark:text-slate-400 truncate">
                    Entrou{" "}
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {formatBRL(n.receitas)}
                    </span>
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 truncate">
                    Saiu{" "}
                    <span className="font-semibold text-rose-700 dark:text-rose-400">
                      {formatBRL(n.despesas)}
                    </span>
                  </span>
                </div>

                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 tabular-nums truncate">
                  {n.lancamentos === 0
                    ? "Nada lançado neste mês"
                    : `${n.lancamentos} ${n.lancamentos === 1 ? "lançamento" : "lançamentos"} no mês`}
                  {n.aReceber > 0 ? ` · ${formatBRL(n.aReceber)} a receber` : ""}
                  {n.internos > 0 ? ` · ${formatBRL(n.internos)} da firma` : ""}
                </p>

                {/* O que ainda está em aberto — é o verde do calendário da ficha */}
                {n.abertas > 0 && (
                  <p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    {n.abertas === 1 ? "1 OS aberta" : `${n.abertas} OS abertas`}
                  </p>
                )}

                {m.ultimo_movimento && (
                  <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500 truncate">
                    Último movimento em {formatDate(m.ultimo_movimento)} · resultado de sempre{" "}
                    <span className={cn("font-semibold", toneResultado(Number(m.resultado)))}>
                      {formatBRL(Number(m.resultado))}
                    </span>
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* PRA QUEM FOI — o mês somado por contratante */}
      {porContratante.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Por contratante — {mesLabel}
          </p>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            {porContratante.map((c) => (
              <div
                key={c.nome}
                className="flex items-center gap-2.5 px-3 py-2.5 bg-white dark:bg-slate-900"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    {c.nome}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums truncate">
                    {c.servicos} {c.servicos === 1 ? "serviço" : "serviços"}
                    {c.aReceber > 0 ? ` · ${formatBRL(c.aReceber)} a receber` : " · tudo recebido"}
                  </p>
                </div>
                <p className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 flex-shrink-0">
                  {formatBRL(c.total)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      </>
      ) : aba === "mensal" ? (
        <RelatorioMensalTab
          machines={machines}
          ficha={ficha}
          servicos={servicos}
          mesLabel={mesLabel}
          onPrevMonth={() => navigateMonth(-1)}
          onNextMonth={() => navigateMonth(1)}
          onAbrirFicha={setFichaMachineId}
        />
      ) : aba === "relatorio" ? (
        <RelatorioOsTab
          machines={machines}
          todasAsOs={todasAsOs}
          osDeOperacoes={osDeOperacoes}
          mes={month}
          mesLabel={mesLabel}
          onPrevMonth={() => navigateMonth(-1)}
          onNextMonth={() => navigateMonth(1)}
          onAbrirFicha={setFichaMachineId}
        />
      ) : (
        <ParceriasTab
          parceiros={parceiros}
          trocas={trocas}
          saldos={saldos}
          veiculos={veiculosDeParceiro}
          minhasMaquinas={machines}
          year={year}
          month={monthNum - 1}
          onPrevMonth={() => navigateMonth(-1)}
          onNextMonth={() => navigateMonth(1)}
          migrationPendente={parceriaPendente}
        />
      )}

      {/* A ficha do veículo escolhido */}
      {fichaMachine && (
        <VeiculoFichaDialog
          open={!!fichaMachine}
          onClose={() => setFichaMachineId(null)}
          machine={fichaMachine}
          machines={machines}
          valorHoraPronto={valorHoraPronto}
          linhas={fichaPorMaquina.get(fichaMachine.id) ?? []}
          servicos={servicos.filter((s) => s.machine_id === fichaMachine.id)}
          despesas={despesas.filter((d) => d.machine_id === fichaMachine.id)}
          contratantes={contratantes}
          operators={operators}
          mesLabel={mesLabel}
          year={year}
          month={monthNum - 1}
          onPrevMonth={() => navigateMonth(-1)}
          onNextMonth={() => navigateMonth(1)}
        />
      )}

      {/* Despesa continua podendo ser lançada solta, escolhendo o veículo */}
      <DespesaDialog
        open={despesaOpen}
        onClose={() => setDespesaOpen(false)}
        despesa={null}
        machines={ativos}
      />

      <QuickCreateMachineDialog
        open={novoVeiculoOpen}
        onClose={() => setNovoVeiculoOpen(false)}
        onCreated={() => router.refresh()}
      />
    </div>
  );
}
