"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, HandCoins, Phone, Trash2, Trees } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MonthNav } from "@/components/ui/month-nav";
import { FOOTER_CANCEL, FOOTER_SUBMIT, STICKY_FOOTER } from "@/components/alugueis/alugueis-shared";
import { CalendarioDoMes, LegendaDaAgenda } from "@/components/chacaras/calendario-do-mes";
import { cn, formatBRL, formatBRLInput, mascaraTelefone, parseMoney } from "@/lib/utils";
import { actionError } from "@/lib/action-result";
import {
  FORMAS_PAGAMENTO,
  SITUACAO_LABEL,
  cruzam,
  diaComSemana,
  formaLabel,
  mesLabel,
  periodoLabel,
  somarMes,
  totalDeDias,
} from "@/lib/chacaras";
import { excluirReserva, receberRestante, salvarReserva } from "@/app/(app)/chacaras/actions";
import type { Chacara, ChacaraFormaPagamento, ChacaraReserva, ChacaraSituacao } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// A RESERVA, UMA TELA POR VEZ (como a OS nova)
// ─────────────────────────────────────────────────────────────────────────────
//   1. a chácara e os dias — no calendário, com os dias ocupados bloqueados
//   2. o cliente
//   3. o valor, a forma e quanto já pagou
//   4. conferir — cada linha volta para a tela dela
// A reserva que já existe abre direto na conferência.
// ─────────────────────────────────────────────────────────────────────────────

type Passo = "dias" | "cliente" | "pagamento" | "conferir";
const PASSOS: Passo[] = ["dias", "cliente", "pagamento", "conferir"];
const TITULO: Record<Passo, string> = {
  dias: "Qual chácara e quais dias?",
  cliente: "Quem está alugando?",
  pagamento: "Valor e pagamento",
  conferir: "Conferir a reserva",
};

export type AberturaReserva =
  | { tipo: "nova"; chacaraId?: string; dia?: string }
  | { tipo: "existente"; reserva: ChacaraReserva };

export function ReservaDialog({
  abertura,
  onClose,
  chacaras,
  reservas,
  mesDaTela,
  podeGravar,
}: {
  abertura: AberturaReserva | null;
  onClose: () => void;
  chacaras: Chacara[];
  reservas: ChacaraReserva[];
  mesDaTela: string;
  podeGravar: boolean;
}) {
  const open = !!abertura;
  const existente = abertura?.tipo === "existente" ? abertura.reserva : null;
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [passoIdx, setPassoIdx] = useState(0);
  const trocouEm = useRef(0);
  const passo = PASSOS[passoIdx];

  const [chacaraId, setChacaraId] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  /** Já tocou no primeiro dia: o próximo toque fecha o intervalo. */
  const [esperandoFim, setEsperandoFim] = useState(false);
  const [mesPicker, setMesPicker] = useState(mesDaTela);

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [valor, setValor] = useState("");
  const [forma, setForma] = useState<ChacaraFormaPagamento>("pix");
  const [situacao, setSituacao] = useState<ChacaraSituacao>("reservado");
  const [sinal, setSinal] = useState("");
  const [obs, setObs] = useState("");
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  // abrir o diálogo preenche tudo de novo
  useEffect(() => {
    if (!abertura) return;
    setErro(null);
    setAviso(null);
    setConfirmandoExclusao(false);
    trocouEm.current = Date.now();
    if (abertura.tipo === "existente") {
      const r = abertura.reserva;
      setChacaraId(r.chacara_id);
      setInicio(r.data_inicio);
      setFim(r.data_fim);
      setEsperandoFim(false);
      setMesPicker(r.data_inicio.slice(0, 7));
      setNome(r.cliente_nome);
      setTelefone(r.cliente_telefone ?? "");
      setValor(formatBRLInput(Number(r.valor)));
      setForma(r.forma_pagamento);
      setSituacao(r.situacao);
      setSinal(r.situacao === "sinal" ? formatBRLInput(Number(r.valor_pago)) : "");
      setObs(r.observacao ?? "");
      setPassoIdx(PASSOS.indexOf("conferir"));
    } else {
      setChacaraId(abertura.chacaraId ?? chacaras[0]?.id ?? "");
      setInicio(abertura.dia ?? "");
      setFim(abertura.dia ?? "");
      setEsperandoFim(!!abertura.dia);
      setMesPicker(abertura.dia ? abertura.dia.slice(0, 7) : mesDaTela);
      setNome("");
      setTelefone("");
      setValor("");
      setForma("pix");
      setSituacao("reservado");
      setSinal("");
      setObs("");
      setPassoIdx(0);
    }
    // abrir é o gatilho
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abertura]);

  const chacara = chacaras.find((c) => c.id === chacaraId);
  /** As outras reservas desta chácara — a reserva que está sendo corrigida não conta. */
  const ocupadas = useMemo(
    () => reservas.filter((r) => r.chacara_id === chacaraId && r.id !== existente?.id),
    [reservas, chacaraId, existente?.id]
  );

  const valorNum = parseMoney(valor);
  const valorPago = situacao === "pago" ? valorNum : situacao === "sinal" ? parseMoney(sinal) : 0;
  const falta = Math.max(0, valorNum - valorPago);
  const dias = inicio && fim ? totalDeDias(inicio, fim) : 0;

  /** Quem atrapalha esses dias, para avisar antes de seguir. */
  function conflitoCom(i: string, f: string): ChacaraReserva | null {
    return ocupadas.find((r) => cruzam(i, f, r.data_inicio, r.data_fim)) ?? null;
  }

  function recadoDoConflito(r: ChacaraReserva): string {
    return `${chacara?.nome ?? "A chácara"}: ${periodoLabel(r.data_inicio, r.data_fim)} já está ${
      r.situacao === "pago" ? "alugado e pago" : "reservado"
    } para ${r.cliente_nome}.`;
  }

  function tocarDia(dia: string, reserva: ChacaraReserva | null) {
    setErro(null);
    if (reserva) {
      setAviso(recadoDoConflito(reserva));
      return;
    }
    setAviso(null);
    if (esperandoFim && inicio && dia >= inicio) {
      const c = conflitoCom(inicio, dia);
      if (c) {
        setAviso(`${recadoDoConflito(c)} Escolha dias sem reserva no meio.`);
        return;
      }
      setFim(dia);
      setEsperandoFim(false);
      return;
    }
    setInicio(dia);
    setFim(dia);
    setEsperandoFim(true);
  }

  function irPara(i: number) {
    setErro(null);
    setAviso(null);
    trocouEm.current = Date.now();
    setPassoIdx(Math.max(0, Math.min(i, PASSOS.length - 1)));
  }

  function faltaNoPasso(p: Passo): string | null {
    if (p === "dias") {
      if (!chacaraId) return "Escolha a chácara";
      if (!inicio || !fim) return "Toque no dia da reserva no calendário";
      const c = conflitoCom(inicio, fim);
      if (c) return recadoDoConflito(c);
    }
    if (p === "cliente" && !nome.trim()) return "Escreva o nome do cliente";
    if (p === "pagamento") {
      if (valorNum <= 0) return "Informe o valor do aluguel";
      if (situacao === "sinal") {
        const s = parseMoney(sinal);
        if (s <= 0) return "Informe quanto foi pago de sinal";
        if (s >= valorNum) return "O sinal é menor que o valor — se pagou tudo, marque Pago tudo";
      }
    }
    return null;
  }

  function salvar() {
    setErro(null);
    startTransition(async () => {
      const res = await salvarReserva(existente?.id ?? null, {
        chacara_id: chacaraId,
        data_inicio: inicio,
        data_fim: fim,
        cliente_nome: nome,
        cliente_telefone: telefone || null,
        valor: valorNum,
        valor_pago: valorPago,
        forma_pagamento: forma,
        observacao: obs || null,
      });
      const e = actionError(res);
      if (e) {
        setErro(e);
        return;
      }
      onClose();
    });
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!podeGravar) return;
    if (passo !== "conferir") {
      const f = faltaNoPasso(passo);
      if (f) {
        setErro(f);
        return;
      }
      irPara(passoIdx + 1);
      return;
    }
    // o toque duplo no "Próximo" não grava sem conferir
    if (Date.now() - trocouEm.current < 600) return;
    for (let i = 0; i < PASSOS.length - 1; i++) {
      const f = faltaNoPasso(PASSOS[i]);
      if (f) {
        irPara(i);
        setErro(f);
        return;
      }
    }
    salvar();
  }

  function receberResto() {
    if (!existente) return;
    setErro(null);
    startTransition(async () => {
      const e = actionError(await receberRestante(existente.id));
      if (e) setErro(e);
      else onClose();
    });
  }

  function excluir() {
    if (!existente) return;
    setErro(null);
    startTransition(async () => {
      const e = actionError(await excluirReserva(existente.id));
      if (e) setErro(e);
      else onClose();
    });
  }

  const [anoPicker, mesNumPicker] = mesPicker.split("-").map(Number);

  // ── As telas ─────────────────────────────────────────────────────────────
  const telaDias = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {chacaras.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              setChacaraId(c.id);
              setAviso(null);
              setErro(null);
            }}
            className={cn(
              "flex h-12 items-center justify-center gap-1.5 rounded-xl border px-2 text-sm font-semibold transition-colors",
              c.id === chacaraId
                ? "border-produmar-600 bg-produmar-600 text-white"
                : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            )}
          >
            <Trees className="h-4 w-4 shrink-0" />
            <span className="truncate">{c.nome}</span>
          </button>
        ))}
      </div>

      <div className="flex justify-center">
        <MonthNav
          label={mesLabel(anoPicker, mesNumPicker)}
          onPrev={() => setMesPicker((m) => somarMes(m, -1))}
          onNext={() => setMesPicker((m) => somarMes(m, 1))}
        />
      </div>

      <CalendarioDoMes
        ano={anoPicker}
        mes={mesNumPicker}
        reservas={ocupadas}
        selecao={inicio && fim ? { inicio, fim } : null}
        onToque={tocarDia}
      />
      <LegendaDaAgenda />

      <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
        {inicio ? (
          <>
            <p className="font-semibold text-slate-800 dark:text-slate-100">
              {inicio === fim ? diaComSemana(inicio) : `${diaComSemana(inicio)} a ${diaComSemana(fim)}`} ·{" "}
              {dias} {dias === 1 ? "dia" : "dias"}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {esperandoFim
                ? "Vai ficar mais de um dia? Toque no último dia. Se é só esse, toque em Próximo."
                : "Para trocar, toque em outro dia."}
            </p>
          </>
        ) : (
          <p className="text-slate-500 dark:text-slate-400">
            Toque no primeiro dia da reserva. Os dias coloridos já estão ocupados.
          </p>
        )}
      </div>
    </div>
  );

  const telaCliente = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="ch_nome">Nome do cliente *</Label>
        <Input
          id="ch_nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Quem está alugando"
          autoComplete="off"
          autoCapitalize="words"
          enterKeyHint="next"
          className="h-12 text-base"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ch_tel">Telefone (opcional)</Label>
        <Input
          id="ch_tel"
          value={telefone}
          onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
          placeholder="(99) 99999-9999"
          inputMode="tel"
          autoComplete="off"
          enterKeyHint="next"
          className="h-12 text-base tabular-nums"
        />
      </div>
    </div>
  );

  const telaPagamento = (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="ch_valor">Valor do aluguel (R$) *</Label>
        <Input
          id="ch_valor"
          value={valor}
          onChange={(e) => setValor(formatBRLInput(e.target.value))}
          placeholder="0,00"
          inputMode="decimal"
          autoComplete="off"
          className="h-12 text-lg font-semibold tabular-nums"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Forma de pagamento</Label>
        <div className="grid grid-cols-3 gap-2">
          {FORMAS_PAGAMENTO.map((f) => (
            <button
              key={f.valor}
              type="button"
              onClick={() => setForma(f.valor)}
              className={cn(
                "h-11 rounded-xl border px-1 text-sm font-medium transition-colors",
                forma === f.valor
                  ? "border-produmar-600 bg-produmar-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Já pagou?</Label>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["reservado", "Ainda não"],
              ["sinal", "Sinal"],
              ["pago", "Pago tudo"],
            ] as [ChacaraSituacao, string][]
          ).map(([s, label]) => (
            <button
              key={s}
              type="button"
              onClick={() => setSituacao(s)}
              className={cn(
                "h-11 rounded-xl border px-1 text-sm font-medium transition-colors",
                situacao === s
                  ? s === "pago"
                    ? "border-emerald-600 bg-emerald-600 text-white"
                    : "border-amber-500 bg-amber-500 text-white"
                  : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {situacao === "sinal" && (
        <div className="space-y-1.5">
          <Label htmlFor="ch_sinal">Quanto pagou de sinal (R$)</Label>
          <Input
            id="ch_sinal"
            value={sinal}
            onChange={(e) => setSinal(formatBRLInput(e.target.value))}
            placeholder="0,00"
            inputMode="decimal"
            autoComplete="off"
            className="h-12 text-lg font-semibold tabular-nums"
          />
        </div>
      )}

      {valorNum > 0 && (
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          {situacao === "pago" ? (
            <>Recebido {formatBRL(valorNum)} — nada a receber.</>
          ) : (
            <>
              Recebido {formatBRL(valorPago)} · <b>falta {formatBRL(falta)}</b>
            </>
          )}
        </p>
      )}
    </div>
  );

  const linhas: { passo: Passo; titulo: string; valor: string }[] = [
    { passo: "dias", titulo: "Chácara", valor: chacara?.nome ?? "—" },
    {
      passo: "dias",
      titulo: "Dias",
      valor: inicio ? `${periodoLabel(inicio, fim)} · ${dias} ${dias === 1 ? "dia" : "dias"}` : "—",
    },
    { passo: "cliente", titulo: "Cliente", valor: nome.trim() || "—" },
    { passo: "cliente", titulo: "Telefone", valor: telefone || "—" },
    { passo: "pagamento", titulo: "Valor", valor: valorNum > 0 ? formatBRL(valorNum) : "—" },
    { passo: "pagamento", titulo: "Forma", valor: formaLabel(forma) },
    {
      passo: "pagamento",
      titulo: "Situação",
      valor:
        situacao === "pago"
          ? "Pago"
          : situacao === "sinal"
            ? `${SITUACAO_LABEL.sinal}: ${formatBRL(valorPago)} · falta ${formatBRL(falta)}`
            : `Reservado · falta ${formatBRL(valorNum)}`,
    },
  ];

  const telaConferir = (
    <div className="space-y-3">
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
        {linhas.map((l) => (
          <button
            key={l.titulo}
            type="button"
            disabled={!podeGravar}
            onClick={() => irPara(PASSOS.indexOf(l.passo))}
            className="flex w-full items-start gap-3 px-3 py-2.5 text-left"
          >
            <span className="w-16 flex-shrink-0 pt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{l.titulo}</span>
            <span className="min-w-0 flex-1 break-words text-sm font-medium text-slate-700 dark:text-slate-200">
              {l.valor}
            </span>
            {podeGravar && <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-300" />}
          </button>
        ))}
      </div>

      {telefone && (
        <a
          href={`tel:${telefone.replace(/\D/g, "")}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-produmar-600 dark:text-produmar-400"
        >
          <Phone className="h-4 w-4" />
          Ligar para {nome.trim().split(/\s+/)[0]}
        </a>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="ch_obs">Observações</Label>
        {podeGravar ? (
          <Textarea
            id="ch_obs"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            placeholder="Ex.: festa de aniversário, chega sexta à noite"
            rows={2}
          />
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-300">{obs || "—"}</p>
        )}
      </div>

      {existente && podeGravar && (
        <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          {existente.situacao !== "pago" && (
            <Button
              type="button"
              variant="outline"
              onClick={receberResto}
              disabled={isPending}
              className="h-11 w-full border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400"
            >
              <HandCoins className="h-4 w-4" />
              Recebi o restante ({formatBRL(Math.max(0, Number(existente.valor) - Number(existente.valor_pago)))})
            </Button>
          )}
          {confirmandoExclusao ? (
            <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-950/30">
              <p className="text-sm text-red-700 dark:text-red-400">
                Excluir a reserva de {existente.cliente_nome}? O dia volta a ficar livre na agenda.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 flex-1"
                  onClick={() => setConfirmandoExclusao(false)}
                  disabled={isPending}
                >
                  Não
                </Button>
                <Button type="button" variant="destructive" className="h-10 flex-1" onClick={excluir} disabled={isPending}>
                  Sim, excluir
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmandoExclusao(true)}
              disabled={isPending}
              className="h-10 w-full text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <Trash2 className="h-4 w-4" />
              Excluir reserva
            </Button>
          )}
        </div>
      )}
    </div>
  );

  const CORPO: Record<Passo, React.ReactNode> = {
    dias: telaDias,
    cliente: telaCliente,
    pagamento: telaPagamento,
    conferir: telaConferir,
  };

  const ultimo = passo === "conferir";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <CalendarDays className="h-4 w-4" />
            </span>
            {existente ? `Reserva de ${existente.cliente_nome}` : "Nova reserva"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {podeGravar && (
            <div className="space-y-1.5">
              <div className="flex gap-1">
                {PASSOS.map((p, i) => (
                  <span
                    key={p}
                    className={cn(
                      "h-1 flex-1 rounded-full",
                      i <= passoIdx ? "bg-produmar-600" : "bg-slate-200 dark:bg-slate-700"
                    )}
                  />
                ))}
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                Passo {passoIdx + 1} de {PASSOS.length}
              </p>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{TITULO[passo]}</h3>
            </div>
          )}

          <div key={passo}>{CORPO[podeGravar ? passo : "conferir"]}</div>

          {aviso && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
              {aviso}
            </p>
          )}
          {erro && (
            <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-400">
              {erro}
            </p>
          )}

          <DialogFooter className={STICKY_FOOTER}>
            {podeGravar ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => (passoIdx === 0 || (existente && ultimo) ? onClose() : irPara(passoIdx - 1))}
                  disabled={isPending}
                  className={cn(FOOTER_CANCEL, "h-11 sm:h-10")}
                >
                  {passoIdx === 0 || (existente && ultimo) ? (
                    existente ? "Fechar" : "Cancelar"
                  ) : (
                    <>
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      Voltar
                    </>
                  )}
                </Button>
                <Button type="submit" disabled={isPending} className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}>
                  {isPending ? (
                    "Salvando..."
                  ) : ultimo ? (
                    existente ? "Salvar" : "Reservar"
                  ) : (
                    <>
                      Próximo
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </>
                  )}
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" onClick={onClose} className="h-11 w-full sm:h-10 sm:w-auto">
                Fechar
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
