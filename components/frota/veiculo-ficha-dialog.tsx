"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Check,
  CheckCheck,
  Download,
  FileText,
  Fuel,
  History,
  Pencil,
  Plus,
  Receipt,
  Truck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { actionError } from "@/lib/action-result";
import {
  cn,
  formatBRL,
  formatDate,
  formatQty,
  machineCategoryLabel,
} from "@/lib/utils";
import {
  setMachineServicoPaid,
  setMachineServicoStatus,
} from "@/app/(app)/frota/actions";
import { FrotaCalendario, type DiaDaFrota } from "./frota-calendario";
import { HistoricoOsDialog } from "./historico-os-dialog";
import { ServicoDialog } from "./servico-dialog";
import { DespesaDialog } from "./despesa-dialog";
import { ValorDaHora } from "./valor-da-hora";
import { Chip, Numero, categoryChip, contaDoServico, kindMeta, toneResultado } from "./frota-shared";
import type {
  Machine,
  MachineDespesa,
  MachineFichaLinha,
  MachineResumo,
  MachineServico,
} from "@/lib/types";

/** Os recortes da ficha — é a pergunta que o dono faz olhando o veículo. */
type Filtro = "tudo" | "servico" | "frete" | "despesa" | "os";

const FILTROS: { value: Filtro; label: string }[] = [
  { value: "tudo", label: "Tudo" },
  { value: "servico", label: "Diárias e serviços" },
  { value: "frete", label: "Fretes e viagens" },
  { value: "despesa", label: "Despesas" },
  { value: "os", label: "Vindas de Operações" },
];

/** Frete é o que se conta por viagem ou por km — o resto é diária/hora/fechado. */
function ehFrete(l: MachineFichaLinha): boolean {
  return l.servico_kind === "viagem" || l.servico_kind === "km";
}

function combina(l: MachineFichaLinha, filtro: Filtro): boolean {
  switch (filtro) {
    case "tudo":
      return true;
    case "servico":
      return l.kind === "servico" && !ehFrete(l);
    case "frete":
      return l.kind === "servico" && ehFrete(l);
    case "despesa":
      return l.flow === "despesa";
    case "os":
      return l.kind === "os" || l.kind === "os_custo";
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  machine: MachineResumo;
  /** Todos os veículos — os diálogos de lançamento precisam da lista. */
  machines: Machine[];
  /** Migration 132 já rodou: dá para cadastrar o valor da hora. */
  valorHoraPronto?: boolean;
  /** As linhas da ficha DESTE veículo, no mês da tela. */
  linhas: MachineFichaLinha[];
  /** Os lançamentos crus do mês: é por eles que a linha abre para corrigir. */
  servicos: MachineServico[];
  despesas: MachineDespesa[];
  /** Contratantes já usados, para sugerir no lançamento. */
  contratantes: string[];
  /** Operadores com login — para enviar a OS ao celular deles. */
  operators: { id: string; name: string }[];
  /** "setembro de 2026" — o mês que a ficha está mostrando. */
  mesLabel: string;
  /** O mês da tela, para o calendário: ano e mês 0-11. */
  year: number;
  month: number;
  /** Virar o mês — mexe no mês da TELA, e a ficha vem junto. */
  onPrevMonth: () => void;
  onNextMonth: () => void;
}

/**
 * A FICHA DO VEÍCULO — os dois lados da conta de uma máquina, no mês.
 *
 * De um lado o que ela rendeu: a diária, a hora, a viagem, o km, o valor
 * fechado — cada um com o CONTRATANTE e o que ainda falta receber. Do outro o
 * que ela custou: diesel, mecânico, peça, motorista.
 *
 * As linhas de OS vêm do módulo Operações e são só leitura aqui: quem manda
 * nelas continua sendo aquela tela.
 */
export function VeiculoFichaDialog({
  open,
  onClose,
  machine,
  machines,
  valorHoraPronto = false,
  linhas,
  servicos,
  despesas,
  contratantes,
  operators,
  mesLabel,
  year,
  month,
  onPrevMonth,
  onNextMonth,
}: Props) {
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [servicoOpen, setServicoOpen] = useState(false);
  const [editServico, setEditServico] = useState<MachineServico | null>(null);
  /** O dia tocado no calendário — a OS nova nasce nele. */
  const [diaEscolhido, setDiaEscolhido] = useState<string | null>(null);
  const [despesaOpen, setDespesaOpen] = useState(false);
  const [editDespesa, setEditDespesa] = useState<MachineDespesa | null>(null);
  /** A OS cujo histórico está aberto — a da ficha ou a de Operações. */
  const [historico, setHistorico] = useState<
    | { tipo: "ficha"; servico: MachineServico }
    | { tipo: "operacoes"; id: string; titulo: string }
    | null
  >(null);

  const doFiltro = useMemo(
    () =>
      linhas
        .filter((l) => combina(l, filtro))
        .sort((a, b) => b.entry_date.localeCompare(a.entry_date)),
    [linhas, filtro]
  );

  /** O que entrou, o que saiu e o que sobrou no recorte escolhido. */
  const totais = useMemo(() => {
    let receitas = 0;
    let gastos = 0;
    let internos = 0;
    let aReceber = 0;
    let litros = 0;
    let combustivel = 0;
    for (const l of doFiltro) {
      const v = Number(l.value);
      if (l.internal) {
        internos += v;
        continue;
      }
      if (l.flow === "receita") {
        receitas += v;
        if (l.paid === false) aReceber += v;
      } else {
        gastos += v;
        if (l.liters) litros += Number(l.liters);
        if ((l.category ?? "").includes("COMBUST")) combustivel += v;
      }
    }
    return {
      receitas,
      gastos,
      internos,
      aReceber,
      litros,
      combustivel,
      resultado: receitas - gastos,
    };
  }, [doFiltro]);

  /**
   * As OS de cada dia do mês — é o que pinta o calendário. Só entra a OS da
   * ficha: a de Operações tem o status dela lá e a despesa não abre nem fecha.
   */
  const porDia = useMemo(() => {
    const map = new Map<string, DiaDaFrota>();
    for (const l of linhas) {
      if (l.kind !== "servico") continue;
      const cur = map.get(l.entry_date) ?? { abertas: 0, total: 0 };
      cur.total += 1;
      if (l.status === "aberta") cur.abertas += 1;
      map.set(l.entry_date, cur);
    }
    return map;
  }, [linhas]);

  /** Quantas OS deste mês ainda estão em aberto. */
  const abertasNoMes = useMemo(() => {
    let n = 0;
    for (const d of porDia.values()) n += d.abertas;
    return n;
  }, [porDia]);

  /** Nome do operador para quem a OS foi enviada. */
  const nomeDoOperador = useMemo(
    () => new Map(operators.map((o) => [o.id, o.name])),
    [operators]
  );

  const servicoPorId = useMemo(() => new Map(servicos.map((s) => [s.id, s])), [servicos]);
  const despesaPorId = useMemo(() => new Map(despesas.map((d) => [d.id, d])), [despesas]);

  function abrirServico(s: MachineServico | null, dia?: string | null) {
    setEditServico(s);
    setDiaEscolhido(dia ?? null);
    setServicoOpen(true);
  }

  function abrirDespesa(d: MachineDespesa | null) {
    setEditDespesa(d);
    setDespesaOpen(true);
  }

  function marcarRecebido(s: MachineServico) {
    setErro(null);
    startTransition(async () => {
      const falha = actionError(await setMachineServicoPaid(s.id, !s.paid));
      if (falha) setErro(falha);
    });
  }

  /** Fechar a OS com um toque: o dia deixa de ficar verde no calendário. */
  function concluir(s: MachineServico) {
    setErro(null);
    startTransition(async () => {
      const falha = actionError(await setMachineServicoStatus(s.id, "concluida"));
      if (falha) setErro(falha);
    });
  }

  function exportarCSV() {
    const headers = [
      "Data",
      "Origem",
      "Tipo",
      "Descrição",
      "Contratante/Fornecedor",
      "Quantidade",
      "Valor unitário",
      "Total (R$)",
      "De onde",
      "Para onde",
      "Operador",
      "Situação",
      "Recebido",
    ];
    const rows = doFiltro.map((l) => [
      l.entry_date,
      l.flow === "receita" ? "Receita" : "Despesa",
      l.kind === "servico"
        ? kindMeta(l.servico_kind).label
        : l.kind === "despesa"
          ? l.category ?? "Despesa"
          : `OS nº ${l.order_number ?? ""}`,
      l.description,
      l.person ?? "",
      formatQty(Number(l.quantity)),
      Number(l.unit_price).toFixed(2).replace(".", ","),
      Number(l.value).toFixed(2).replace(".", ","),
      l.origin ?? "",
      l.destination ?? "",
      l.operator ?? "",
      l.status === "aberta" ? "aberta" : l.status === "concluida" ? "concluída" : "",
      l.paid === null ? "" : l.paid ? "sim" : "não",
    ]);

    const csv =
      "﻿" +
      [headers, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
        .join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ficha-${machine.name.toLowerCase().replace(/\s+/g, "-")}-${mesLabel
      .toLowerCase()
      .replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400">
                <Truck className="w-4 h-4" />
              </span>
              <span className="truncate">{machine.name}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Quem é o veículo */}
            <div className="flex items-center gap-2 flex-wrap">
              {machine.category && (
                <span
                  className={cn(
                    "text-[11px] font-semibold px-2 py-0.5 rounded-full",
                    categoryChip(machine.category)
                  )}
                >
                  {machineCategoryLabel(machine.category)}
                </span>
              )}
              {machine.plate && (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  {machine.plate}
                </span>
              )}
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                {machine.tracking_type === "km" ? "Hodômetro (km)" : "Horímetro (horas)"}
              </span>
            </div>

            {/* O preço da hora para a obra: é o que a máquina lançada junto
                com a diária custa (132). Só nas máquinas de horímetro. */}
            {machine.tracking_type !== "km" && (
              <ValorDaHora key={machine.id} machine={machine} pronto={valorHoraPronto} />
            )}

            {/* A conta do mês, seguindo o recorte escolhido */}
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
              <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800">
                <Numero
                  label="RECEITAS"
                  valor={formatBRL(totais.receitas)}
                  tom="text-emerald-700 dark:text-emerald-400"
                />
                <Numero
                  label="DESPESAS"
                  valor={formatBRL(totais.gastos)}
                  tom="text-rose-700 dark:text-rose-400"
                />
                <Numero
                  label="RESULTADO"
                  valor={formatBRL(totais.resultado)}
                  tom={toneResultado(totais.resultado)}
                />
              </div>
              <p className="text-[11px] text-center text-slate-400 dark:text-slate-500 pb-2 capitalize">
                {mesLabel}
              </p>
            </div>

            {/* O que a conta do mês não mostra sozinha */}
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <Mini
                label="A receber"
                valor={formatBRL(totais.aReceber)}
                tom={totais.aReceber > 0 ? "text-amber-700 dark:text-amber-400" : ""}
              />
              <Mini
                label="Serviço interno"
                valor={formatBRL(totais.internos)}
                tom="text-slate-600 dark:text-slate-300"
              />
              <Mini
                label="Resultado de sempre"
                valor={formatBRL(Number(machine.resultado))}
                tom={toneResultado(Number(machine.resultado))}
              />
              <Mini
                label="A receber de sempre"
                valor={formatBRL(Number(machine.a_receber))}
                tom={Number(machine.a_receber) > 0 ? "text-amber-700 dark:text-amber-400" : ""}
              />
            </div>

            {/* Combustível do mês: o que o veículo bebeu e por quanto */}
            {(totais.litros > 0 || totais.combustivel > 0) && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 tabular-nums">
                <Fuel className="w-3.5 h-3.5 flex-shrink-0" />
                {totais.litros > 0 ? `${formatQty(totais.litros)} litros no mês` : "Combustível no mês"}
                {totais.combustivel > 0 ? ` · ${formatBRL(totais.combustivel)}` : ""}
                {totais.litros > 0 && totais.combustivel > 0
                  ? ` · ${formatBRL(totais.combustivel / totais.litros)} o litro`
                  : ""}
              </p>
            )}

            {/* O CALENDÁRIO DO VEÍCULO — toque no dia e lance a OS dele */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
              <FrotaCalendario
                year={year}
                month={month}
                onPrevMonth={onPrevMonth}
                onNextMonth={onNextMonth}
                porDia={porDia}
                onDayClick={(iso) => abrirServico(null, iso)}
              />
            </div>

            {abertasNoMes > 0 && (
              <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                {abertasNoMes === 1
                  ? "1 OS aberta neste mês"
                  : `${abertasNoMes} OS abertas neste mês`}
                {" — o dia verde é serviço que ainda não foi concluído."}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <Button className="h-11" onClick={() => abrirServico(null)}>
                <Plus className="w-4 h-4" />
                Nova OS
              </Button>
              <Button variant="outline" className="h-11" onClick={() => abrirDespesa(null)}>
                <Plus className="w-4 h-4" />
                Despesa
              </Button>
            </div>

            {/* Os recortes da ficha */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
              {FILTROS.map((f) => (
                <Chip
                  key={f.value}
                  label={f.label}
                  ativo={filtro === f.value}
                  onClick={() => setFiltro(f.value)}
                />
              ))}
            </div>

            {erro && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                {erro}
              </p>
            )}

            {/* O extrato: cada movimento, na ordem em que aconteceu */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {doFiltro.length === 0
                    ? "Nenhum lançamento"
                    : doFiltro.length === 1
                      ? "1 lançamento"
                      : `${doFiltro.length} lançamentos`}
                </p>
                {doFiltro.length > 0 && (
                  <button
                    type="button"
                    onClick={exportarCSV}
                    className="text-[11px] font-medium text-produmar-600 dark:text-produmar-400 flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar
                  </button>
                )}
              </div>

              {doFiltro.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500 py-6 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700">
                  Nada neste mês. Toque num dia do calendário para lançar a OS daquele
                  dia, ou use os botões acima.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                  {doFiltro.map((l) => {
                    const receita = l.flow === "receita";
                    const servico = l.kind === "servico" ? servicoPorId.get(l.id) ?? null : null;
                    const despesa = l.kind === "despesa" ? despesaPorId.get(l.id) ?? null : null;
                    const editavel = !!servico || !!despesa;
                    const Icone =
                      l.kind === "servico"
                        ? kindMeta(l.servico_kind).icon
                        : l.kind === "despesa"
                          ? Receipt
                          : FileText;
                    const conta =
                      l.kind === "servico"
                        ? contaDoServico(l.servico_kind, Number(l.quantity), Number(l.unit_price))
                        : "";
                    const trecho = [l.origin, l.destination].filter(Boolean).join(" → ");
                    const aReceber = receita && !l.internal && l.paid === false;
                    const aberta = l.kind === "servico" && l.status === "aberta";
                    // Toda OS tem histórico — a da ficha e a que veio de
                    // Operações. Só a despesa não tem o que contar.
                    const abrirHistorico = servico
                      ? () => setHistorico({ tipo: "ficha", servico })
                      : l.kind === "os"
                        ? () =>
                            setHistorico({
                              tipo: "operacoes",
                              id: l.id,
                              titulo: l.description,
                            })
                        : null;

                    return (
                      <div
                        key={`${l.kind}-${l.id}`}
                        onClick={
                          editavel
                            ? () => (servico ? abrirServico(servico) : abrirDespesa(despesa))
                            : undefined
                        }
                        role={editavel ? "button" : undefined}
                        tabIndex={editavel ? 0 : undefined}
                        onKeyDown={
                          editavel
                            ? (e) => {
                                if (e.key !== "Enter" && e.key !== " ") return;
                                e.preventDefault();
                                if (servico) abrirServico(servico);
                                else abrirDespesa(despesa);
                              }
                            : undefined
                        }
                        className={cn(
                          "flex items-start gap-2.5 px-3 py-2.5 bg-white dark:bg-slate-900",
                          editavel &&
                            "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                        )}
                      >
                        <span
                          className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                            l.internal
                              ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                              : receita
                                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : "bg-rose-50 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400"
                          )}
                        >
                          <Icone className="w-4 h-4" />
                        </span>

                        <div className="flex-1 min-w-0">
                          {/* Na OS, quem bate o olho quer saber PRA QUEM foi:
                              o contratante vem na frente, em destaque, e o
                              serviço logo abaixo. Na despesa, o que foi. */}
                          {receita && l.person ? (
                            <>
                              <p className="text-[15px] font-bold text-slate-900 dark:text-slate-50 truncate leading-snug">
                                {l.person}
                              </p>
                              <p className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
                                {l.description}
                              </p>
                            </>
                          ) : (
                            <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                              {l.description}
                            </p>
                          )}
                          {conta && (
                            <p className="text-[11px] font-medium text-produmar-700 dark:text-produmar-400 tabular-nums truncate">
                              {conta} = {formatBRL(Number(l.value))}
                            </p>
                          )}
                          <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                            {formatDate(l.entry_date)}
                            {/* o contratante já está no alto; o fornecedor da despesa fica aqui */}
                            {l.person && !receita ? ` · ${l.person}` : ""}
                            {trecho ? ` · ${trecho}` : ""}
                            {l.operator ? ` · ${l.operator}` : ""}
                            {l.category ? ` · ${l.category}` : ""}
                            {l.order_number ? ` · OS nº ${l.order_number} (Operações)` : ""}
                            {l.liters ? ` · ${formatQty(Number(l.liters))} L` : ""}
                          </p>
                          {(aberta || aReceber || l.internal) && (
                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                              {l.internal && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                  DA FIRMA
                                </span>
                              )}
                              {aberta && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                                  ABERTA
                                </span>
                              )}
                              {/* Enviada para o celular de alguém — e se já começou */}
                              {aberta && servico?.assigned_to && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-produmar-100 text-produmar-700 dark:bg-produmar-900/40 dark:text-produmar-400">
                                  {servico.started_at ? "EM ANDAMENTO COM " : "COM "}
                                  {nomeDoOperador.get(servico.assigned_to) ?? "OPERADOR"}
                                </span>
                              )}
                              {aberta && servico && (
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    concluir(servico);
                                  }}
                                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300 flex items-center gap-1 disabled:opacity-40"
                                >
                                  <CheckCheck className="w-3 h-3" />
                                  concluir
                                </button>
                              )}
                              {aReceber && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
                                  A RECEBER
                                </span>
                              )}
                              {aReceber && servico && (
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    marcarRecebido(servico);
                                  }}
                                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-700 dark:border-emerald-900/50 dark:text-emerald-400 flex items-center gap-1 disabled:opacity-40"
                                >
                                  <Check className="w-3 h-3" />
                                  recebi
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <p
                            className={cn(
                              "text-sm font-semibold tabular-nums",
                              l.internal
                                ? "text-slate-500 dark:text-slate-400"
                                : receita
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "text-rose-700 dark:text-rose-400"
                            )}
                          >
                            {receita ? "" : "− "}
                            {formatBRL(Number(l.value))}
                          </p>
                          <span className="flex items-center gap-1.5">
                            {/* O que a linha não mostra: horas, km, viagens e
                                o material carregado. */}
                            {abrirHistorico && (
                              <button
                                type="button"
                                title="Ver o histórico desta OS"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  abrirHistorico();
                                }}
                                className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300 flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800"
                              >
                                <History className="w-3 h-3" />
                                histórico
                              </button>
                            )}
                            {editavel && (
                              <Pencil className="w-3 h-3 text-slate-300 dark:text-slate-600" />
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Toque em <strong>histórico</strong> para ver o que tem dentro da OS:
                horas trabalhadas, km rodado, viagens e material carregado.{" "}
                A OS e a despesa lançadas na ficha se corrigem com um toque na linha. As
                linhas que vieram do módulo Operações são só leitura aqui — elas se
                corrigem lá.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <HistoricoOsDialog
        alvo={historico}
        onClose={() => setHistorico(null)}
        nomeDoOperador={nomeDoOperador}
      />

      <ServicoDialog
        open={servicoOpen}
        onClose={() => setServicoOpen(false)}
        servico={editServico}
        presetMachineId={machine.id}
        presetDate={diaEscolhido}
        machines={machines}
        contratantes={contratantes}
        operators={operators}
        servicosExistentes={servicos}
      />
      <DespesaDialog
        open={despesaOpen}
        onClose={() => setDespesaOpen(false)}
        despesa={editDespesa}
        presetMachineId={machine.id}
        machines={machines}
      />
    </>
  );
}

/** Número pequeno de apoio (a receber, interno, resultado de sempre). */
function Mini({ label, valor, tom }: { label: string; valor: string; tom: string }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-2 bg-white dark:bg-slate-900">
      <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{label}</p>
      <p className={cn("text-sm font-semibold tabular-nums truncate", tom)}>{valor}</p>
    </div>
  );
}
