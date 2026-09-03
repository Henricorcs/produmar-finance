"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Handshake,
  Pencil,
  Plus,
  Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatDate, formatQty, localDateISO, machineCategoryLabel } from "@/lib/utils";
import { WEEKDAY_INITIALS, monthCells, monthLabel } from "./frota-calendario";
import { Chip, categoryChip } from "./frota-shared";
import { ParceiroDialog } from "./parceiro-dialog";
import { ParceiroVeiculoDialog } from "./parceiro-veiculo-dialog";
import { TrocaDiaDialog } from "./troca-dia-dialog";
import {
  MACHINE_CATEGORIES,
  parceiroVeiculoLabel,
  type Machine,
  type MachineParceiro,
  type MachineParceiroSaldo,
  type MachineParceiroVeiculo,
  type MachineTroca,
} from "@/lib/types";

/** Os dois números de um dia do calendário. */
interface DiaDaTroca {
  recebidas: number;
  cedidas: number;
}

interface Props {
  parceiros: MachineParceiro[];
  /** As trocas do MÊS da tela (todos os parceiros). */
  trocas: MachineTroca[];
  /** O confronto de SEMPRE, por parceiro e tipo de máquina. */
  saldos: MachineParceiroSaldo[];
  /** Os veículos cadastrados dos parceiros — as placas que se marca no dia. */
  veiculos: MachineParceiroVeiculo[];
  /** As nossas máquinas, para marcar qual foi trabalhar para ele. */
  minhasMaquinas: Machine[];
  year: number;
  /** Mês 0-11, como no Date do JavaScript. */
  month: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  /** Migration 076 ainda não rodou. */
  migrationPendente?: boolean;
}

/**
 * TROCA COM O PARCEIRO — o escambo de diárias de máquina.
 *
 * Quando tem serviço aqui, a máquina dele vem trabalhar para nós; quando não
 * tem, a nossa vai para ele. Não corre dinheiro: um dia de máquina se paga com
 * um dia de máquina. O que esta tela responde é uma pergunta só — QUEM ESTÁ
 * DEVENDO DIÁRIA A QUEM.
 *
 * No calendário, cada dia mostra os dois números: em âmbar as máquinas dele que
 * vieram (o que a gente passa a dever) e em verde as nossas que foram (o que a
 * gente pagou). Toque no dia para lançar ou corrigir.
 */
export function ParceriasTab({
  parceiros,
  trocas,
  saldos,
  veiculos,
  minhasMaquinas,
  year,
  month,
  onPrevMonth,
  onNextMonth,
  migrationPendente = false,
}: Props) {
  const [parceiroId, setParceiroId] = useState<string>("");
  /**
   * O TIPO DE MÁQUINA escolhido. "todos" mostra cada tipo com a sua conta,
   * separada — diária de caçamba não se soma com diária de carregadeira, que
   * valem coisas diferentes. Escolhendo um tipo, a tela inteira (calendário,
   * mês e confronto) passa a falar só dele.
   */
  const [tipo, setTipo] = useState<string>("todos");
  const [diaAberto, setDiaAberto] = useState<string | null>(null);
  const [parceiroDialogOpen, setParceiroDialogOpen] = useState(false);
  const [editParceiro, setEditParceiro] = useState<MachineParceiro | null>(null);
  const [veiculoDialogOpen, setVeiculoDialogOpen] = useState(false);
  const [editVeiculo, setEditVeiculo] = useState<MachineParceiroVeiculo | null>(null);
  /** Tipo que estava escolhido na caixa do dia quando pediu "+ placa". */
  const [veiculoCategory, setVeiculoCategory] = useState("cacamba");

  // O primeiro parceiro já vem escolhido: quase sempre é só um.
  useEffect(() => {
    if (parceiros.length === 0) {
      setParceiroId("");
      return;
    }
    if (!parceiros.some((p) => p.id === parceiroId)) setParceiroId(parceiros[0].id);
  }, [parceiros, parceiroId]);

  const parceiro = useMemo(
    () => parceiros.find((p) => p.id === parceiroId) ?? null,
    [parceiros, parceiroId]
  );

  /** Os veículos cadastrados do parceiro escolhido. */
  const veiculosDoParceiro = useMemo(
    () => veiculos.filter((v) => v.parceiro_id === parceiroId),
    [veiculos, parceiroId]
  );

  /** As trocas do mês do parceiro, de todos os tipos. */
  const doParceiroTodos = useMemo(
    () => trocas.filter((t) => t.parceiro_id === parceiroId),
    [trocas, parceiroId]
  );

  /** O recorte do tipo escolhido — é ele que manda no calendário e nas contas. */
  const doParceiro = useMemo(
    () =>
      tipo === "todos"
        ? doParceiroTodos
        : doParceiroTodos.filter((t) => t.category === tipo),
    [doParceiroTodos, tipo]
  );

  /** Os dois números de cada dia do mês — é o que pinta o calendário. */
  const porDia = useMemo(() => {
    const map = new Map<string, DiaDaTroca>();
    for (const t of doParceiro) {
      const cur = map.get(t.entry_date) ?? { recebidas: 0, cedidas: 0 };
      cur.recebidas += Number(t.recebidas);
      cur.cedidas += Number(t.cedidas);
      map.set(t.entry_date, cur);
    }
    return map;
  }, [doParceiro]);

  /** O que já está lançado no dia aberto (uma linha por tipo de máquina). */
  const doDiaAberto = useMemo(
    () => (diaAberto ? doParceiro.filter((t) => t.entry_date === diaAberto) : []),
    [diaAberto, doParceiro]
  );

  /** O mês: quantas vieram, quantas foram. */
  const noMes = useMemo(() => {
    let recebidas = 0;
    let cedidas = 0;
    for (const t of doParceiro) {
      recebidas += Number(t.recebidas);
      cedidas += Number(t.cedidas);
    }
    return { recebidas, cedidas, saldo: cedidas - recebidas };
  }, [doParceiro]);

  /**
   * O mês separado POR TIPO. É assim que a conta fecha: somar as diárias de
   * caçamba com as de carregadeira daria um número que não quer dizer nada.
   */
  const noMesPorTipo = useMemo(() => {
    const map = new Map<string, { category: string; recebidas: number; cedidas: number; saldo: number }>();
    for (const t of doParceiroTodos) {
      const cur = map.get(t.category) ?? {
        category: t.category,
        recebidas: 0,
        cedidas: 0,
        saldo: 0,
      };
      cur.recebidas += Number(t.recebidas);
      cur.cedidas += Number(t.cedidas);
      cur.saldo = cur.cedidas - cur.recebidas;
      map.set(t.category, cur);
    }
    return [...map.values()].sort((a, b) => a.saldo - b.saldo);
  }, [doParceiroTodos]);

  /** O confronto de sempre, uma linha por tipo de máquina. */
  const saldosDoParceiro = useMemo(
    () =>
      saldos
        .filter((s) => s.parceiro_id === parceiroId)
        .sort((a, b) => Number(a.saldo) - Number(b.saldo)),
    [saldos, parceiroId]
  );

  /** O que o painel do confronto mostra, seguindo o tipo escolhido. */
  const doSaldo = useMemo(
    () =>
      tipo === "todos"
        ? saldosDoParceiro
        : saldosDoParceiro.filter((s) => s.category === tipo),
    [saldosDoParceiro, tipo]
  );

  /** Os tipos que já tiveram troca — são eles que viram os chips do filtro. */
  const tiposDoFiltro = useMemo(() => {
    const usados = new Set<string>();
    for (const s of saldosDoParceiro) usados.add(s.category);
    for (const t of doParceiroTodos) usados.add(t.category);
    return MACHINE_CATEGORIES.filter((c) => usados.has(c.value));
  }, [saldosDoParceiro, doParceiroTodos]);

  /** Os dias lançados no mês, do mais novo para o mais velho. */
  const diasDoMes = useMemo(
    () =>
      [...doParceiro].sort(
        (a, b) => b.entry_date.localeCompare(a.entry_date) || a.category.localeCompare(b.category)
      ),
    [doParceiro]
  );

  function abrirParceiro(p: MachineParceiro | null) {
    setEditParceiro(p);
    setParceiroDialogOpen(true);
  }

  function abrirVeiculo(v: MachineParceiroVeiculo | null, category?: string) {
    setEditVeiculo(v);
    setVeiculoCategory(v?.category ?? category ?? "cacamba");
    setVeiculoDialogOpen(true);
  }

  const primeiroNome = parceiro ? parceiro.name.split(" ")[0] : "ele";

  return (
    <div className="space-y-4">
      {migrationPendente && (
        <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            Rode a migration 076 no Supabase para a troca com o parceiro começar a
            guardar os dias.
          </span>
        </p>
      )}

      {/* Quem é o parceiro */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide flex-1 min-w-0">
          {parceiros.map((p) => (
            <Chip
              key={p.id}
              label={p.name}
              ativo={p.id === parceiroId}
              onClick={() => setParceiroId(p.id)}
            />
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="flex-shrink-0"
          onClick={() => abrirParceiro(null)}
        >
          <Plus className="w-4 h-4" />
          Parceiro
        </Button>
      </div>

      {!parceiro ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
          <Handshake className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-600" />
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 px-6">
            Cadastre o parceiro com quem você troca máquina. Depois é só marcar no
            calendário quantas máquinas dele vieram e quantas suas foram — a conta
            de quem está devendo diária sai sozinha.
          </p>
          <Button className="mt-3" onClick={() => abrirParceiro(null)}>
            <Plus className="w-4 h-4" />
            Cadastrar parceiro
          </Button>
        </div>
      ) : (
        <>
          {/* Filtro por tipo de máquina — cada um tem a sua conta */}
          {tiposDoFiltro.length > 1 && (
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
              <Chip label="Todos" ativo={tipo === "todos"} onClick={() => setTipo("todos")} />
              {tiposDoFiltro.map((c) => (
                <Chip
                  key={c.value}
                  label={c.label}
                  ativo={tipo === c.value}
                  onClick={() => setTipo(tipo === c.value ? "todos" : c.value)}
                />
              ))}
            </div>
          )}

          {/* O CONFRONTO — uma conta para cada tipo de máquina */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
            <p className="text-[11px] font-medium tracking-wide text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5 pt-3">
              <Scale className="w-3.5 h-3.5" />
              CONFRONTO DE SEMPRE
            </p>

            {doSaldo.length === 0 ? (
              <p className="py-4 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">
                Nada lançado ainda
              </p>
            ) : (
              <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
                {doSaldo.map((s) => {
                  const saldo = Number(s.saldo);
                  return (
                    <div
                      key={s.category}
                      className="px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <span
                          className={cn(
                            "text-xs font-semibold px-2 py-0.5 rounded-full",
                            categoryChip(s.category)
                          )}
                        >
                          {machineCategoryLabel(s.category)}
                        </span>
                        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                          Vieram {formatQty(Number(s.recebidas))} · foram{" "}
                          {formatQty(Number(s.cedidas))} · {s.dias}{" "}
                          {s.dias === 1 ? "dia" : "dias"}
                          {s.ultimo_dia ? ` · último em ${formatDate(s.ultimo_dia)}` : ""}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {saldo === 0 ? (
                          <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
                            quites
                          </p>
                        ) : (
                          <>
                            <p
                              className={cn(
                                "text-xl font-black tabular-nums leading-tight",
                                saldo < 0
                                  ? "text-amber-700 dark:text-amber-400"
                                  : "text-emerald-700 dark:text-emerald-400"
                              )}
                            >
                              {formatQty(Math.abs(saldo))}{" "}
                              {Math.abs(saldo) === 1 ? "diária" : "diárias"}
                            </p>
                            <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                              {saldo < 0
                                ? `você deve a ${primeiroNome}`
                                : `${primeiroNome} deve a você`}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="px-4 py-2 text-[11px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800">
              Cada tipo tem a sua conta: diária de caçamba se paga com caçamba. Os
              tipos não se somam nem se compensam entre si.
            </p>
          </div>

          {/* O CALENDÁRIO */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
            <TrocaCalendario
              year={year}
              month={month}
              onPrevMonth={onPrevMonth}
              onNextMonth={onNextMonth}
              porDia={porDia}
              onDayClick={setDiaAberto}
            />
            {tipo === "todos" && tiposDoFiltro.length > 1 && (
              <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                O número do dia conta as máquinas de todos os tipos juntas. Escolha um
                tipo acima para ver só ele.
              </p>
            )}
          </div>

          {/* O mês fechado — separado por tipo, que é como a conta fecha */}
          {tipo === "todos" ? (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
              <div className="px-3 py-2 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-medium tracking-wide text-slate-400 dark:text-slate-500">
                  NO MÊS, POR TIPO
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">
                  vieram · foram
                </span>
              </div>
              {noMesPorTipo.length === 0 ? (
                <p className="px-3 py-3 text-xs text-slate-400 dark:text-slate-500 text-center">
                  Nada lançado neste mês.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {noMesPorTipo.map((n) => (
                    <div
                      key={n.category}
                      className="px-3 py-2 flex items-center justify-between gap-2"
                    >
                      <span
                        className={cn(
                          "text-[11px] font-semibold px-2 py-0.5 rounded-full",
                          categoryChip(n.category)
                        )}
                      >
                        {machineCategoryLabel(n.category)}
                      </span>
                      <span className="text-xs tabular-nums">
                        <span className="font-semibold text-amber-700 dark:text-amber-400">
                          {formatQty(n.recebidas)}
                        </span>
                        <span className="text-slate-400 dark:text-slate-500"> · </span>
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                          {formatQty(n.cedidas)}
                        </span>
                        {n.saldo !== 0 && (
                          <span
                            className={cn(
                              "ml-2 font-bold",
                              n.saldo < 0
                                ? "text-amber-700 dark:text-amber-400"
                                : "text-emerald-700 dark:text-emerald-400"
                            )}
                          >
                            {n.saldo > 0 ? "+" : "−"}
                            {formatQty(Math.abs(n.saldo))}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden dark:border-slate-700 dark:bg-slate-900">
            <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800">
              <NumeroDoMes
                label="VIERAM"
                valor={formatQty(noMes.recebidas)}
                tom="text-amber-700 dark:text-amber-400"
              />
              <NumeroDoMes
                label="FORAM"
                valor={formatQty(noMes.cedidas)}
                tom="text-emerald-700 dark:text-emerald-400"
              />
              <NumeroDoMes
                label="NO MÊS"
                valor={
                  noMes.saldo === 0 ? "0" : `${noMes.saldo > 0 ? "+" : "−"}${formatQty(Math.abs(noMes.saldo))}`
                }
                tom={
                  noMes.saldo === 0
                    ? "text-slate-500 dark:text-slate-400"
                    : noMes.saldo < 0
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-emerald-700 dark:text-emerald-400"
                }
              />
            </div>
          </div>
          )}

          {/* Os dias lançados no mês */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {diasDoMes.length === 0
                ? "Nenhum dia lançado neste mês"
                : diasDoMes.length === 1
                  ? "1 dia lançado neste mês"
                  : `${diasDoMes.length} dias lançados neste mês`}
            </p>

            {diasDoMes.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-500 py-6 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-700 px-6">
                Toque num dia do calendário e diga quantas máquinas de {primeiroNome}{" "}
                vieram e quantas suas foram.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                {diasDoMes.map((t) => {
                  const saldo = Number(t.cedidas) - Number(t.recebidas);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setDiaAberto(t.entry_date)}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-white dark:bg-slate-900 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                          {formatDate(t.entry_date)} ·{" "}
                          <span className="font-normal">
                            {machineCategoryLabel(t.category)}
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums truncate">
                          Vieram {formatQty(Number(t.recebidas))} · foram{" "}
                          {formatQty(Number(t.cedidas))}
                          {t.notes ? ` · ${t.notes}` : ""}
                        </p>
                        {/* QUAIS foram — é o que responde no fim do mês */}
                        {(t.veiculos_dele || t.veiculos_meus) && (
                          <p className="text-[11px] truncate">
                            {t.veiculos_dele && (
                              <span className="text-amber-700 dark:text-amber-400">
                                {t.veiculos_dele}
                              </span>
                            )}
                            {t.veiculos_dele && t.veiculos_meus ? " · " : ""}
                            {t.veiculos_meus && (
                              <span className="text-emerald-700 dark:text-emerald-400">
                                {t.veiculos_meus}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "text-xs font-bold tabular-nums flex-shrink-0",
                          saldo === 0
                            ? "text-slate-400 dark:text-slate-500"
                            : saldo < 0
                              ? "text-amber-700 dark:text-amber-400"
                              : "text-emerald-700 dark:text-emerald-400"
                        )}
                      >
                        {saldo === 0
                          ? "quites"
                          : `${saldo > 0 ? "+" : "−"}${formatQty(Math.abs(saldo))}`}
                      </span>
                      <Pencil className="w-3 h-3 text-slate-300 dark:text-slate-600 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Os veículos dele: é a placa que responde qual máquina foi */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Veículos de {primeiroNome}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {veiculosDoParceiro.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => abrirVeiculo(v)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg text-[11px] font-semibold",
                    categoryChip(v.category)
                  )}
                >
                  {parceiroVeiculoLabel(v)}
                  {v.plate && v.name ? (
                    <span className="font-normal opacity-70"> · {v.name}</span>
                  ) : null}
                </button>
              ))}
              <button
                type="button"
                onClick={() => abrirVeiculo(null)}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-dashed border-slate-300 text-slate-500 dark:border-slate-600 dark:text-slate-400"
              >
                + veículo
              </button>
            </div>
            {veiculosDoParceiro.length === 0 && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Cadastre a placa das máquinas dele para marcar, em cada dia, qual
                trabalhou e qual parou.
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => abrirParceiro(parceiro)}
            className="text-[11px] font-medium text-produmar-600 dark:text-produmar-400 underline underline-offset-2"
          >
            Editar {parceiro.name}
          </button>

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Aqui não corre dinheiro: é dia de máquina pagando dia de máquina. Por isso
            nada desta aba entra na receita ou na despesa da ficha do veículo.
          </p>
        </>
      )}

      {parceiro && (
        <TrocaDiaDialog
          dia={diaAberto}
          onClose={() => setDiaAberto(null)}
          parceiro={parceiro}
          doDia={doDiaAberto}
          veiculosDoParceiro={veiculosDoParceiro}
          minhasMaquinas={minhasMaquinas}
          onNovoVeiculo={(category) => abrirVeiculo(null, category)}
        />
      )}

      {parceiro && (
        <ParceiroVeiculoDialog
          open={veiculoDialogOpen}
          onClose={() => setVeiculoDialogOpen(false)}
          parceiro={parceiro}
          veiculo={editVeiculo}
          presetCategory={veiculoCategory}
        />
      )}

      <ParceiroDialog
        open={parceiroDialogOpen}
        onClose={() => setParceiroDialogOpen(false)}
        parceiro={editParceiro}
      />
    </div>
  );
}

/**
 * O CALENDÁRIO DA TROCA — o mês com os dois números em cada dia.
 *
 * No canto de cima, em âmbar, quantas máquinas DELE vieram naquele dia; no de
 * baixo, em verde, quantas NOSSAS foram. Toque no dia para lançar ou corrigir.
 */
function TrocaCalendario({
  year,
  month,
  onPrevMonth,
  onNextMonth,
  porDia,
  onDayClick,
}: {
  year: number;
  month: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  porDia: Map<string, DiaDaTroca>;
  onDayClick: (iso: string) => void;
}) {
  const cells = monthCells(year, month);
  const today = localDateISO();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onPrevMonth}
          aria-label="Mês anterior"
          className="w-11 h-11 flex items-center justify-center rounded-lg text-produmar-600 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-slate-800 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-sm font-semibold text-produmar-800 dark:text-slate-100 capitalize">
          {monthLabel(year, month)}
        </span>
        <button
          type="button"
          onClick={onNextMonth}
          aria-label="Próximo mês"
          className="w-11 h-11 flex items-center justify-center rounded-lg text-produmar-600 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-slate-800 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAY_INITIALS.map((w, i) => (
          <span
            key={i}
            className="text-center text-[11px] font-semibold text-slate-400 dark:text-slate-500 py-1"
          >
            {w}
          </span>
        ))}

        {cells.map((iso, i) => {
          if (!iso) return <span key={`v${i}`} />;

          const dia = porDia.get(iso);
          const temAlgo = !!dia && (dia.recebidas > 0 || dia.cedidas > 0);
          const isToday = iso === today;
          const numero = Number(iso.split("-")[2]);

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onDayClick(iso)}
              aria-label={`Dia ${numero}${
                temAlgo
                  ? ` — vieram ${dia.recebidas}, foram ${dia.cedidas}`
                  : " — sem troca"
              }`}
              className={cn(
                "relative aspect-square rounded-lg border text-sm font-semibold tabular-nums flex items-center justify-center transition-colors active:scale-95",
                temAlgo
                  ? "bg-slate-50 border-produmar-300 text-slate-700 dark:bg-slate-800 dark:border-produmar-700 dark:text-slate-100"
                  : "bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300",
                isToday && !temAlgo && "border-produmar-400 dark:border-produmar-600"
              )}
            >
              {numero}
              {/* em cima, as dele que vieram; embaixo, as nossas que foram */}
              {!!dia && dia.recebidas > 0 && (
                <span className="absolute top-0.5 right-1 text-[9px] font-bold leading-none text-amber-600 dark:text-amber-400">
                  {formatQty(dia.recebidas)}
                </span>
              )}
              {!!dia && dia.cedidas > 0 && (
                <span className="absolute bottom-0.5 right-1 text-[9px] font-bold leading-none text-emerald-600 dark:text-emerald-400">
                  {formatQty(dia.cedidas)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
        <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
          <ArrowDownLeft className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          em cima: máquinas dele
        </span>
        <span className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
          <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          embaixo: minhas
        </span>
      </div>
    </div>
  );
}

function NumeroDoMes({
  label,
  valor,
  tom,
}: {
  label: string;
  valor: string;
  tom: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-3 px-1">
      <span className={cn("text-base font-bold leading-none tabular-nums", tom)}>
        {valor}
      </span>
      <span className="text-[11px] font-medium leading-none tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </span>
    </div>
  );
}
