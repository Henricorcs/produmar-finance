"use client";

import { useState, useTransition } from "react";
import { Copy, FileText, Landmark, Printer, Receipt, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  gerarBoletoDaDividaNoBanco,
  gerarBoletosDaDivida,
  cancelarBoletoDivida,
} from "@/app/(app)/devedores/actions";
import { boletoEmAberto, boletoNoBanco, boletoValendo, situacaoDoBoleto } from "@/lib/alugueis-boletos";
import { tituloDoBoletoDaDivida } from "@/lib/devedores-boletos";
import { cn, formatBRL, formatDate } from "@/lib/utils";
import type { LoanWithDetails } from "@/app/(app)/devedores/page";

/**
 * OS BOLETOS DA DÍVIDA — do mesmo jeito dos boletos do aluguel:
 *   "Gerar no sistema" → um boleto por parcela em aberto (ou um com o saldo);
 *   "Gerar no banco"   → depois de confirmar, registra na Cora (código de
 *                        barras + Pix). Pago no banco, a baixa entra sozinha.
 * Os cancelados ficam escondidos — só fazem volume.
 */
export function LoanBoletos({ loan }: { loan: LoanWithDetails }) {
  const [isPending, startTransition] = useTransition();
  const [acao, setAcao] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  const boletos = (loan.loan_boletos ?? [])
    .filter(boletoValendo)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const soNoSistema = boletos.filter((b) => b.cora_status === "SISTEMA");
  const emAberto = boletos.filter(boletoEmAberto);
  const parcelasSemBoleto = loan.loan_installments.filter(
    (p) => !p.paid && !boletos.some((b) => b.installment_id === p.id)
  ).length;
  const podeGerarNoSistema =
    loan.status !== "cancelado" &&
    (loan.loan_installments.length > 0 ? parcelasSemBoleto > 0 : emAberto.length === 0 && loan.status !== "quitado");
  const totalParcelas = loan.installments_count ?? loan.loan_installments.length;

  function rodar(chave: string, fn: () => Promise<{ error?: string; gerados?: number; aviso?: string | null } | { ok: true } | undefined>) {
    setMensagem(null);
    setAcao(chave);
    startTransition(async () => {
      const r = (await fn()) as { error?: string; gerados?: number; aviso?: string | null } | undefined;
      setAcao(null);
      if (r && r.error) return setMensagem({ tipo: "erro", texto: r.error });
      if (r && r.aviso) return setMensagem({ tipo: "erro", texto: r.aviso });
      if (r && typeof r.gerados === "number")
        setMensagem({ tipo: "ok", texto: `${r.gerados} boleto(s) gerado(s).` });
    });
  }

  async function copiar(texto: string, chave: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(chave);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setMensagem({ tipo: "erro", texto: "Não consegui copiar — segure no texto para copiar." });
    }
  }

  const link =
    "inline-flex items-center gap-1 text-[11px] font-medium text-produmar-700 dark:text-produmar-400 hover:underline min-h-[32px] disabled:opacity-50";

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
        <Receipt className="w-3.5 h-3.5" />
        Boletos
      </p>

      {boletos.length > 0 ? (
        <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-100 dark:border-slate-800">
          {boletos.map((b) => {
            const sit = situacaoDoBoleto(b);
            const aberto = boletoEmAberto(b);
            return (
              <div key={b.id} className="px-3 py-2 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                      {tituloDoBoletoDaDivida(b, totalParcelas)}
                    </p>
                    <p className="text-[11px] text-slate-400 tabular-nums">
                      venc. {formatDate(b.due_date)} · {formatBRL(Number(b.amount))}
                      {b.paid_at
                        ? ` · pago ${formatDate(b.paid_at)}${b.paid_amount ? ` (${formatBRL(Number(b.paid_amount))})` : ""}`
                        : ""}
                    </p>
                  </div>
                  <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0", sit.chip)}>
                    {sit.label}
                  </span>
                </div>
                {aberto && (
                  <div className="flex flex-wrap gap-x-3">
                    <a href={`/imprimir/devedores/${loan.id}?b=${b.id}`} target="_blank" rel="noreferrer" className={link}>
                      <Printer className="w-3.5 h-3.5" />
                      Imprimir
                    </a>
                    {b.cora_status === "SISTEMA" && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => {
                          if (
                            !confirm(
                              `Gerar no banco (Cora) o boleto de ${tituloDoBoletoDaDivida(b, totalParcelas)}, ${formatBRL(Number(b.amount))}? Ele passa a ter código de barras e Pix.`
                            )
                          )
                            return;
                          rodar(`b${b.id}`, () => gerarBoletoDaDividaNoBanco(loan.id, b.id));
                        }}
                        className={link}
                      >
                        <Landmark className="w-3.5 h-3.5" />
                        {acao === `b${b.id}` ? "Gerando no banco..." : "Gerar no banco"}
                      </button>
                    )}
                    {boletoNoBanco(b) && b.pdf_url && (
                      <a href={b.pdf_url} target="_blank" rel="noreferrer" className={link}>
                        <FileText className="w-3.5 h-3.5" />
                        PDF do banco
                      </a>
                    )}
                    {b.digitable_line && (
                      <button type="button" onClick={() => copiar(b.digitable_line!, `l${b.id}`)} className={link}>
                        <Copy className="w-3.5 h-3.5" />
                        {copiado === `l${b.id}` ? "Copiado!" : "Copiar linha"}
                      </button>
                    )}
                    {b.pix_emv && (
                      <button type="button" onClick={() => copiar(b.pix_emv!, `p${b.id}`)} className={link}>
                        <Copy className="w-3.5 h-3.5" />
                        {copiado === `p${b.id}` ? "Copiado!" : "Copiar Pix"}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        if (
                          !confirm(
                            boletoNoBanco(b)
                              ? "Cancelar este boleto? Ele é cancelado no banco também e não pode mais ser pago."
                              : "Cancelar este boleto?"
                          )
                        )
                          return;
                        rodar(`c${b.id}`, () => cancelarBoletoDivida(b.id));
                      }}
                      className={cn(link, "text-slate-500 dark:text-slate-400")}
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      {acao === `c${b.id}` ? "Cancelando..." : "Cancelar"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Nenhum boleto ainda.{" "}
          {loan.loan_installments.length > 0
            ? "Gere no sistema um boleto para cada parcela em aberto."
            : "Gere no sistema um boleto com o saldo da dívida, no vencimento dela."}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {podeGerarNoSistema && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => rodar("sistema", () => gerarBoletosDaDivida(loan.id))}
          >
            {acao === "sistema"
              ? "Gerando..."
              : loan.loan_installments.length > 0
                ? `Gerar no sistema (${parcelasSemBoleto})`
                : "Gerar no sistema"}
          </Button>
        )}
        {soNoSistema.length > 0 && (
          <Button
            type="button"
            size="sm"
            disabled={isPending}
            onClick={() => {
              if (
                !confirm(
                  `Gerar no banco (Cora) os ${soNoSistema.length} boleto(s) que estão só no sistema? Cada um passa a ter código de barras e Pix.`
                )
              )
                return;
              rodar("banco", () => gerarBoletoDaDividaNoBanco(loan.id, null));
            }}
          >
            <Landmark className="w-3.5 h-3.5 mr-1" />
            {acao === "banco" ? "Gerando no banco..." : `Gerar no banco (${soNoSistema.length})`}
          </Button>
        )}
        {emAberto.length > 0 && (
          <a
            href={`/imprimir/devedores/${loan.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Printer className="w-3.5 h-3.5" />
            Imprimir carnê
          </a>
        )}
      </div>

      {mensagem && (
        <p
          className={cn(
            "text-xs px-3 py-2 rounded-lg border",
            mensagem.tipo === "ok"
              ? "text-emerald-700 bg-emerald-50 border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-400"
              : "text-amber-800 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-300"
          )}
        >
          {mensagem.texto}
        </p>
      )}

      {soNoSistema.length > 0 && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          &quot;Só no sistema&quot; ainda não está no banco: dá para imprimir e cobrar. Para ter código de
          barras e Pix, toque em Gerar no banco — precisa do CPF (ou CNPJ) certo do devedor.
        </p>
      )}
    </div>
  );
}
