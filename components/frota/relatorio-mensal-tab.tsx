"use client";

import { useMemo, useState } from "react";
import {
  ChevronRight,
  ClipboardList,
  HandCoins,
  HardHat,
  Printer,
  Receipt,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonthNav } from "@/components/ui/month-nav";
import { SummaryStatCard } from "@/components/ui/summary-stat-card";
import { cn, formatBRL, formatDate, formatQty, machineCategoryLabel } from "@/lib/utils";
import { Chip, categoryChip, kindMeta } from "./frota-shared";
import type {
  MachineFichaLinha,
  MachineResumo,
  MachineServico,
  MachineServicoKind,
} from "@/lib/types";

/**
 * RELATÓRIO DO MÊS, MÁQUINA POR MÁQUINA.
 *
 * As perguntas do dono no fim do mês, para cada máquina:
 *   - o que ela FEZ (cada OS, com o dia, as horas/viagens/diárias);
 *   - PRA QUEM trabalhou (somado por contratante);
 *   - QUEM estava nela (somado por operador);
 *   - QUANTO ARRECADOU (o que entrou e o que ainda falta receber), e o que
 *     ela gastou no mesmo mês.
 *
 * A base é a ficha do mês (v_machine_ficha): a OS da própria ficha e a OS de
 * Operações que usou a máquina, mais as despesas. Dá para imprimir.
 */

interface Props {
  machines: MachineResumo[];
  /** A ficha de todos os veículos, no mês da tela. */
  ficha: MachineFichaLinha[];
  /** As OS cruas do mês — trazem o que o operador escreveu ao finalizar. */
  servicos: MachineServico[];
  mesLabel: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onAbrirFicha: (machineId: string) => void;
}

type Situacao = "recebido" | "a_receber" | "em_contas" | "da_firma" | "andamento";

const SITUACAO_LABEL: Record<Situacao, string> = {
  recebido: "recebido",
  a_receber: "a receber",
  em_contas: "recebe em Contas",
  da_firma: "da firma",
  andamento: "em andamento",
};

const SITUACAO_COR: Record<Situacao, string> = {
  recebido: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  a_receber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  em_contas: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400",
  da_firma: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  andamento: "bg-produmar-100 text-produmar-700 dark:bg-produmar-900/40 dark:text-produmar-400",
};

/** Um serviço que a máquina fez no mês — da ficha ou de Operações. */
interface Trabalho {
  id: string;
  data: string;
  contratante: string;
  oQue: string;
  kind: MachineServicoKind | null;
  quantidade: number;
  valor: number;
  operador: string | null;
  situacao: Situacao;
  nOs: number | null;
}

/** Horas, viagens, diárias e km somados — cada unidade no seu lugar. */
type Quantidades = Partial<Record<MachineServicoKind, number>>;

interface Grupo {
  nome: string;
  servicos: number;
  quantidades: Quantidades;
  valor: number;
  aReceber: number;
}

interface DoMes {
  id: string;
  name: string;
  plate: string | null;
  category: string | null;
  trabalhos: Trabalho[];
  quantidades: Quantidades;
  /** O que a máquina rendeu de serviço para fora (sem o da firma). */
  arrecadou: number;
  recebido: number;
  aReceber: number;
  /** OS de Operações: o recebimento mora em Contas. */
  emContas: number;
  daFirma: number;
  gastos: number;
  porContratante: Grupo[];
  porOperador: Grupo[];
}

function somar(q: Quantidades, kind: MachineServicoKind | null, n: number) {
  if (!kind || kind === "servico" || !(n > 0)) return;
  q[kind] = (q[kind] ?? 0) + n;
}

/** "38 horas · 12 viagens · 2 dias" */
function textoQuantidades(q: Quantidades): string {
  const ordem: MachineServicoKind[] = ["hora", "viagem", "diaria", "km"];
  return ordem
    .filter((k) => (q[k] ?? 0) > 0)
    .map((k) => {
      const meta = kindMeta(k);
      const n = Math.round((q[k] ?? 0) * 10) / 10;
      return `${formatQty(n)} ${n === 1 ? meta.unit : meta.unitPlural}`;
    })
    .join(" · ");
}

function agrupar(trabalhos: Trabalho[], chave: (t: Trabalho) => string): Grupo[] {
  const map = new Map<string, Grupo>();
  for (const t of trabalhos) {
    const nome = chave(t);
    const g = map.get(nome) ?? { nome, servicos: 0, quantidades: {}, valor: 0, aReceber: 0 };
    g.servicos += 1;
    somar(g.quantidades, t.kind, t.quantidade);
    if (t.situacao !== "da_firma") g.valor += t.valor;
    if (t.situacao === "a_receber") g.aReceber += t.valor;
    map.set(nome, g);
  }
  return [...map.values()].sort((a, b) => b.valor - a.valor || b.servicos - a.servicos);
}

export function RelatorioMensalTab({
  machines,
  ficha,
  servicos,
  mesLabel,
  onPrevMonth,
  onNextMonth,
  onAbrirFicha,
}: Props) {
  const [escolhida, setEscolhida] = useState<string>("todas");

  const doMes = useMemo<DoMes[]>(() => {
    const cadastro = new Map(machines.map((m) => [m.id, m]));
    const cru = new Map(servicos.map((s) => [s.id, s]));
    const porMaquina = new Map<string, DoMes>();

    const da = (id: string): DoMes => {
      let d = porMaquina.get(id);
      if (!d) {
        const m = cadastro.get(id);
        d = {
          id,
          name: m?.name ?? "Máquina",
          plate: m?.plate ?? null,
          category: m?.category ?? null,
          trabalhos: [],
          quantidades: {},
          arrecadou: 0,
          recebido: 0,
          aReceber: 0,
          emContas: 0,
          daFirma: 0,
          gastos: 0,
          porContratante: [],
          porOperador: [],
        };
        porMaquina.set(id, d);
      }
      return d;
    };

    for (const l of ficha) {
      const d = da(l.machine_id);
      const valor = Number(l.value) || 0;
      if (l.flow === "despesa") {
        d.gastos += valor;
        continue;
      }

      const s = l.kind === "servico" ? cru.get(l.id) : undefined;
      const situacao: Situacao = l.internal
        ? "da_firma"
        : l.kind === "os"
          ? "em_contas"
          : l.status === "aberta"
            ? "andamento"
            : l.paid
              ? "recebido"
              : "a_receber";

      // O que foi feito: o que o operador escreveu ao finalizar vale mais
      // que o pedido da abertura — é o que de fato aconteceu.
      const pedido = l.description && l.description !== "Serviço" ? l.description : "";
      const oQue =
        s?.completion_notes?.trim() ||
        [l.kind === "os" ? l.category : null, pedido].filter(Boolean).join(" — ") ||
        kindMeta(l.servico_kind).label;

      const t: Trabalho = {
        id: l.id,
        data: l.entry_date,
        contratante: l.person?.trim() || (l.internal ? "A PRÓPRIA FIRMA" : "SEM CONTRATANTE"),
        oQue,
        kind: l.kind === "servico" ? l.servico_kind : null,
        quantidade: Number(l.quantity) || 0,
        valor,
        operador: l.operator?.trim() || null,
        situacao,
        nOs: l.order_number,
      };
      d.trabalhos.push(t);
      somar(d.quantidades, t.kind, t.quantidade);

      if (situacao === "da_firma") d.daFirma += valor;
      else {
        d.arrecadou += valor;
        if (situacao === "recebido") d.recebido += valor;
        else if (situacao === "em_contas") d.emContas += valor;
        else d.aReceber += valor; // a receber, ou OS aberta que já tem valor
      }
    }

    for (const d of porMaquina.values()) {
      d.trabalhos.sort((a, b) => a.data.localeCompare(b.data));
      d.porContratante = agrupar(d.trabalhos, (t) => t.contratante);
      d.porOperador = agrupar(d.trabalhos, (t) => t.operador ?? "SEM OPERADOR ANOTADO");
    }

    // Só máquina que trabalhou ou gastou no mês; quem mais arrecadou primeiro
    return [...porMaquina.values()]
      .filter((d) => d.trabalhos.length > 0 || d.gastos > 0)
      .sort(
        (a, b) =>
          b.arrecadou - a.arrecadou ||
          b.trabalhos.length - a.trabalhos.length ||
          a.name.localeCompare(b.name)
      );
  }, [machines, ficha, servicos]);

  // A máquina escolhida sumiu do mês (trocou o mês): volta para todas
  const mostradas =
    escolhida === "todas"
      ? doMes
      : doMes.filter((d) => d.id === escolhida).length > 0
        ? doMes.filter((d) => d.id === escolhida)
        : doMes;

  const totais = useMemo(
    () => ({
      arrecadou: mostradas.reduce((s, d) => s + d.arrecadou, 0),
      aReceber: mostradas.reduce((s, d) => s + d.aReceber, 0),
      gastos: mostradas.reduce((s, d) => s + d.gastos, 0),
    }),
    [mostradas]
  );

  function imprimir() {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(htmlParaImprimir(mostradas, mesLabel));
    w.document.close();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <MonthNav label={mesLabel} onPrev={onPrevMonth} onNext={onNextMonth} />
        <Button
          variant="outline"
          className="h-11 sm:h-10"
          onClick={imprimir}
          disabled={mostradas.length === 0}
        >
          <Printer className="w-4 h-4" />
          Imprimir
        </Button>
      </div>

      {doMes.length > 1 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          <Chip
            label={`Todas (${doMes.length})`}
            ativo={escolhida === "todas"}
            onClick={() => setEscolhida("todas")}
          />
          {doMes.map((d) => (
            <Chip
              key={d.id}
              label={d.name}
              ativo={escolhida === d.id}
              onClick={() => setEscolhida(d.id)}
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <SummaryStatCard
          tone="emerald"
          icon={HandCoins}
          label="Arrecadou"
          amount={totais.arrecadou}
        />
        <SummaryStatCard
          tone="amber"
          icon={Receipt}
          label="Falta receber"
          amount={totais.aReceber}
        />
        <SummaryStatCard tone="red" icon={TrendingUp} label="Gastou" amount={totais.gastos} />
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        O que cada máquina fez em {mesLabel}, pra quem, quem estava nela e quanto arrecadou —
        das OS da ficha e das de Operações. Serviço da própria firma aparece, mas não entra
        no arrecadado.
      </p>

      {mostradas.length === 0 ? (
        <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
          Nenhuma máquina trabalhou em {mesLabel}.
        </div>
      ) : (
        <div className="space-y-4">
          {mostradas.map((d) => (
            <MaquinaDoMes key={d.id} d={d} onAbrirFicha={() => onAbrirFicha(d.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function MaquinaDoMes({ d, onAbrirFicha }: { d: DoMes; onAbrirFicha: () => void }) {
  const qtd = textoQuantidades(d.quantidades);
  const sobrou = d.arrecadou - d.gastos;

  return (
    <section className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{d.name}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {d.category && (
              <span
                className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded",
                  categoryChip(d.category)
                )}
              >
                {machineCategoryLabel(d.category)}
              </span>
            )}
            {d.plate && (
              <span className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                {d.plate}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onAbrirFicha}
          className="flex items-center gap-0.5 text-xs text-produmar-600 dark:text-produmar-400 flex-shrink-0 py-1"
        >
          Abrir ficha <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* O dinheiro do mês */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <Numero label="Arrecadou" valor={d.arrecadou} cor="text-emerald-700 dark:text-emerald-400" />
        <Numero label="Recebido" valor={d.recebido} />
        <Numero
          label="Falta receber"
          valor={d.aReceber}
          cor={d.aReceber > 0 ? "text-amber-700 dark:text-amber-400" : undefined}
        />
        <Numero
          label="Gastou"
          valor={d.gastos}
          cor={d.gastos > 0 ? "text-rose-700 dark:text-rose-400" : undefined}
        />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
        {d.trabalhos.length} {d.trabalhos.length === 1 ? "serviço" : "serviços"}
        {qtd ? ` · ${qtd}` : ""}
        {" · sobrou "}
        <span
          className={cn(
            "font-semibold tabular-nums",
            sobrou < 0 ? "text-rose-700 dark:text-rose-400" : "text-slate-700 dark:text-slate-200"
          )}
        >
          {formatBRL(sobrou)}
        </span>
        {d.emContas > 0 ? ` · ${formatBRL(d.emContas)} de Operações (recebe em Contas)` : ""}
        {d.daFirma > 0 ? ` · ${formatBRL(d.daFirma)} de serviço da firma` : ""}
      </p>

      {d.trabalhos.length > 0 && (
        <>
          <Bloco icone={Users} titulo="Pra quem trabalhou">
            {d.porContratante.map((g) => (
              <LinhaGrupo key={g.nome} g={g} />
            ))}
          </Bloco>

          <Bloco icone={HardHat} titulo="Quem trabalhou nela">
            {d.porOperador.map((g) => (
              <LinhaGrupo key={g.nome} g={g} />
            ))}
          </Bloco>

          <Bloco icone={ClipboardList} titulo="O que foi feito">
            {d.trabalhos.map((t) => (
              <div key={t.id} className="px-3 py-2.5 space-y-0.5">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums w-11 flex-shrink-0 pt-0.5">
                    {formatDate(t.data).slice(0, 5)}
                  </span>
                  <p className="flex-1 min-w-0 text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    {t.contratante}
                  </p>
                  <span className="text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200 flex-shrink-0">
                    {t.situacao === "andamento" && t.valor <= 0 ? "a contar" : formatBRL(t.valor)}
                  </span>
                </div>
                <div className="pl-[52px] space-y-1">
                  <p className="text-xs text-slate-600 dark:text-slate-300 break-words">
                    {t.oQue}
                    {t.nOs ? ` · OS nº ${t.nOs}` : ""}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400 dark:text-slate-500">
                    {t.kind && t.kind !== "servico" && t.quantidade > 0 && (
                      <span className="tabular-nums">
                        {formatQty(t.quantidade)}{" "}
                        {t.quantidade === 1 ? kindMeta(t.kind).unit : kindMeta(t.kind).unitPlural}
                      </span>
                    )}
                    {t.operador && <span>{t.operador}</span>}
                    <span
                      className={cn(
                        "font-medium px-1.5 py-0.5 rounded-full",
                        SITUACAO_COR[t.situacao]
                      )}
                    >
                      {SITUACAO_LABEL[t.situacao]}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </Bloco>
        </>
      )}
    </section>
  );
}

function Numero({ label, valor, cor }: { label: string; valor: number; cor?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
      <p className={cn("font-semibold tabular-nums", cor ?? "text-slate-700 dark:text-slate-200")}>
        {formatBRL(valor)}
      </p>
    </div>
  );
}

function Bloco({
  icone: Icone,
  titulo,
  children,
}: {
  icone: React.ComponentType<{ className?: string }>;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
        <Icone className="w-3.5 h-3.5" />
        {titulo}
      </p>
      <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function LinhaGrupo({ g }: { g: Grupo }) {
  const qtd = textoQuantidades(g.quantidades);
  return (
    <div className="flex items-center gap-2.5 px-3 py-2">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{g.nome}</p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums truncate">
          {g.servicos} {g.servicos === 1 ? "serviço" : "serviços"}
          {qtd ? ` · ${qtd}` : ""}
          {g.aReceber > 0 ? ` · ${formatBRL(g.aReceber)} a receber` : ""}
        </p>
      </div>
      <p className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 flex-shrink-0">
        {formatBRL(g.valor)}
      </p>
    </div>
  );
}

// ── IMPRESSÃO ────────────────────────────────────────────────────────────────
// Uma janela só com o relatório, sem o menu do sistema — do jeito que os
// outros relatórios imprimem.

function htmlParaImprimir(maquinas: DoMes[], mesLabel: string): string {
  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const brl = (n: number) => esc(formatBRL(n));

  const grupo = (titulo: string, gs: Grupo[]) =>
    `<h3>${esc(titulo)}</h3><table><thead><tr><th>Nome</th><th>Serviços</th><th>Quanto</th><th class="n">Valor</th><th class="n">A receber</th></tr></thead><tbody>${gs
      .map(
        (g) =>
          `<tr><td>${esc(g.nome)}</td><td>${g.servicos}</td><td>${esc(
            textoQuantidades(g.quantidades) || "—"
          )}</td><td class="n">${brl(g.valor)}</td><td class="n">${
            g.aReceber > 0 ? brl(g.aReceber) : "—"
          }</td></tr>`
      )
      .join("")}</tbody></table>`;

  const blocos = maquinas
    .map((d) => {
      const qtd = textoQuantidades(d.quantidades);
      const linhas = d.trabalhos
        .map((t) => {
          const quanto =
            t.kind && t.kind !== "servico" && t.quantidade > 0
              ? `${formatQty(t.quantidade)} ${
                  t.quantidade === 1 ? kindMeta(t.kind).unit : kindMeta(t.kind).unitPlural
                }`
              : "—";
          return `<tr><td>${esc(formatDate(t.data))}</td><td>${esc(t.contratante)}</td><td>${esc(
            t.oQue + (t.nOs ? ` · OS nº ${t.nOs}` : "")
          )}</td><td>${esc(quanto)}</td><td>${esc(t.operador ?? "—")}</td><td class="n">${
            t.situacao === "andamento" && t.valor <= 0 ? "a contar" : brl(t.valor)
          }</td><td>${esc(SITUACAO_LABEL[t.situacao])}</td></tr>`;
        })
        .join("");
      return `<section><h2>${esc(d.name)}${d.plate ? ` <small>${esc(d.plate)}</small>` : ""}</h2>
        <p class="resumo">Arrecadou <b>${brl(d.arrecadou)}</b> · recebido ${brl(
          d.recebido
        )} · falta receber <b>${brl(d.aReceber)}</b> · gastou ${brl(d.gastos)} · sobrou <b>${brl(
          d.arrecadou - d.gastos
        )}</b><br>${d.trabalhos.length} ${d.trabalhos.length === 1 ? "serviço" : "serviços"}${
          qtd ? ` · ${esc(qtd)}` : ""
        }${d.emContas > 0 ? ` · ${brl(d.emContas)} de Operações (recebe em Contas)` : ""}${
          d.daFirma > 0 ? ` · ${brl(d.daFirma)} de serviço da firma` : ""
        }</p>
        ${d.trabalhos.length > 0 ? grupo("Pra quem trabalhou", d.porContratante) : ""}
        ${d.trabalhos.length > 0 ? grupo("Quem trabalhou nela", d.porOperador) : ""}
        ${
          d.trabalhos.length > 0
            ? `<h3>O que foi feito</h3><table><thead><tr><th>Dia</th><th>Pra quem</th><th>O que</th><th>Quanto</th><th>Operador</th><th class="n">Valor</th><th>Situação</th></tr></thead><tbody>${linhas}</tbody></table>`
            : ""
        }</section>`;
    })
    .join("");

  const total = maquinas.reduce((s, d) => s + d.arrecadou, 0);
  const falta = maquinas.reduce((s, d) => s + d.aReceber, 0);
  const gastos = maquinas.reduce((s, d) => s + d.gastos, 0);

  return `<!doctype html><html><head><meta charset="utf-8"><title>Relatório das máquinas — ${esc(
    mesLabel
  )}</title><style>
    body{font-family:system-ui,sans-serif;margin:24px;color:#111}
    h1{font-size:18px;margin:0 0 4px} h1+p{margin:0 0 6px;color:#555;font-size:13px}
    section{margin-top:22px;page-break-inside:auto}
    section+section{page-break-before:always}
    h2{font-size:16px;margin:0 0 4px} h2 small{font-weight:normal;color:#666;font-size:12px}
    h3{font-size:13px;margin:14px 0 4px;page-break-after:avoid}
    .resumo{font-size:13px;color:#333;margin:0 0 6px}
    table{border-collapse:collapse;width:100%;font-size:12px}
    th,td{border:1px solid #bbb;padding:4px 6px;text-align:left;vertical-align:top}
    th{background:#f1f5f9} tr{page-break-inside:avoid} .n{text-align:right;white-space:nowrap}
  </style></head><body><h1>Relatório das máquinas — ${esc(mesLabel)}</h1><p>${
    maquinas.length
  } ${maquinas.length === 1 ? "máquina" : "máquinas"} · arrecadou ${brl(total)} · falta receber ${brl(
    falta
  )} · gastou ${brl(gastos)}</p>${
    blocos || "<p>Nenhuma máquina trabalhou no mês.</p>"
  }<script>window.onload=()=>window.print()</script></body></html>`;
}
