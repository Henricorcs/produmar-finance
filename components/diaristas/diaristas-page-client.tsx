"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  HardHat,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, formatBRL, formatDate, getInitials, servicoConta } from "@/lib/utils";
import { monthLabel, monthRange } from "./diarista-shared";
import { DiaristaDialog } from "./diarista-dialog";
import { DiaristaDetailDialog } from "./diarista-detail-dialog";
import { DiaDetailDialog } from "./dia-detail-dialog";
import { RelatorioDialog } from "./relatorio-dialog";
import { AcertoDialog } from "./acerto-dialog";
import type { DiaristaObra } from "./lancar-dia-dialog";
import type {
  Diarista,
  DiaristaAcerto,
  DiaristaAdiantamento,
  DiaristaDia,
  DiaristaResumo,
  SupplyObraSector,
  SupplyObraServicoView,
  WorkerType,
} from "@/lib/types";
import { WORKER_TYPE_LABEL } from "@/lib/types";

interface Props {
  diaristas: DiaristaResumo[];
  dias: DiaristaDia[];
  obras: DiaristaObra[];
  sectors: SupplyObraSector[];
  /** Vales de todo mundo — o diálogo do acerto filtra os de cada um (068). */
  adiantamentos?: DiaristaAdiantamento[];
  /** Acertos já feitos, para o histórico e para desfazer (068). */
  acertos?: DiaristaAcerto[];
  /**
   * Serviços por empreita / por metro combinados nos setores das obras (069).
   * Eles são lançados em Obras; aqui entram na conta de quem os fez.
   */
  servicos?: SupplyObraServicoView[];
}

type Tab = "pessoas" | "dias" | "servicos";

/**
 * O preço combinado com a pessoa, escrito do jeito que ela é paga: "R$ 2,00/m"
 * para quem ganha no metro, "R$ 500,00 por obra" para a empreita fechada,
 * "R$ 120,00/dia" para o diarista.
 */
function precoCombinado(d: DiaristaResumo): string {
  const modo = d.payment_mode ?? "diaria";
  if (modo === "metro") {
    const v = Number(d.meter_rate ?? 0);
    return v > 0 ? `${formatBRL(v)}/m` : "metro não combinado";
  }
  if (modo === "obra") {
    const v = Number(d.job_rate ?? 0);
    return v > 0 ? `${formatBRL(v)} por obra` : "valor da obra não combinado";
  }
  const v = Number(d.daily_rate ?? 0);
  return v > 0 ? `${formatBRL(v)}/dia` : "diária não combinada";
}

/**
 * A tela do chefe: quem são os colaboradores — diaristas e empreiteiros —,
 * quanto cada um ganha, para onde vai o PIX, e o fechamento do mês com o
 * relatório para pagar.
 *
 * O diarista vem por dia: quem marca o dia é o técnico, na tela dele. O
 * empreiteiro vem por serviço: quem lança o serviço é o chefe, no setor da
 * obra. As duas coisas caem aqui, viram conta e são pagas no mesmo acerto.
 */
export function DiaristasPageClient({
  diaristas,
  dias,
  obras,
  sectors,
  adiantamentos = [],
  acertos = [],
  servicos = [],
}: Props) {
  const hoje = new Date();
  const [year, setYear] = useState(hoje.getFullYear());
  const [month, setMonth] = useState(hoje.getMonth());
  const [tab, setTab] = useState<Tab>("pessoas");
  const [search, setSearch] = useState("");
  const [mostrarArquivados, setMostrarArquivados] = useState(false);
  /** Filtro por tipo: "" = todos, "diarista", "empreiteiro". */
  const [tipoFiltro, setTipoFiltro] = useState<"" | WorkerType>("");

  const [cadastroOpen, setCadastroOpen] = useState(false);
  const [editando, setEditando] = useState<Diarista | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [detalheDia, setDetalheDia] = useState<DiaristaDia | null>(null);
  const [relatorioOpen, setRelatorioOpen] = useState(false);
  /** Diarista com a conta aberta — o acerto vive fora da ficha, ver onAcerto. */
  const [acertoId, setAcertoId] = useState<string | null>(null);

  const { from, to } = monthRange(year, month);

  const nomePorId = useMemo(
    () => new Map(diaristas.map((d) => [d.id, d.name])),
    [diaristas]
  );
  const obraNome = useMemo(() => new Map(obras.map((o) => [o.id, o.name])), [obras]);

  /** Os dias lançados no mês que está na tela. */
  const diasDoMes = useMemo(
    () =>
      dias
        .filter((d) => d.work_date >= from && d.work_date <= to)
        .sort((a, b) => b.work_date.localeCompare(a.work_date)),
    [dias, from, to]
  );

  /** Os serviços feitos no mês que está na tela — a metade do empreiteiro. */
  const servicosDoMes = useMemo(
    () =>
      servicos
        .filter((s) => s.service_date >= from && s.service_date <= to)
        .sort((a, b) => b.service_date.localeCompare(a.service_date)),
    [servicos, from, to]
  );

  /**
   * Quanto cada um fez no mês, das DUAS origens: os dias marcados e os serviços
   * fechados. É o número que aparece no cartão da pessoa.
   */
  const resumoDoMes = useMemo(() => {
    const map = new Map<
      string,
      { dias: number; meias: number; servicos: number; total: number }
    >();
    for (const d of diasDoMes) {
      const cur = map.get(d.diarista_id) ?? {
        dias: 0,
        meias: 0,
        servicos: 0,
        total: 0,
      };
      cur.dias += 1;
      if (d.half_day) cur.meias += 1;
      // o valor da meia diária já está pela metade no lançamento (migration 064)
      cur.total += Number(d.daily_rate);
      map.set(d.diarista_id, cur);
    }
    for (const s of servicosDoMes) {
      if (!s.diarista_id) continue;
      const cur = map.get(s.diarista_id) ?? {
        dias: 0,
        meias: 0,
        servicos: 0,
        total: 0,
      };
      cur.servicos += 1;
      cur.total += Number(s.total_value);
      map.set(s.diarista_id, cur);
    }
    return map;
  }, [diasDoMes, servicosDoMes]);

  /**
   * Os serviços do mês agrupados POR PESSOA, com o total de cada uma. É o que
   * responde "quanto eu devo pra cada um": a lista corrida mostrava serviço a
   * serviço e não somava nada por quem fez.
   */
  const servicosPorPessoa = useMemo(() => {
    const map = new Map<
      string,
      {
        id: string;
        nome: string;
        itens: SupplyObraServicoView[];
        total: number;
        emAberto: number;
      }
    >();
    for (const s of servicosDoMes) {
      const key = s.diarista_id ?? "sem-dono";
      const g = map.get(key) ?? {
        id: key,
        nome: s.worker_name ?? "Sem profissional",
        itens: [],
        total: 0,
        emAberto: 0,
      };
      g.itens.push(s);
      g.total += Number(s.total_value);
      if (!s.acerto_id) g.emAberto += Number(s.total_value);
      map.set(key, g);
    }
    // quem tem mais a receber primeiro; "sem profissional" por último, que é
    // uma pendência de cadastro, não uma conta a pagar
    return [...map.values()].sort((a, b) => {
      if (a.id === "sem-dono") return 1;
      if (b.id === "sem-dono") return -1;
      return b.total - a.total;
    });
  }, [servicosDoMes]);

  const totalDiariasMes = diasDoMes.reduce((s, d) => s + Number(d.daily_rate), 0);
  const totalServicosMes = servicosDoMes.reduce(
    (s, v) => s + Number(v.total_value),
    0
  );
  const totalMes = totalDiariasMes + totalServicosMes;
  const meiasDoMes = diasDoMes.filter((d) => d.half_day).length;
  const ativos = diaristas.filter((d) => d.active);

  const listados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return diaristas
      .filter((d) => (mostrarArquivados ? true : d.active))
      .filter((d) =>
        q
          ? d.name.toLowerCase().includes(q) ||
            (d.profession ?? "").toLowerCase().includes(q)
          : true
      )
      .filter((d) => (tipoFiltro ? (d.worker_type ?? "diarista") === tipoFiltro : true))
      .sort((a, b) => {
        // quem trabalhou no mês sobe: é neles que o chefe mexe
        const ra = resumoDoMes.get(a.id);
        const rb = resumoDoMes.get(b.id);
        const na = (ra?.dias ?? 0) + (ra?.servicos ?? 0);
        const nb = (rb?.dias ?? 0) + (rb?.servicos ?? 0);
        if (na !== nb) return nb - na;
        return a.name.localeCompare(b.name);
      });
  }, [diaristas, search, mostrarArquivados, resumoDoMes, tipoFiltro]);

  const detalhe = diaristas.find((d) => d.id === detalheId) ?? null;
  const acertoDiarista = diaristas.find((d) => d.id === acertoId) ?? null;
  const arquivados = diaristas.length - ativos.length;
  /** Sem nenhum empreiteiro cadastrado, o filtro por tipo só ocupa espaço. */
  const temEmpreiteiro = diaristas.some((d) => d.worker_type === "empreiteiro");

  /** Sai da ficha e abre a conta — os dois diálogos juntos se atropelam. */
  function abrirAcerto(id: string) {
    setDetalheId(null);
    setAcertoId(id);
  }

  /** Fechou a conta: volta para a ficha de onde veio. */
  function fecharAcerto() {
    const voltarPara = acertoId;
    setAcertoId(null);
    if (voltarPara) setDetalheId(voltarPara);
  }

  function stepMonth(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  function novoDiarista() {
    setEditando(null);
    setCadastroOpen(true);
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">
            Colaboradores
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
            Diaristas e empreiteiros — e quanto cada um tem a receber
          </p>
        </div>
        <Button onClick={novoDiarista} className="flex-shrink-0">
          <Plus className="w-4 h-4" />
          Novo
        </Button>
      </div>

      {/* Painel único: o mês, os números do mês e o relatório */}
      <div className="rounded-xl border border-produmar-100/60 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => stepMonth(-1)}
            aria-label="Mês anterior"
            className="w-10 h-10 flex items-center justify-center rounded-lg text-produmar-600 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-sm font-semibold text-produmar-800 dark:text-slate-100 capitalize">
            {monthLabel(year, month)}
          </span>
          <button
            type="button"
            onClick={() => stepMonth(1)}
            aria-label="Próximo mês"
            className="w-10 h-10 flex items-center justify-center rounded-lg text-produmar-600 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-slate-800 transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* dois por linha no celular: com quatro colunas o "a pagar" truncava */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
          <Numero label="colaboradores" value={String(ativos.length)} />
          <Numero
            label={
              meiasDoMes > 0
                ? `diárias · ${meiasDoMes} ${meiasDoMes === 1 ? "meia" : "meias"}`
                : "diárias no mês"
            }
            value={String(diasDoMes.length)}
          />
          <Numero label="serviços no mês" value={String(servicosDoMes.length)} />
          <Numero label="a pagar no mês" value={formatBRL(totalMes)} destaque />
        </div>

        {/* De onde vem o "a pagar": as duas metades, quando as duas existem */}
        {totalDiariasMes > 0 && totalServicosMes > 0 && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center tabular-nums">
            {formatBRL(totalDiariasMes)} em diárias + {formatBRL(totalServicosMes)} em
            serviços
          </p>
        )}

        <button
          type="button"
          onClick={() => setRelatorioOpen(true)}
          className="w-full flex items-center justify-center gap-2 min-h-[48px] rounded-xl border border-produmar-200 dark:border-slate-700 text-sm font-semibold text-produmar-700 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-slate-800 transition-colors"
        >
          <FileText className="w-4 h-4" />
          Relatório
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
        {(
          [
            { value: "pessoas", label: "Pessoas", icon: Users, count: listados.length },
            { value: "dias", label: "Dias", icon: CalendarDays, count: diasDoMes.length },
            {
              value: "servicos",
              label: "Serviços",
              icon: HardHat,
              count: servicosDoMes.length,
            },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 min-h-[44px] rounded-md text-sm font-medium transition-colors",
                tab === t.value
                  ? "bg-white dark:bg-slate-700 text-produmar-700 dark:text-produmar-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400"
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
              <span className="opacity-50 tabular-nums">{t.count}</span>
            </button>
          );
        })}
      </div>

      {tab === "pessoas" && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou profissão..."
              className="pl-9"
              autoComplete="off"
            />
          </div>

          {/* Filtro por tipo — só aparece quando existem os dois */}
          {temEmpreiteiro && (
            <div className="flex gap-1.5">
              {(
                [
                  { v: "" as const, label: "Todos" },
                  { v: "diarista" as const, label: "Diaristas" },
                  { v: "empreiteiro" as const, label: "Empreiteiros" },
                ] as const
              ).map((t) => (
                <button
                  key={t.v}
                  type="button"
                  onClick={() => setTipoFiltro(t.v)}
                  className={cn(
                    "flex-1 min-h-[36px] rounded-full text-xs font-medium border transition-colors",
                    tipoFiltro === t.v
                      ? "bg-produmar-600 border-produmar-600 text-white"
                      : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {arquivados > 0 && (
            <button
              type="button"
              onClick={() => setMostrarArquivados((v) => !v)}
              className="text-xs font-medium text-produmar-600 dark:text-produmar-400 hover:underline"
            >
              {mostrarArquivados
                ? "Esconder os arquivados"
                : `Mostrar ${arquivados} arquivado(s)`}
            </button>
          )}

          {listados.length === 0 ? (
            <Vazio
              icon={Users}
              texto={
                diaristas.length === 0
                  ? "Nenhum colaborador cadastrado."
                  : "Ninguém encontrado com esse filtro."
              }
              dica={
                diaristas.length === 0
                  ? "Cadastre quem trabalha na obra — diarista ou empreiteiro —, com a profissão, a chave PIX e o preço combinado: a diária, o metro ou o valor da obra."
                  : undefined
              }
              acao={
                diaristas.length === 0 ? (
                  <Button size="sm" onClick={novoDiarista}>
                    <Plus className="w-4 h-4" /> Novo colaborador
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {listados.map((d) => {
                const r = resumoDoMes.get(d.id);
                const tipo = d.worker_type ?? "diarista";
                const empreiteiro = tipo === "empreiteiro";
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDetalheId(d.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border bg-white dark:bg-slate-900 p-3 text-left transition-colors active:scale-[0.99]",
                      d.active
                        ? "border-produmar-100/60 dark:border-slate-800 hover:border-produmar-200 dark:hover:border-slate-700"
                        : "border-dashed border-slate-200 dark:border-slate-700 opacity-70"
                    )}
                  >
                    <span
                      className={cn(
                        "w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold",
                        empreiteiro
                          ? "bg-teal-50 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300"
                          : "bg-produmar-50 dark:bg-produmar-900/40 text-produmar-600 dark:text-produmar-300"
                      )}
                    >
                      {getInitials(d.name)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {d.name}
                        {!d.active && (
                          <span className="ml-1.5 text-[10px] font-medium text-slate-400">
                            arquivado
                          </span>
                        )}
                      </span>
                      {/* Quem ele é: o tipo e a profissão, que é o que o chefe
                          procura quando precisa de "um pedreiro" */}
                      <span className="flex items-center gap-1 flex-wrap">
                        <span
                          className={cn(
                            "text-[10px] font-semibold px-1.5 py-px rounded-full",
                            empreiteiro
                              ? "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
                              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                          )}
                        >
                          {WORKER_TYPE_LABEL[tipo]}
                        </span>
                        {d.profession && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {d.profession}
                          </span>
                        )}
                      </span>
                      {/* o preço combinado, do jeito que foi combinado: dizer
                          só "R$ X/dia" escondia o valor do metro de quem é
                          pago no metro, que é o número que o chefe procura */}
                      <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate">
                        {precoCombinado(d)}
                        {d.pix_key ? ` · PIX ${d.pix_key}` : ""}
                      </span>
                    </span>
                    <span className="text-right flex-shrink-0">
                      <span className="block text-sm font-semibold text-produmar-700 dark:text-produmar-400 tabular-nums">
                        {formatBRL(r?.total ?? 0)}
                      </span>
                      <span className="block text-[11px] text-slate-400 tabular-nums">
                        {[
                          (r?.dias ?? 0) > 0
                            ? `${r?.dias} ${r?.dias === 1 ? "dia" : "dias"}`
                            : null,
                          (r?.servicos ?? 0) > 0
                            ? `${r?.servicos} ${r?.servicos === 1 ? "serviço" : "serviços"}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "0 dias"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "dias" && (
        <div className="space-y-3">
          {diasDoMes.length === 0 ? (
            <Vazio
              icon={CalendarDays}
              texto="Nenhuma diária lançada neste mês."
              dica="Quem marca os dias é o técnico, na tela dele — mas você também marca, abrindo o colaborador."
            />
          ) : (
            <ul className="rounded-xl border border-produmar-100/60 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              {diasDoMes.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => setDetalheDia(d)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-slate-800 transition-colors"
                  >
                    <span className="w-12 flex-shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums pt-0.5">
                      {formatDate(d.work_date).slice(0, 5)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {nomePorId.get(d.diarista_id) ?? "—"}
                      </span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {d.description || "—"}
                      </span>
                      {d.obra_id && (
                        <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">
                          <HardHat className="w-3 h-3 flex-shrink-0" />
                          {obraNome.get(d.obra_id) ?? "obra apagada"}
                        </span>
                      )}
                    </span>
                    <span className="text-right flex-shrink-0">
                      <span className="block text-sm font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                        {formatBRL(Number(d.daily_rate))}
                      </span>
                      {d.half_day && (
                        <span className="block text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          meia diária
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "servicos" && (
        <div className="space-y-3">
          {servicosDoMes.length === 0 ? (
            <Vazio
              icon={HardHat}
              texto="Nenhum serviço fechado neste mês."
              dica="O serviço por empreita ou por metro é combinado em Obras, dentro do setor. O valor cai aqui, na conta de quem fez."
            />
          ) : (
            /*
              Um bloco por pessoa, com a conta de cada serviço escrita por
              extenso e o total dela embaixo. É a resposta de "quanto eu devo
              pra cada um" — a lista corrida não somava nada por pessoa.
            */
            <div className="space-y-3">
              {servicosPorPessoa.map((g) => (
                <div
                  key={g.id}
                  className="rounded-xl border border-produmar-100/60 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
                >
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-teal-50/60 dark:bg-teal-950/20 border-b border-teal-100 dark:border-teal-900/40">
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {g.nome}
                      </span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {g.itens.length}{" "}
                        {g.itens.length === 1 ? "serviço" : "serviços"} no mês
                        {g.emAberto > 0 ? ` · ${formatBRL(g.emAberto)} em aberto` : ""}
                      </span>
                    </span>
                    <span className="text-right flex-shrink-0">
                      <span className="block text-base font-bold text-teal-700 dark:text-teal-300 tabular-nums">
                        {formatBRL(g.total)}
                      </span>
                      <span className="block text-[10px] text-slate-400 uppercase tracking-wide">
                        no mês
                      </span>
                    </span>
                  </div>

                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {g.itens.map((s) => {
                      const conta = servicoConta(s);
                      return (
                        <li key={s.id} className="flex items-start gap-3 px-4 py-2.5">
                          <span className="w-12 flex-shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums pt-0.5">
                            {formatDate(s.service_date).slice(0, 5)}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm text-slate-800 dark:text-slate-100 truncate">
                              {s.service_type}
                            </span>
                            {/* a conta por extenso: 10 M × R$ 2,00 = R$ 20,00 */}
                            <span className="block text-[11px] font-medium text-teal-700 dark:text-teal-400 tabular-nums truncate">
                              {conta.formula
                                ? `${conta.formula} = ${conta.total}`
                                : `empreita = ${conta.total}`}
                            </span>
                            <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 truncate">
                              <HardHat className="w-3 h-3 flex-shrink-0" />
                              {s.obra_name}
                              {s.sector_name ? ` · ${s.sector_name}` : ""}
                            </span>
                          </span>
                          <span className="text-right flex-shrink-0">
                            <span className="block text-sm font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                              {formatBRL(Number(s.total_value))}
                            </span>
                            <span
                              className={cn(
                                "block text-[10px] font-semibold",
                                s.acerto_id
                                  ? "text-slate-400"
                                  : "text-emerald-600 dark:text-emerald-400"
                              )}
                            >
                              {s.acerto_id ? "pago" : "em aberto"}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Para lançar ou corrigir um serviço, vá em Obras → Setores e serviços. O
            preço de cada um vem do cadastro dele, aqui em Colaboradores.
          </p>
        </div>
      )}

      <DiaristaDialog
        open={cadastroOpen}
        onClose={() => setCadastroOpen(false)}
        diarista={editando}
      />

      <DiaristaDetailDialog
        open={!!detalhe}
        onClose={() => setDetalheId(null)}
        diarista={detalhe}
        dias={dias}
        obras={obras}
        sectors={sectors}
        servicos={servicos}
        year={year}
        month={month}
        onEdit={(d) => {
          setDetalheId(null);
          setEditando(d);
          setCadastroOpen(true);
        }}
        onAcerto={(d) => abrirAcerto(d.id)}
      />
      <AcertoDialog
        open={!!acertoDiarista}
        onClose={fecharAcerto}
        diarista={acertoDiarista}
        adiantamentos={adiantamentos}
        acertos={acertos}
        dias={dias}
        servicos={servicos}
      />

      <DiaDetailDialog
        open={!!detalheDia}
        onClose={() => setDetalheDia(null)}
        dia={detalheDia}
        diaristaName={detalheDia ? nomePorId.get(detalheDia.diarista_id) ?? "" : ""}
        obras={obras}
        sectors={sectors}
        canEdit
        canDelete
      />

      <RelatorioDialog
        open={relatorioOpen}
        onClose={() => setRelatorioOpen(false)}
        diaristas={diaristas}
        obras={obras}
        defaultFrom={from}
        defaultTo={to}
      />
    </div>
  );
}

function Numero({
  label,
  value,
  destaque,
}: {
  label: string;
  value: string;
  destaque?: boolean;
}) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2 py-2">
      <p
        className={cn(
          "text-base font-semibold tabular-nums truncate",
          destaque
            ? "text-produmar-700 dark:text-produmar-400"
            : "text-slate-800 dark:text-slate-100"
        )}
      >
        {value}
      </p>
      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">{label}</p>
    </div>
  );
}

function Vazio({
  icon: Icon,
  texto,
  dica,
  acao,
}: {
  icon: typeof Users;
  texto: string;
  dica?: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 py-10 px-4 text-center space-y-2">
      <Icon className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
      <p className="text-sm text-slate-500 dark:text-slate-400">{texto}</p>
      {dica && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 max-w-sm mx-auto">{dica}</p>
      )}
      {acao}
    </div>
  );
}
