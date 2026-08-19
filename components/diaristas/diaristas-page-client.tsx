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
import { cn, formatBRL, formatDate, getInitials } from "@/lib/utils";
import { monthLabel, monthRange } from "./diarista-shared";
import { DiaristaDialog } from "./diarista-dialog";
import { DiaristaDetailDialog } from "./diarista-detail-dialog";
import { DiaDetailDialog } from "./dia-detail-dialog";
import { RelatorioDialog } from "./relatorio-dialog";
import type { DiaristaObra } from "./dias-dialog";
import type {
  Diarista,
  DiaristaDia,
  DiaristaResumo,
  SupplyObraSector,
} from "@/lib/types";

interface Props {
  diaristas: DiaristaResumo[];
  dias: DiaristaDia[];
  obras: DiaristaObra[];
  sectors: SupplyObraSector[];
}

type Tab = "pessoas" | "dias";

/**
 * A tela do chefe: quem são os diaristas, quanto cada um ganha por dia, para
 * onde vai o PIX — e o fechamento do mês, dia a dia, com o relatório para pagar.
 *
 * Quem marca o dia é o técnico, na tela dele. Aqui é onde isso vira conta.
 */
export function DiaristasPageClient({ diaristas, dias, obras, sectors }: Props) {
  const hoje = new Date();
  const [year, setYear] = useState(hoje.getFullYear());
  const [month, setMonth] = useState(hoje.getMonth());
  const [tab, setTab] = useState<Tab>("pessoas");
  const [search, setSearch] = useState("");
  const [mostrarArquivados, setMostrarArquivados] = useState(false);

  const [cadastroOpen, setCadastroOpen] = useState(false);
  const [editando, setEditando] = useState<Diarista | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [detalheDia, setDetalheDia] = useState<DiaristaDia | null>(null);
  const [relatorioOpen, setRelatorioOpen] = useState(false);

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

  /** Quantos dias e quanto cada um fez no mês. */
  const resumoDoMes = useMemo(() => {
    const map = new Map<string, { dias: number; total: number }>();
    for (const d of diasDoMes) {
      const cur = map.get(d.diarista_id) ?? { dias: 0, total: 0 };
      cur.dias += 1;
      cur.total += Number(d.daily_rate);
      map.set(d.diarista_id, cur);
    }
    return map;
  }, [diasDoMes]);

  const totalMes = diasDoMes.reduce((s, d) => s + Number(d.daily_rate), 0);
  const ativos = diaristas.filter((d) => d.active);

  const listados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return diaristas
      .filter((d) => (mostrarArquivados ? true : d.active))
      .filter((d) => (q ? d.name.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        // quem trabalhou no mês sobe: é neles que o chefe mexe
        const na = resumoDoMes.get(a.id)?.dias ?? 0;
        const nb = resumoDoMes.get(b.id)?.dias ?? 0;
        if (na !== nb) return nb - na;
        return a.name.localeCompare(b.name);
      });
  }, [diaristas, search, mostrarArquivados, resumoDoMes]);

  const detalhe = diaristas.find((d) => d.id === detalheId) ?? null;
  const arquivados = diaristas.length - ativos.length;

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
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">Diaristas</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
            Quem vem por dia — e quanto tem a receber
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

        <div className="grid grid-cols-3 gap-2 text-center">
          <Numero label="diaristas" value={String(ativos.length)} />
          <Numero label="diárias no mês" value={String(diasDoMes.length)} />
          <Numero label="a pagar no mês" value={formatBRL(totalMes)} destaque />
        </div>

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
            { value: "pessoas", label: "Diaristas", icon: Users, count: listados.length },
            { value: "dias", label: "Dias do mês", icon: CalendarDays, count: diasDoMes.length },
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
              placeholder="Buscar diarista..."
              className="pl-9"
              autoComplete="off"
            />
          </div>

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
                  ? "Nenhum diarista cadastrado."
                  : "Ninguém encontrado com essa busca."
              }
              dica={
                diaristas.length === 0
                  ? "Cadastre quem trabalha por dia, com a chave PIX e o valor da diária — o técnico só marca no calendário quem veio."
                  : undefined
              }
              acao={
                diaristas.length === 0 ? (
                  <Button size="sm" onClick={novoDiarista}>
                    <Plus className="w-4 h-4" /> Novo diarista
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {listados.map((d) => {
                const r = resumoDoMes.get(d.id);
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
                    <span className="w-11 h-11 rounded-xl bg-produmar-50 dark:bg-produmar-900/40 text-produmar-600 dark:text-produmar-300 flex items-center justify-center flex-shrink-0 text-xs font-bold">
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
                      <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate">
                        {Number(d.daily_rate) > 0
                          ? `${formatBRL(Number(d.daily_rate))}/dia`
                          : "diária não combinada"}
                        {d.pix_key ? ` · PIX ${d.pix_key}` : ""}
                      </span>
                    </span>
                    <span className="text-right flex-shrink-0">
                      <span className="block text-sm font-semibold text-produmar-700 dark:text-produmar-400 tabular-nums">
                        {formatBRL(r?.total ?? 0)}
                      </span>
                      <span className="block text-[11px] text-slate-400 tabular-nums">
                        {r?.dias ?? 0} {(r?.dias ?? 0) === 1 ? "dia" : "dias"}
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
              dica="Quem marca os dias é o técnico, na tela dele — mas você também marca, abrindo o diarista."
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
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300 tabular-nums flex-shrink-0">
                      {formatBRL(Number(d.daily_rate))}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
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
        year={year}
        month={month}
        onEdit={(d) => {
          setDetalheId(null);
          setEditando(d);
          setCadastroOpen(true);
        }}
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
