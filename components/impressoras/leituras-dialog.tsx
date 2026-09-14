"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, Gauge } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actionError } from "@/lib/action-result";
import { cn, formatBRL, localDateISO } from "@/lib/utils";
import {
  calcularFatura,
  formatPaginas,
  nomeDoMes,
  precoDaPagina,
  vencimentoDaFatura,
} from "@/lib/impressoras";
import { salvarLeiturasDoMes } from "@/app/(app)/impressoras/actions";
import { FOOTER_CANCEL, FOOTER_SUBMIT, STICKY_FOOTER } from "@/components/alugueis/alugueis-shared";
import type { Printer, PrinterBilling, PrinterContract, PrinterReading } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  contract: PrinterContract;
  /** As impressoras que entram na leitura, já em ordem de unidade. */
  printers: Printer[];
  /** A fatura do mês, quando já existe — aí é correção. */
  billing: PrinterBilling | null;
  /** As leituras dessa fatura. */
  readings: PrinterReading[];
  /** O contador de onde o mês parte, por impressora. */
  anteriores: Map<string, number>;
  competencia: string;
  /** A data da leitura do mês passado. */
  dataAnterior: string | null;
}

/** Só dígitos: o contador é número inteiro. */
function soDigitos(v: string): string {
  return v.replace(/[^\d]/g, "").slice(0, 12);
}

/**
 * AS LEITURAS DO MÊS — o contador de cada impressora.
 *
 * A leitura anterior JÁ VEM PREENCHIDA: é a atual da fatura do mês passado (ou o
 * contador de instalação, na impressora nova). Quem lança só digita o número que
 * está no painel de cada máquina, e a fatura vai se fazendo embaixo, com a mesma
 * conta da planilha: páginas × preço, mais as mensalidades, menos a franquia.
 *
 * Leitura atual menor que a anterior fica vermelha e não salva — é quase sempre
 * um dígito trocado, e é o erro que mais estraga uma fatura.
 */
export function LeiturasDialog({
  open,
  onClose,
  contract,
  printers,
  billing,
  readings,
  anteriores,
  competencia,
  dataAnterior,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [previousDate, setPreviousDate] = useState("");
  const [readingDate, setReadingDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [valores, setValores] = useState<Record<string, { anterior: string; atual: string }>>({});

  useEffect(() => {
    if (!open) return;
    setErro(null);
    setPreviousDate(billing?.previous_date ?? dataAnterior ?? "");
    setReadingDate(billing?.reading_date ?? localDateISO());
    setDueDate(billing?.due_date ?? vencimentoDaFatura(competencia, contract.due_day));
    const daFatura = new Map(readings.map((r) => [r.printer_id, r]));
    const iniciais: Record<string, { anterior: string; atual: string }> = {};
    for (const p of printers) {
      const r = daFatura.get(p.id);
      iniciais[p.id] = {
        anterior: String(r ? r.previous_reading : anteriores.get(p.id) ?? p.initial_reading),
        atual: r ? String(r.current_reading) : "",
      };
    }
    setValores(iniciais);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function mudar(id: string, campo: "anterior" | "atual", texto: string) {
    setValores((v) => ({ ...v, [id]: { ...v[id], [campo]: soDigitos(texto) } }));
  }

  /** A fatura enquanto se digita — quem ainda não tem leitura conta zero página. */
  const conta = useMemo(() => {
    const linhas = printers.map((p) => {
      const v = valores[p.id] ?? { anterior: "0", atual: "" };
      const anterior = Number(v.anterior || 0);
      const atual = v.atual === "" ? anterior : Number(v.atual);
      return {
        previous_reading: anterior,
        current_reading: Math.max(atual, anterior),
        monthly_fee: Number(p.monthly_fee),
        page_price: precoDaPagina(p, contract),
      };
    });
    return calcularFatura(linhas, Number(contract.franchise_pages), Number(contract.page_price));
  }, [printers, valores, contract]);

  const faltando = printers.filter((p) => !valores[p.id]?.atual);
  const invertidas = printers.filter((p) => {
    const v = valores[p.id];
    return v?.atual !== "" && v?.atual !== undefined && Number(v.atual) < Number(v.anterior || 0);
  });

  function salvar() {
    setErro(null);
    if (!readingDate) return setErro("Informe a data da leitura");
    if (faltando.length > 0)
      return setErro(`Falta a leitura atual da unidade ${faltando.map((p) => p.unit).join(", ")}`);
    if (invertidas.length > 0)
      return setErro(
        `A leitura atual está menor que a anterior na unidade ${invertidas.map((p) => p.unit).join(", ")}`
      );

    startTransition(async () => {
      const falha = actionError(
        await salvarLeiturasDoMes({
          contract_id: contract.id,
          competencia,
          previous_date: previousDate || null,
          reading_date: readingDate,
          due_date: dueDate || null,
          leituras: printers.map((p) => ({
            printer_id: p.id,
            previous_reading: Number(valores[p.id]?.anterior || 0),
            current_reading: Number(valores[p.id]?.atual || 0),
          })),
        })
      );
      if (falha) return setErro(falha);
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <Gauge className="w-4 h-4 text-produmar-600 dark:text-produmar-400" />
            <span>
              Leituras de <span className="capitalize">{nomeDoMes(competencia)}</span>
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lt_ant">Leitura anterior em</Label>
              <Input
                id="lt_ant"
                type="date"
                value={previousDate}
                onChange={(e) => setPreviousDate(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt_atual">Leitura atual em *</Label>
              <Input
                id="lt_atual"
                type="date"
                value={readingDate}
                onChange={(e) => setReadingDate(e.target.value)}
                className="tabular-nums"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lt_venc">Vencimento da fatura</Label>
            <Input
              id="lt_venc"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="tabular-nums"
            />
          </div>

          {printers.length === 0 ? (
            <p className="text-sm text-amber-700 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400 rounded-lg px-3 py-2">
              Nenhuma impressora ativa neste contrato. Cadastre na aba Impressoras.
            </p>
          ) : (
            <ul className="space-y-2">
              {printers.map((p, i) => {
                const v = valores[p.id] ?? { anterior: "", atual: "" };
                const linha = conta.linhas[i];
                const invertida = invertidas.some((x) => x.id === p.id);
                return (
                  <li
                    key={p.id}
                    className={cn(
                      "rounded-xl border p-2.5",
                      invertida
                        ? "border-red-300 bg-red-50/60 dark:border-red-900/60 dark:bg-red-950/20"
                        : "border-slate-200 dark:border-slate-700"
                    )}
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <span className="w-7 h-7 rounded-lg bg-produmar-50 dark:bg-produmar-900/40 text-produmar-700 dark:text-produmar-300 text-xs font-bold flex items-center justify-center tabular-nums flex-shrink-0">
                        {p.unit}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                          {p.model || "Impressora"}
                          {p.location ? ` · ${p.location}` : ""}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums truncate">
                          {p.serial_number}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                          {v.atual ? `${formatPaginas(linha?.pages ?? 0)} pág` : "—"}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                          {v.atual ? formatBRL(linha?.prints_amount ?? 0) : "sem leitura"}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">Anterior</span>
                        <Input
                          value={v.anterior}
                          onChange={(e) => mudar(p.id, "anterior", e.target.value)}
                          inputMode="numeric"
                          autoComplete="off"
                          semDitado
                          className="h-10 tabular-nums text-slate-500"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold text-produmar-700 dark:text-produmar-400">
                          Atual *
                        </span>
                        <Input
                          value={v.atual}
                          onChange={(e) => mudar(p.id, "atual", e.target.value)}
                          inputMode="numeric"
                          autoComplete="off"
                          semDitado
                          placeholder="leitura do painel"
                          className={cn(
                            "h-10 tabular-nums font-semibold",
                            invertida && "border-red-400 text-red-700"
                          )}
                        />
                      </div>
                    </div>
                    {invertida && (
                      <p className="text-[11px] text-red-600 dark:text-red-400 mt-1.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Menor que a anterior — confira o número.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* A fatura se fazendo */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 space-y-1 text-sm tabular-nums">
            <Resumo label={`Páginas impressas`} valor={formatPaginas(conta.total_pages)} />
            <Resumo label="Mensalidades" valor={formatBRL(conta.total_fees)} />
            <Resumo label="Impressões" valor={formatBRL(conta.total_prints)} />
            <Resumo
              label={`Franquia (${formatPaginas(conta.franchise_pages_applied)} pág)`}
              valor={`− ${formatBRL(conta.franchise_amount)}`}
            />
            <div className="border-t border-slate-200 dark:border-slate-700 pt-1.5 mt-1.5 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">TOTAL DA FATURA</span>
              <span className="text-base font-bold text-produmar-700 dark:text-produmar-400">
                {formatBRL(conta.total_amount)}
              </span>
            </div>
            {faltando.length > 0 && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400 pt-1">
                Faltam {faltando.length} de {printers.length} leituras — o total ainda vai mudar.
              </p>
            )}
          </div>

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
              {erro}
            </p>
          )}
        </div>

        <DialogFooter className={STICKY_FOOTER}>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
            className={cn(FOOTER_CANCEL, "h-11 sm:h-10")}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={salvar}
            disabled={isPending || printers.length === 0}
            className={cn(FOOTER_SUBMIT, "h-11 sm:h-10")}
          >
            {isPending ? "Salvando..." : billing ? "Salvar correção" : "Fechar a fatura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Resumo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-sm text-slate-800 dark:text-slate-100">{valor}</span>
    </div>
  );
}
