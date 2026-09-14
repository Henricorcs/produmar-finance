"use client";

import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  FileText,
  Gauge,
  HandCoins,
  Pencil,
  Plus,
  Printer as PrinterIcon,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterTabs } from "@/components/ui/filter-tabs";
import { MonthNav } from "@/components/ui/month-nav";
import { Money } from "@/components/ui/money";
import { actionError } from "@/lib/action-result";
import { cn, formatBRL, formatDate, localDateISO } from "@/lib/utils";
import {
  SITUACAO_FATURA,
  competenciaDe,
  dataDaLeituraAnterior,
  formatPaginas,
  formatPreco,
  leiturasAnteriores,
  nomeDoMes,
  precoDaPagina,
  situacaoDaFatura,
} from "@/lib/impressoras";
import { excluirFaturaDoMes } from "@/app/(app)/impressoras/actions";
import { ContratoImpressoraDialog } from "./contrato-impressora-dialog";
import { ImpressoraDialog } from "./impressora-dialog";
import { LeiturasDialog } from "./leituras-dialog";
import { BaixaFaturaDialog } from "./baixa-fatura-dialog";
import type { Printer, PrinterBilling, PrinterContract, PrinterReading } from "@/lib/types";

interface Props {
  contracts: PrinterContract[];
  printers: Printer[];
  /** As faturas da janela de histórico, da mais nova para a mais velha. */
  billings: PrinterBilling[];
  readings: PrinterReading[];
  month: string;
  contractId: string | null;
  migrationPendente?: boolean;
}

type Aba = "mes" | "impressoras" | "evolucao";

/**
 * IMPRESSORAS — o aluguel de impressoras, dentro do módulo Aluguéis.
 *
 * É o "Relatório mensal de impressões" que era feito na planilha, só que o
 * sistema guarda o contador de cada mês: a leitura anterior sai sozinha, a
 * fatura é feita com a mesma conta, e dá para ver como cada impressora vem
 * imprimindo mês a mês.
 */
export function ImpressorasPageClient({
  contracts,
  printers,
  billings,
  readings,
  month,
  contractId,
  migrationPendente = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();

  const [aba, setAba] = useState<Aba>("mes");
  const [contratoOpen, setContratoOpen] = useState(false);
  const [editContrato, setEditContrato] = useState<PrinterContract | null>(null);
  const [impressoraOpen, setImpressoraOpen] = useState(false);
  const [editImpressora, setEditImpressora] = useState<Printer | null>(null);
  const [leiturasOpen, setLeiturasOpen] = useState(false);
  const [baixa, setBaixa] = useState<PrinterBilling | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // O contrato da tela: o da URL, senão o primeiro ativo, senão o primeiro.
  const contrato =
    contracts.find((c) => c.id === contractId) ??
    contracts.find((c) => c.status === "ativo") ??
    contracts[0] ??
    null;

  function irPara(params: { m?: string; c?: string }) {
    const q = new URLSearchParams();
    q.set("m", params.m ?? month);
    const c = params.c ?? contrato?.id;
    if (c) q.set("c", c);
    startTransition(() => router.push(`${pathname}?${q.toString()}`));
  }

  function navegarMes(dir: -1 | 1) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    irPara({ m: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` });
  }

  const competencia = competenciaDe(month);
  const hoje = localDateISO();

  const doContrato = useMemo(
    () => (contrato ? printers.filter((p) => p.contract_id === contrato.id) : []),
    [printers, contrato]
  );
  const faturasDoContrato = useMemo(
    () => (contrato ? billings.filter((b) => b.contract_id === contrato.id) : []),
    [billings, contrato]
  );
  const fatura = faturasDoContrato.find((b) => b.competencia === competencia) ?? null;
  const leiturasDaFatura = useMemo(
    () => (fatura ? readings.filter((r) => r.billing_id === fatura.id) : []),
    [readings, fatura]
  );

  /** A fatura do mês anterior — para mostrar se cada impressora subiu ou desceu. */
  const faturaAnterior = faturasDoContrato.find((b) => b.competencia < competencia) ?? null;
  const paginasAnteriores = useMemo(() => {
    const map = new Map<string, number>();
    if (!faturaAnterior) return map;
    for (const r of readings) {
      if (r.billing_id === faturaAnterior.id)
        map.set(r.printer_id, Number(r.current_reading) - Number(r.previous_reading));
    }
    return map;
  }, [readings, faturaAnterior]);

  const anteriores = useMemo(
    () => leiturasAnteriores(doContrato, faturasDoContrato, readings, competencia),
    [doContrato, faturasDoContrato, readings, competencia]
  );

  /** Quem entra na leitura: as ativas, e as que já estão nesta fatura. */
  const paraLeitura = useMemo(() => {
    const naFatura = new Set(leiturasDaFatura.map((r) => r.printer_id));
    return doContrato
      .filter((p) => p.active || naFatura.has(p.id))
      .sort((a, b) => a.unit - b.unit);
  }, [doContrato, leiturasDaFatura]);

  const porId = useMemo(() => new Map(printers.map((p) => [p.id, p])), [printers]);

  /** As linhas do relatório do mês, na ordem da unidade. */
  const linhasDoRelatorio = useMemo(
    () =>
      leiturasDaFatura
        .map((r) => {
          const p = porId.get(r.printer_id);
          const pages = Number(r.current_reading) - Number(r.previous_reading);
          return {
            r,
            p,
            pages,
            valor: Math.round(pages * Number(r.page_price) * 100) / 100,
            antes: paginasAnteriores.get(r.printer_id),
          };
        })
        .sort((a, b) => (a.p?.unit ?? 0) - (b.p?.unit ?? 0)),
    [leiturasDaFatura, porId, paginasAnteriores]
  );

  const modelos = useMemo(
    () => Array.from(new Set(printers.map((p) => p.model).filter((m): m is string => !!m))),
    [printers]
  );

  const proximaUnidade = doContrato.reduce((max, p) => Math.max(max, p.unit), 0) + 1;

  function abrirContrato(c: PrinterContract | null) {
    setEditContrato(c);
    setContratoOpen(true);
  }

  function abrirImpressora(p: Printer | null) {
    setEditImpressora(p);
    setImpressoraOpen(true);
  }

  function apagarFatura() {
    if (!fatura) return;
    if (!confirm(`Apagar a fatura de ${nomeDoMes(fatura.competencia)} e as leituras dela?`)) return;
    setErro(null);
    startTransition(async () => {
      const falha = actionError(await excluirFaturaDoMes(fatura.id));
      if (falha) setErro(falha);
    });
  }

  const abas = [
    { value: "mes" as const, label: "Fatura do mês" },
    { value: "impressoras" as const, label: `Impressoras (${doContrato.filter((p) => p.active).length})` },
    { value: "evolucao" as const, label: "Evolução" },
  ];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">Impressoras</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            O contador de cada impressora e a fatura do aluguel, mês a mês
          </p>
        </div>
        <Button variant="outline" className="flex-shrink-0" onClick={() => abrirContrato(null)}>
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Contrato</span>
        </Button>
      </div>

      {migrationPendente && (
        <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Rode a migration 096 no Supabase para começar a usar o aluguel de impressoras.</span>
        </p>
      )}

      {!contrato ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 px-5 py-10 text-center space-y-3">
          <PrinterIcon className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Comece pelo contrato: o cliente, a franquia de páginas e o preço da página.
            Depois cadastre as impressoras e lance a leitura do mês.
          </p>
          <Button onClick={() => abrirContrato(null)}>
            <Plus className="w-4 h-4" />
            Cadastrar contrato
          </Button>
        </div>
      ) : (
        <>
          {/* Qual contrato — só aparece quando há mais de um */}
          {contracts.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {contracts.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => irPara({ c: c.id })}
                  className={cn(
                    "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                    c.id === contrato.id
                      ? "bg-produmar-600 border-produmar-600 text-white"
                      : "bg-white border-slate-200 text-slate-500 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400",
                    c.status === "encerrado" && "opacity-60"
                  )}
                >
                  {c.client_name}
                </button>
              ))}
            </div>
          )}

          {/* O contrato */}
          <button
            type="button"
            onClick={() => abrirContrato(contrato)}
            className="w-full text-left rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 hover:bg-produmar-50/40 dark:hover:bg-slate-800/40 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                  {contrato.client_name}
                  {contrato.status === "encerrado" && (
                    <span className="ml-2 text-[10px] font-bold text-slate-400">ENCERRADO</span>
                  )}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {contrato.contract_number ? `Contrato nº ${contrato.contract_number} · ` : ""}
                  franquia {formatPaginas(contrato.franchise_pages)} pág · R${" "}
                  {formatPreco(Number(contrato.page_price))}/pág · vence dia {contrato.due_day}
                </p>
              </div>
              <Pencil className="w-4 h-4 text-slate-400 flex-shrink-0 mt-1" />
            </div>
          </button>

          <FilterTabs tabs={abas} active={aba} onChange={setAba} />

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {erro}
            </p>
          )}

          {/* ══ FATURA DO MÊS ═══════════════════════════════════════════════ */}
          {aba === "mes" && (
            <div className="space-y-4">
              <MonthNav label={nomeDoMes(competencia)} onPrev={() => navegarMes(-1)} onNext={() => navegarMes(1)} />

              {!fatura ? (
                <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 px-5 py-8 text-center space-y-3">
                  <Gauge className="w-9 h-9 mx-auto text-slate-300 dark:text-slate-600" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Nenhuma leitura em <span className="capitalize">{nomeDoMes(competencia)}</span>.
                    {paraLeitura.length > 0
                      ? " A leitura anterior de cada impressora já vem preenchida."
                      : " Cadastre as impressoras deste contrato antes."}
                  </p>
                  {paraLeitura.length > 0 ? (
                    <Button onClick={() => setLeiturasOpen(true)}>
                      <Gauge className="w-4 h-4" />
                      Lançar as leituras
                    </Button>
                  ) : (
                    <Button variant="outline" onClick={() => setAba("impressoras")}>
                      <Plus className="w-4 h-4" />
                      Cadastrar impressoras
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <FaturaResumo fatura={fatura} hoje={hoje} />

                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setLeiturasOpen(true)}>
                      <Pencil className="w-4 h-4" />
                      Corrigir leituras
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => window.open(`/imprimir/impressoras/${fatura.id}`, "_blank")}
                    >
                      <FileText className="w-4 h-4" />
                      Relatório
                    </Button>
                    <Button onClick={() => setBaixa(fatura)} className="col-span-2 sm:col-span-1">
                      <HandCoins className="w-4 h-4" />
                      {fatura.paid_at ? "Ver a baixa" : "Dar baixa"}
                    </Button>
                  </div>

                  {/* Celular: um cartão por impressora */}
                  <ul className="sm:hidden space-y-2">
                    {linhasDoRelatorio.map(({ r, p, pages, valor, antes }) => (
                      <li
                        key={r.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5"
                      >
                        <div className="flex items-start gap-2">
                          <span className="w-7 h-7 rounded-lg bg-produmar-50 dark:bg-produmar-900/40 text-produmar-700 dark:text-produmar-300 text-xs font-bold flex items-center justify-center tabular-nums flex-shrink-0">
                            {p?.unit ?? "?"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                              {p?.model ?? "Impressora"}
                            </p>
                            <p className="text-[10px] text-slate-400 tabular-nums truncate">
                              {p?.serial_number}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                              {formatPaginas(pages)} pág
                            </p>
                            <Variacao agora={pages} antes={antes} />
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                          <span>
                            {formatPaginas(r.previous_reading)} → {formatPaginas(r.current_reading)}
                          </span>
                          <span>
                            {formatBRL(Number(r.monthly_fee))} + {formatBRL(valor)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {/* Computador: a planilha de sempre */}
                  <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-sm tabular-nums">
                      <thead className="bg-slate-50 dark:bg-slate-800/60 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        <tr>
                          <th className="px-3 py-2 text-center">Unid</th>
                          <th className="px-3 py-2 text-left">Nº de série</th>
                          <th className="px-3 py-2 text-left">Modelo</th>
                          <th className="px-3 py-2 text-right">Anterior</th>
                          <th className="px-3 py-2 text-right">Atual</th>
                          <th className="px-3 py-2 text-right">Páginas</th>
                          <th className="px-3 py-2 text-right">Mensalidade</th>
                          <th className="px-3 py-2 text-right">Impressão</th>
                          <th className="px-3 py-2 text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {linhasDoRelatorio.map(({ r, p, pages, valor, antes }) => (
                          <tr key={r.id} className="text-slate-700 dark:text-slate-200">
                            <td className="px-3 py-2 text-center font-semibold">{p?.unit}</td>
                            <td className="px-3 py-2">{p?.serial_number}</td>
                            <td className="px-3 py-2">{p?.model}</td>
                            <td className="px-3 py-2 text-right">{r.previous_reading}</td>
                            <td className="px-3 py-2 text-right">{r.current_reading}</td>
                            <td className="px-3 py-2 text-right">
                              <span className="font-semibold">{pages}</span>
                              <Variacao agora={pages} antes={antes} inline />
                            </td>
                            <td className="px-3 py-2 text-right">{formatBRL(Number(r.monthly_fee))}</td>
                            <td className="px-3 py-2 text-right">{formatPreco(Number(r.page_price))}</td>
                            <td className="px-3 py-2 text-right font-medium">{formatBRL(valor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    type="button"
                    onClick={apagarFatura}
                    className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Apagar esta fatura
                  </button>
                </>
              )}
            </div>
          )}

          {/* ══ IMPRESSORAS ═════════════════════════════════════════════════ */}
          {aba === "impressoras" && (
            <div className="space-y-3">
              <Button onClick={() => abrirImpressora(null)} className="w-full sm:w-auto">
                <Plus className="w-4 h-4" />
                Impressora
              </Button>

              {doContrato.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">
                  Nenhuma impressora neste contrato ainda.
                </p>
              ) : (
                <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                  {[...doContrato]
                    .sort((a, b) => Number(b.active) - Number(a.active) || a.unit - b.unit)
                    .map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => abrirImpressora(p)}
                          className={cn(
                            "w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40",
                            !p.active && "opacity-50"
                          )}
                        >
                          <span className="w-8 h-8 rounded-lg bg-produmar-50 dark:bg-produmar-900/40 text-produmar-700 dark:text-produmar-300 text-sm font-bold flex items-center justify-center tabular-nums flex-shrink-0">
                            {p.unit}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                              {p.model || "Impressora"}
                              {!p.active && " · DESATIVADA"}
                            </span>
                            <span className="block text-[11px] text-slate-400 tabular-nums truncate">
                              {p.serial_number}
                              {p.location ? ` · ${p.location}` : ""}
                            </span>
                          </span>
                          <span className="text-right flex-shrink-0">
                            <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                              {formatBRL(Number(p.monthly_fee))}
                            </span>
                            <span className="block text-[10px] text-slate-400 tabular-nums">
                              R$ {formatPreco(precoDaPagina(p, contrato))}/pág
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}

          {/* ══ EVOLUÇÃO ════════════════════════════════════════════════════ */}
          {aba === "evolucao" && (
            <Evolucao
              faturas={faturasDoContrato}
              readings={readings}
              printers={doContrato}
              hoje={hoje}
              onAbrirMes={(c) => {
                setAba("mes");
                irPara({ m: c.slice(0, 7) });
              }}
            />
          )}

          <ImpressoraDialog
            open={impressoraOpen}
            onClose={() => setImpressoraOpen(false)}
            contract={contrato}
            printer={editImpressora}
            proximaUnidade={proximaUnidade}
            modelos={modelos}
          />
          <LeiturasDialog
            open={leiturasOpen}
            onClose={() => setLeiturasOpen(false)}
            contract={contrato}
            printers={paraLeitura}
            billing={fatura}
            readings={leiturasDaFatura}
            anteriores={anteriores}
            competencia={competencia}
            dataAnterior={dataDaLeituraAnterior(faturasDoContrato, competencia)}
          />
          <BaixaFaturaDialog
            billing={baixa}
            onClose={() => setBaixa(null)}
            clientName={contrato.client_name}
          />
        </>
      )}

      <ContratoImpressoraDialog
        open={contratoOpen}
        onClose={() => setContratoOpen(false)}
        contract={editContrato}
        onCreated={(id) => irPara({ c: id })}
      />
    </div>
  );
}

// ── Pedaços da tela ─────────────────────────────────────────────────────────

function FaturaResumo({ fatura, hoje }: { fatura: PrinterBilling; hoje: string }) {
  const situacao = SITUACAO_FATURA[situacaoDaFatura(fatura, hoje)];
  return (
    <div className="rounded-2xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Total da fatura</p>
          <p className="text-2xl font-bold text-produmar-700 dark:text-produmar-400">
            <Money value={Number(fatura.total_amount)} />
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
            Leitura {fatura.previous_date ? `${formatDate(fatura.previous_date)} → ` : ""}
            {formatDate(fatura.reading_date)}
            {fatura.due_date ? ` · vence ${formatDate(fatura.due_date)}` : ""}
          </p>
        </div>
        <span className={cn("text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0", situacao.cls)}>
          {situacao.label.toUpperCase()}
        </span>
      </div>
      {/* gap-px sobre fundo cinza: a linha entre os quadros sai certa em 2 e em 4 colunas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-100 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-800 text-center">
        <Numero label="Páginas" valor={formatPaginas(fatura.total_pages)} />
        <Numero label="Mensalidades" valor={formatBRL(Number(fatura.total_fees))} />
        <Numero label="Impressões" valor={formatBRL(Number(fatura.total_prints))} />
        <Numero
          label={`Franquia ${formatPaginas(Math.min(fatura.franchise_pages, fatura.total_pages))} pág`}
          valor={`− ${formatBRL(Number(fatura.franchise_amount))}`}
        />
      </div>
      {fatura.paid_at && (
        <p className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-emerald-700 dark:text-emerald-400 tabular-nums">
          Recebido {formatBRL(Number(fatura.paid_amount))} em {formatDate(fatura.paid_at)}
          {fatura.method ? ` · ${fatura.method}` : ""}
        </p>
      )}
    </div>
  );
}

function Numero({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="px-2 py-2.5 min-w-0 bg-white dark:bg-slate-900">
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums truncate">{valor}</p>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{label}</p>
    </div>
  );
}

/** Subiu ou desceu em relação ao mês anterior — só aparece com mudança de 10%. */
function Variacao({ agora, antes, inline = false }: { agora: number; antes?: number; inline?: boolean }) {
  if (antes === undefined || antes <= 0) return null;
  const pct = Math.round(((agora - antes) / antes) * 100);
  if (Math.abs(pct) < 10) return null;
  const subiu = pct > 0;
  const Icone = subiu ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-semibold",
        inline ? "ml-1" : "",
        subiu ? "text-amber-600 dark:text-amber-400" : "text-sky-600 dark:text-sky-400"
      )}
      title={`${formatPaginas(antes)} páginas no mês anterior`}
    >
      <Icone className="w-3 h-3" />
      {subiu ? "+" : ""}
      {pct}%
    </span>
  );
}

/**
 * A EVOLUÇÃO — como o contrato e cada impressora vêm imprimindo.
 *
 * Em cima, a fatura de cada mês com a barra das páginas: dá para ver de relance
 * o mês que fugiu do normal. Embaixo, cada impressora com as páginas dos
 * últimos meses, para achar a que disparou (ou a que parou).
 */
function Evolucao({
  faturas,
  readings,
  printers,
  hoje,
  onAbrirMes,
}: {
  faturas: PrinterBilling[];
  readings: PrinterReading[];
  printers: Printer[];
  hoje: string;
  onAbrirMes: (competencia: string) => void;
}) {
  const meses = faturas.slice(0, 12);
  const maxPaginas = Math.max(1, ...meses.map((f) => f.total_pages));

  // As páginas de cada impressora nos últimos 6 meses com fatura (antigo → novo).
  const seis = [...faturas.slice(0, 6)].reverse();
  const porImpressora = useMemo(() => {
    const idx = new Map(seis.map((f, i) => [f.id, i]));
    const map = new Map<string, (number | null)[]>();
    for (const p of printers) map.set(p.id, seis.map(() => null));
    for (const r of readings) {
      const i = idx.get(r.billing_id);
      const serie = map.get(r.printer_id);
      if (i === undefined || !serie) continue;
      serie[i] = Number(r.current_reading) - Number(r.previous_reading);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readings, printers, faturas]);

  if (faturas.length === 0) {
    return (
      <p className="text-sm text-slate-400 text-center py-10">
        A evolução aparece depois da primeira fatura fechada.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" />
          Fatura de cada mês
        </p>
        <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
          {meses.map((f, i) => {
            const anterior = meses[i + 1];
            const situacao = SITUACAO_FATURA[situacaoDaFatura(f, hoje)];
            const pct =
              anterior && anterior.total_pages > 0
                ? Math.round(((f.total_pages - anterior.total_pages) / anterior.total_pages) * 100)
                : null;
            return (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onAbrirMes(f.competencia)}
                  className="w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 capitalize">
                      {nomeDoMes(f.competencia)}
                    </span>
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
                      {formatBRL(Number(f.total_amount))}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-produmar-500"
                        style={{ width: `${Math.max(2, (f.total_pages / maxPaginas) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums w-24 text-right">
                      {formatPaginas(f.total_pages)} pág
                      {pct !== null && pct !== 0 && (
                        <span className={pct > 0 ? " text-amber-600" : " text-sky-600"}>
                          {" "}
                          {pct > 0 ? "+" : ""}
                          {pct}%
                        </span>
                      )}
                    </span>
                    <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded", situacao.cls)}>
                      {situacao.label.toUpperCase()}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
          <PrinterIcon className="w-3.5 h-3.5" />
          Páginas por impressora · últimos {seis.length} meses
        </p>
        <ul className="rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
          {[...printers]
            .sort((a, b) => a.unit - b.unit)
            .map((p) => {
              const serie = porImpressora.get(p.id) ?? [];
              const valores = serie.filter((v): v is number => v !== null);
              if (valores.length === 0) return null;
              const max = Math.max(1, ...valores);
              const media = Math.round(valores.reduce((s, v) => s + v, 0) / valores.length);
              const ultimo = serie[serie.length - 1];
              return (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-7 h-7 rounded-lg bg-produmar-50 dark:bg-produmar-900/40 text-produmar-700 dark:text-produmar-300 text-xs font-bold flex items-center justify-center tabular-nums flex-shrink-0">
                    {p.unit}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-slate-700 dark:text-slate-200 truncate">
                      {p.model || p.serial_number}
                    </span>
                    <span className="block text-[10px] text-slate-400 tabular-nums">
                      média {formatPaginas(media)} pág
                    </span>
                  </span>
                  {/* as barrinhas dos meses, do mais antigo ao mais novo */}
                  <span className="flex items-end gap-0.5 h-7 flex-shrink-0" aria-hidden>
                    {serie.map((v, i) => (
                      <span
                        key={i}
                        className={cn(
                          "w-2 rounded-sm",
                          v === null
                            ? "bg-slate-100 dark:bg-slate-800 h-1"
                            : i === serie.length - 1
                              ? "bg-produmar-500"
                              : "bg-produmar-200 dark:bg-produmar-800"
                        )}
                        style={v === null ? undefined : { height: `${Math.max(8, (v / max) * 100)}%` }}
                      />
                    ))}
                  </span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums w-14 text-right flex-shrink-0">
                    {ultimo !== null && ultimo !== undefined ? formatPaginas(ultimo) : "—"}
                  </span>
                </li>
              );
            })}
        </ul>
      </div>
    </div>
  );
}
