"use client";

import { useState, useTransition } from "react";
import { Ban, Copy, ExternalLink, Printer, Receipt, RefreshCw, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { actionError } from "@/lib/action-result";
import { cn, formatBRL, formatDate, localDateISO } from "@/lib/utils";
import {
  JUROS_PADRAO,
  MULTA_PADRAO,
  boletoEmAberto,
  mesesDoContrato,
  nomeDoMes,
  situacaoDoBoleto,
} from "@/lib/alugueis-boletos";
import {
  cancelarBoletoAluguel,
  gerarBoletosDoContrato,
  refazerBoletosDoContrato,
} from "@/app/(app)/alugueis/actions";
import { STICKY_FOOTER } from "./alugueis-shared";
import type { RentalBoleto, RentalContractView } from "@/lib/types";

interface Props {
  /** O contrato — null fecha a caixa. */
  contrato: RentalContractView | null;
  /** Os boletos valendo do contrato (sem os cancelados). */
  boletos: RentalBoleto[];
  /** O recado de quando o contrato acabou de ser salvo ("12 boletos gerados..."). */
  mensagem?: string | null;
  /** Sem a migration 129 a tabela não existe. */
  pendente?: boolean;
  onClose: () => void;
}

/**
 * OS BOLETOS DO CONTRATO — um por mês, emitidos na Cora com Pix.
 *
 * Daqui sai o carnê para entregar ao inquilino. Quando ele paga, a Cora avisa
 * e a baixa do mês acontece sozinha.
 */
export function BoletosDialog({ contrato, boletos, mensagem, pendente = false, onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const hoje = localDateISO();
  const lista = [...boletos].sort((a, b) => a.due_date.localeCompare(b.due_date));
  const comBoleto = new Set(lista.map((b) => b.competencia));
  const semBoleto = contrato
    ? mesesDoContrato(contrato).filter((m) => !comBoleto.has(m.competencia) && m.due_date >= hoje).length
    : 0;
  const abertosFuturos = lista.filter((b) => boletoEmAberto(b) && b.due_date >= hoje).length;
  const emAberto = lista.filter(boletoEmAberto).length;

  function fechar() {
    setErro(null);
    setRecado(null);
    onClose();
  }

  function rodar(acao: () => Promise<unknown>) {
    setErro(null);
    setRecado(null);
    startTransition(async () => {
      const r = await acao();
      const falha = actionError(r);
      if (falha) {
        setErro(falha);
        return;
      }
      if (r && typeof r === "object" && "gerados" in r) {
        const { gerados, aviso } = r as { gerados: number; aviso: string | null };
        setRecado(
          [gerados > 0 ? `${gerados} boleto${gerados === 1 ? "" : "s"} gerado${gerados === 1 ? "" : "s"}.` : "", aviso]
            .filter(Boolean)
            .join(" ") || "Nenhum boleto novo para gerar."
        );
      }
    });
  }

  async function copiar(texto: string, id: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
      setTimeout(() => setCopiado((c) => (c === id ? null : c)), 2000);
    } catch {
      setErro("Não deu para copiar — segure o dedo em cima do número para copiar.");
    }
  }

  const aviso = recado ?? mensagem ?? null;

  return (
    <Dialog open={!!contrato} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-slate-100">
            <span className="w-7 h-7 rounded-lg flex items-center justify-center bg-produmar-50 text-produmar-600 dark:bg-produmar-900/30 dark:text-produmar-400">
              <Receipt className="w-4 h-4" />
            </span>
            Boletos do aluguel
          </DialogTitle>
        </DialogHeader>

        {contrato && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 px-3 py-2">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                {contrato.tenant_name}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Imóvel nº {contrato.property_code} · {formatBRL(Number(contrato.monthly_amount))} por mês · vence
                dia {contrato.due_day}
              </p>
            </div>

            {pendente && (
              <p className="text-sm text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-400">
                Rode a migration 129 no Supabase para gerar os boletos do aluguel.
              </p>
            )}

            {aviso && (
              <p className="text-sm text-slate-700 bg-produmar-50 px-3 py-2 rounded-lg border border-produmar-100 dark:bg-produmar-900/20 dark:border-produmar-900/40 dark:text-slate-200">
                {aviso}
              </p>
            )}

            {lista.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">
                Nenhum boleto gerado ainda.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden max-h-[45vh] overflow-y-auto">
                {lista.map((b) => {
                  const s = situacaoDoBoleto(b, hoje);
                  return (
                    <div key={b.id} className="px-3 py-2.5 bg-white dark:bg-slate-900 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 capitalize truncate">
                            {nomeDoMes(b.competencia)}
                          </p>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500">
                            vence {formatDate(b.due_date)}
                            {b.paid_at ? ` · pago em ${formatDate(b.paid_at)}` : ""}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                            {formatBRL(Number(b.amount))}
                          </p>
                          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", s.chip)}>
                            {s.label.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      {boletoEmAberto(b) && (
                        <div className="flex items-center gap-3 flex-wrap">
                          {b.pdf_url && (
                            <a
                              href={b.pdf_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] font-medium text-produmar-600 dark:text-produmar-400 flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              PDF do boleto
                            </a>
                          )}
                          {b.digitable_line && (
                            <button
                              type="button"
                              onClick={() => copiar(b.digitable_line!, `l${b.id}`)}
                              className="text-[11px] font-medium text-produmar-600 dark:text-produmar-400 flex items-center gap-1"
                            >
                              <Copy className="w-3 h-3" />
                              {copiado === `l${b.id}` ? "Copiado!" : "Copiar código"}
                            </button>
                          )}
                          {b.pix_emv && (
                            <button
                              type="button"
                              onClick={() => copiar(b.pix_emv!, `p${b.id}`)}
                              className="text-[11px] font-medium text-produmar-600 dark:text-produmar-400 flex items-center gap-1"
                            >
                              <Copy className="w-3 h-3" />
                              {copiado === `p${b.id}` ? "Copiado!" : "Copiar Pix"}
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  `Cancelar na Cora o boleto de ${nomeDoMes(b.competencia)}? O inquilino não vai mais conseguir pagar por ele.`
                                )
                              )
                                rodar(() => cancelarBoletoAluguel(b.id));
                            }}
                            className="text-[11px] font-medium text-red-600 dark:text-red-400 flex items-center gap-1 disabled:opacity-40"
                          >
                            <Ban className="w-3 h-3" />
                            Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Os boletos saem pela Cora com Pix, multa de {contrato.late_fee_percent ?? MULTA_PADRAO}% e juros de{" "}
              {contrato.interest_percent ?? JUROS_PADRAO}% ao mês depois do vencimento. Quando o inquilino paga, a baixa do mês
              acontece sozinha.
            </p>

            {erro && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                {erro}
              </p>
            )}
          </div>
        )}

        <DialogFooter className={cn(STICKY_FOOTER, "flex-wrap gap-2")}>
          {contrato && abertosFuturos > 0 && (
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                if (
                  confirm(
                    `Cancelar os ${abertosFuturos} boleto(s) que ainda não venceram e gerar de novo com o valor de hoje do contrato (${formatBRL(Number(contrato.monthly_amount))}, dia ${contrato.due_day})?`
                  )
                )
                  rodar(() => refazerBoletosDoContrato(contrato.id));
              }}
              className="h-11 sm:h-10"
            >
              <RefreshCw className="w-4 h-4" />
              Refazer os em aberto
            </Button>
          )}
          {contrato && semBoleto > 0 && contrato.status === "ativo" && (
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => rodar(() => gerarBoletosDoContrato(contrato.id))}
              className="h-11 sm:h-10"
            >
              <Sparkles className="w-4 h-4" />
              {isPending ? "Gerando..." : `Gerar os que faltam (${semBoleto})`}
            </Button>
          )}
          {contrato && emAberto > 0 && (
            <a
              href={`/imprimir/boletos/${contrato.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 h-11 sm:h-10 px-4 rounded-md bg-produmar-600 text-white text-sm font-medium hover:bg-produmar-700 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Imprimir carnê
            </a>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
