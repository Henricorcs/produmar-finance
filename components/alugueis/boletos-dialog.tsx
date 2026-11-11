"use client";

import { useState, useTransition } from "react";
import {
  Ban,
  Copy,
  ExternalLink,
  FilePlus2,
  Landmark,
  Printer,
  Receipt,
  RefreshCw,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CompartilharPdf } from "@/components/ui/compartilhar-pdf";
import { dadosDoCarne, gerarCarnePdf } from "@/lib/carne-pdf";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { actionError } from "@/lib/action-result";
import { cn, formatBRL, formatBRLInput, formatDate, localDateISO, parseMoney } from "@/lib/utils";
import {
  DESCRICOES_AVULSO,
  JUROS_PADRAO,
  MULTA_PADRAO,
  VALOR_MINIMO_BOLETO,
  boletoAvulso,
  boletoEmAberto,
  boletoNoBanco,
  mesesParaGerar,
  situacaoDoBoleto,
  tituloDoBoleto,
} from "@/lib/alugueis-boletos";
import {
  cancelarBoletoAluguel,
  gerarBoletoAvulso,
  gerarBoletoNoBanco,
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
 * OS BOLETOS DO CONTRATO — um por mês.
 *
 * Eles nascem SÓ NO SISTEMA: saem no carnê para pagar direto à PRODUMAR. Se
 * precisar, "Gerar no banco" registra o boleto na Cora (com código de barras
 * e Pix) — um de cada vez ou todos — e aí a baixa do mês entra sozinha quando
 * o inquilino paga.
 */
export function BoletosDialog({ contrato, boletos, mensagem, pendente = false, onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const [acao, setAcao] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  /** Qual ação deu o erro ("b<id>" = gerar no banco aquele boleto). */
  const [erroDe, setErroDe] = useState<string | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);
  /** Qual PDF está sendo preparado para compartilhar: "carne" ou o id do boleto. */
  const [pdfDe, setPdfDe] = useState<string | null>(null);

  // ── o boleto avulso (entrada, caução...) ──
  const [avulsoAberto, setAvulsoAberto] = useState(false);
  const [avDescricao, setAvDescricao] = useState("");
  const [avValor, setAvValor] = useState("");
  const [avVencimento, setAvVencimento] = useState("");
  const [avNoBanco, setAvNoBanco] = useState(false);

  const hoje = localDateISO();
  const lista = [...boletos].sort((a, b) => a.due_date.localeCompare(b.due_date));
  /** Só as mensalidades: o avulso não entra no carnê nem ocupa a vaga do mês. */
  const doCarne = lista.filter((b) => !boletoAvulso(b));
  const comBoleto = new Set(doCarne.map((b) => b.competencia));
  const semBoleto = contrato ? mesesParaGerar(contrato, hoje).filter((m) => !comBoleto.has(m.competencia)).length : 0;
  const abertosFuturos = doCarne.filter((b) => boletoEmAberto(b) && b.due_date >= hoje).length;
  const emAberto = doCarne.filter(boletoEmAberto).length;
  /** Só no sistema e ainda dá para mandar ao banco (não venceu, valor mínimo). */
  const podeIrAoBanco = (b: RentalBoleto) =>
    b.cora_status === "SISTEMA" && b.due_date >= hoje && Number(b.amount) >= VALOR_MINIMO_BOLETO;
  const paraOBanco = lista.filter(podeIrAoBanco).length;

  function fechar() {
    setErro(null);
    setRecado(null);
    setPdfDe(null);
    setAvulsoAberto(false);
    onClose();
  }

  function abrirAvulso() {
    setErro(null);
    setRecado(null);
    setAvDescricao("");
    setAvValor("");
    setAvVencimento(hoje);
    setAvNoBanco(false);
    setAvulsoAberto(true);
  }

  const avValorNum = parseMoney(avValor);
  /** O que impede o avulso de ir ao banco agora (null = pode). */
  const bancoBarrado =
    avVencimento && avVencimento < hoje
      ? "O banco não registra boleto com vencimento no passado."
      : avValorNum > 0 && avValorNum < VALOR_MINIMO_BOLETO
        ? "O banco não registra boleto abaixo de R$ 5,00."
        : null;

  function salvarAvulso() {
    if (!contrato) return;
    // o erro do avulso aparece no topo, logo abaixo do formulário
    const falhou = (m: string) => {
      setErro(m);
      setErroDe("avulso");
    };
    const descricao = avDescricao.trim();
    if (!descricao) return falhou("Escreva o que o boleto cobra (ENTRADA, CAUÇÃO...).");
    if (!(avValorNum > 0)) return falhou("Informe o valor do boleto.");
    if (!avVencimento) return falhou("Informe o vencimento.");
    const noBanco = avNoBanco && !bancoBarrado;
    setErro(null);
    setErroDe(null);
    setRecado(null);
    setAcao("avulso");
    startTransition(async () => {
      let r: Awaited<ReturnType<typeof gerarBoletoAvulso>>;
      try {
        r = await gerarBoletoAvulso({
          contract_id: contrato.id,
          descricao,
          amount: avValorNum,
          due_date: avVencimento,
          no_banco: noBanco,
        });
      } catch (e) {
        setAcao(null);
        falhou(`Não deu certo: ${(e as Error)?.message || "falha de conexão"}. Tente de novo.`);
        return;
      }
      setAcao(null);
      const falha = actionError(r);
      if (falha || !("id" in r) || !r.id) {
        falhou(falha ?? "O boleto não foi gerado.");
        return;
      }
      setAvulsoAberto(false);
      setPdfDe(r.id);
      setRecado(
        r.aviso ??
          `Boleto avulso de ${descricao.toUpperCase()} gerado ${r.noBanco ? "no banco" : "só no sistema"}. Use "Imprimir" ou "Compartilhar" nele, na lista.`
      );
    });
  }

  /** O carnê leva só as mensalidades em aberto. */
  const abertos = doCarne.filter(boletoEmAberto);

  /** Roda a ação; `onde` é para o recado ("gerado no banco"). */
  function rodar(chave: string, onde: string, fazer: () => Promise<unknown>) {
    setErro(null);
    setErroDe(null);
    setRecado(null);
    setAcao(chave);
    startTransition(async () => {
      let r: unknown;
      try {
        r = await fazer();
      } catch (e) {
        r = { error: `Não deu certo: ${(e as Error)?.message || "falha de conexão"}. Tente de novo.` };
      }
      setAcao(null);
      const falha = actionError(r);
      if (falha) {
        // aparece na própria linha do boleto (e no topo): no celular o fim
        // da caixa fica fora da tela e parecia que o botão não fazia nada
        setErro(falha);
        setErroDe(chave);
        return;
      }
      if (r && typeof r === "object" && "gerados" in r) {
        const { gerados, aviso } = r as { gerados: number; aviso: string | null };
        const feito =
          gerados > 0 ? `${gerados} boleto${gerados === 1 ? "" : "s"} gerado${gerados === 1 ? "" : "s"} ${onde}.` : "";
        setRecado([feito, aviso].filter(Boolean).join(" ") || "Nenhum boleto novo para gerar.");
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
  const link = "text-[11px] font-medium text-produmar-600 dark:text-produmar-400 flex items-center gap-1 disabled:opacity-40";

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

            {!pendente &&
              (avulsoAberto ? (
                <div className="rounded-xl border border-violet-200 dark:border-violet-900/50 bg-violet-50/50 dark:bg-violet-950/20 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Boleto avulso</p>
                    <button
                      type="button"
                      onClick={() => setAvulsoAberto(false)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label="Fechar o boleto avulso"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 -mt-2">
                    Entrada, caução ou outra cobrança fora das mensalidades. Fica na lista marcado como AVULSO e não
                    entra no carnê.
                  </p>

                  <div className="space-y-1.5">
                    <Label htmlFor="av_desc">O que cobra *</Label>
                    <div className="flex gap-1.5 flex-wrap">
                      {DESCRICOES_AVULSO.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setAvDescricao(d)}
                          className={cn(
                            "px-3 py-1 rounded-full text-xs font-medium border transition-colors",
                            avDescricao.trim().toUpperCase() === d
                              ? "bg-produmar-600 border-produmar-600 text-white"
                              : "bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
                          )}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    <Input
                      id="av_desc"
                      value={avDescricao}
                      onChange={(e) => setAvDescricao(e.target.value.toUpperCase())}
                      placeholder="ou escreva (ex.: SEGUNDA PARCELA DA CAUÇÃO)"
                      maxLength={60}
                      className="h-11 sm:h-10 uppercase"
                      autoComplete="off"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="av_valor">Valor (R$) *</Label>
                      <Input
                        id="av_valor"
                        value={avValor}
                        onChange={(e) => setAvValor(formatBRLInput(e.target.value))}
                        placeholder="0,00"
                        inputMode="decimal"
                        autoComplete="off"
                        className="h-11 sm:h-10 tabular-nums font-semibold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="av_venc">Vencimento *</Label>
                      <Input
                        id="av_venc"
                        type="date"
                        value={avVencimento}
                        onChange={(e) => setAvVencimento(e.target.value)}
                        className="h-11 sm:h-10 tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Onde gerar</Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { v: false, label: "Só no sistema", sub: "recibo, paga direto" },
                        { v: true, label: "No banco (Cora)", sub: "código de barras e Pix" },
                      ].map((o) => (
                        <button
                          key={o.label}
                          type="button"
                          disabled={o.v && !!bancoBarrado}
                          onClick={() => setAvNoBanco(o.v)}
                          className={cn(
                            "rounded-lg border px-2 py-1.5 text-left transition-colors disabled:opacity-40",
                            avNoBanco === o.v && !(o.v && bancoBarrado)
                              ? "border-produmar-500 bg-produmar-50 dark:bg-produmar-900/30 dark:border-produmar-700"
                              : "border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700"
                          )}
                        >
                          <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">
                            {o.label}
                          </span>
                          <span className="block text-[10px] text-slate-500 dark:text-slate-400">{o.sub}</span>
                        </button>
                      ))}
                    </div>
                    {avNoBanco && bancoBarrado && (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400">{bancoBarrado} Vai só no sistema.</p>
                    )}
                    {avNoBanco && !bancoBarrado && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Pago no banco, ele fica PAGO sozinho (não dá baixa em mês do aluguel).
                      </p>
                    )}
                  </div>

                  <Button
                    type="button"
                    disabled={isPending}
                    onClick={salvarAvulso}
                    className="w-full h-11 sm:h-10"
                  >
                    <FilePlus2 className="w-4 h-4" />
                    {acao === "avulso"
                      ? avNoBanco && !bancoBarrado
                        ? "Gerando no banco..."
                        : "Gerando..."
                      : `Gerar boleto avulso${avValorNum > 0 ? ` de ${formatBRL(avValorNum)}` : ""}`}
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={abrirAvulso}
                  className="w-full h-10 rounded-md border border-dashed border-violet-300 text-violet-700 dark:border-violet-800 dark:text-violet-300 text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-violet-50 dark:hover:bg-violet-950/30"
                >
                  <FilePlus2 className="w-4 h-4" />
                  Boleto avulso (entrada, caução...)
                </button>
              ))}

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

            {erro && erroDe && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
                {erro}
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
                  const banco = boletoNoBanco(b);
                  const avulso = boletoAvulso(b);
                  return (
                    <div
                      key={b.id}
                      className={cn(
                        "px-3 py-2.5 space-y-1",
                        avulso ? "bg-violet-50/60 dark:bg-violet-950/20" : "bg-white dark:bg-slate-900"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 flex items-center gap-1.5 min-w-0">
                            {avulso && (
                              <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                                AVULSO
                              </span>
                            )}
                            <span className={cn("truncate", !avulso && "capitalize")}>{tituloDoBoleto(b)}</span>
                          </p>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500">
                            vence {formatDate(b.due_date)}
                            {banco ? " · no banco" : ""}
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
                          {pdfDe === b.id ? (
                            <CompartilharPdf
                              variante="link"
                              chave={`${b.id}|${b.cora_status}|${b.amount}|${b.due_date}`}
                              gerar={() => gerarCarnePdf(dadosDoCarne(contrato, [b]))}
                            />
                          ) : (
                            <button type="button" onClick={() => setPdfDe(b.id)} className={link}>
                              <Share2 className="w-3 h-3" />
                              Compartilhar
                            </button>
                          )}
                          {avulso && (
                            <a
                              href={`/imprimir/boletos/${contrato.id}?b=${b.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className={link}
                            >
                              <Printer className="w-3 h-3" />
                              Imprimir
                            </a>
                          )}
                          {podeIrAoBanco(b) && (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => {
                                if (
                                  confirm(
                                    `Gerar no banco (Cora) o boleto de ${tituloDoBoleto(b)}, ${formatBRL(Number(b.amount))}? Ele passa a ter código de barras e Pix.`
                                  )
                                )
                                  rodar(`b${b.id}`, "no banco", () => gerarBoletoNoBanco(contrato.id, b.id));
                              }}
                              className={link}
                            >
                              <Landmark className="w-3 h-3" />
                              {acao === `b${b.id}` ? "Gerando no banco..." : "Gerar no banco"}
                            </button>
                          )}
                          {b.pdf_url && (
                            <a href={b.pdf_url} target="_blank" rel="noreferrer" className={link}>
                              <ExternalLink className="w-3 h-3" />
                              PDF do boleto
                            </a>
                          )}
                          {b.digitable_line && (
                            <button type="button" onClick={() => copiar(b.digitable_line!, `l${b.id}`)} className={link}>
                              <Copy className="w-3 h-3" />
                              {copiado === `l${b.id}` ? "Copiado!" : "Copiar código"}
                            </button>
                          )}
                          {b.pix_emv && (
                            <button type="button" onClick={() => copiar(b.pix_emv!, `p${b.id}`)} className={link}>
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
                                  banco
                                    ? `Cancelar no banco o boleto de ${tituloDoBoleto(b)}? O inquilino não vai mais conseguir pagar por ele.`
                                    : `Cancelar o boleto de ${tituloDoBoleto(b)}?`
                                )
                              )
                                rodar(`c${b.id}`, "", () => cancelarBoletoAluguel(b.id));
                            }}
                            className="text-[11px] font-medium text-red-600 dark:text-red-400 flex items-center gap-1 disabled:opacity-40"
                          >
                            <Ban className="w-3 h-3" />
                            Cancelar
                          </button>
                        </div>
                      )}
                      {erro && (erroDe === `b${b.id}` || erroDe === `c${b.id}`) && (
                        <p className="text-[11px] font-medium text-red-600 dark:text-red-400">{erro}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Os boletos nascem só no sistema e saem no carnê para pagar direto à PRODUMAR. &quot;Gerar no
              banco&quot; registra na Cora, com código de barras, Pix, multa de{" "}
              {contrato.late_fee_percent ?? MULTA_PADRAO}% e juros de {contrato.interest_percent ?? JUROS_PADRAO}% ao
              mês — e aí a baixa do mês entra sozinha quando o inquilino paga.
            </p>

            {abertos.length > 0 &&
              (pdfDe === "carne" ? (
                <CompartilharPdf
                  variante="bloco"
                  chave={abertos.map((b) => `${b.id}|${b.cora_status}|${b.amount}|${b.due_date}`).join(",")}
                  gerar={() => gerarCarnePdf(dadosDoCarne(contrato, abertos))}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setPdfDe("carne")}
                  className="w-full h-11 rounded-md border border-produmar-200 text-produmar-700 dark:border-produmar-800 dark:text-produmar-300 text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-produmar-50 dark:hover:bg-produmar-900/20"
                >
                  <Share2 className="w-4 h-4" />
                  Compartilhar o carnê em PDF ({abertos.length} boleto{abertos.length === 1 ? "" : "s"})
                </button>
              ))}

            {erro && !erroDe && (
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
                    `Cancelar os ${abertosFuturos} boleto(s) que ainda não venceram e gerar de novo com o valor de hoje do contrato (${formatBRL(Number(contrato.monthly_amount))}, dia ${contrato.due_day})? Os que estavam no banco voltam para o banco.`
                  )
                )
                  rodar("refazer", "", () => refazerBoletosDoContrato(contrato.id));
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
              onClick={() => rodar("sistema", "no sistema", () => gerarBoletosDoContrato(contrato.id))}
              className="h-11 sm:h-10"
            >
              <Sparkles className="w-4 h-4" />
              {acao === "sistema" ? "Gerando..." : `Gerar no sistema (${semBoleto})`}
            </Button>
          )}
          {contrato && paraOBanco > 0 && (
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                if (
                  confirm(
                    `Gerar no banco (Cora) os ${paraOBanco} boleto(s) que estão só no sistema? Cada um passa a ter código de barras e Pix.`
                  )
                )
                  rodar("banco", "no banco", () => gerarBoletoNoBanco(contrato.id, null));
              }}
              className="h-11 sm:h-10"
            >
              <Landmark className="w-4 h-4" />
              {acao === "banco" ? "Gerando no banco..." : `Gerar todos no banco (${paraOBanco})`}
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
