import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelarBoleto, consultarBoleto, criarBoleto } from "./cora/client";
import type { CoraInvoiceResponse } from "./cora/types";
import { tipoDocumento, validarCpfCnpj } from "./cpf-cnpj";
import {
  VALOR_MINIMO_BOLETO,
  boletoEmAberto,
  boletoValendo,
} from "./alugueis-boletos";
import { localDateISO, loanTotalDue } from "./utils";
import { JUROS_DA_DIVIDA, MULTA_DA_DIVIDA, tituloDoBoletoDaDivida } from "./devedores-boletos";
import type { Loan, LoanBoleto, LoanInstallment, LoanStatus } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// OS BOLETOS DA DÍVIDA NO BANCO (Cora) — migration 139
// ─────────────────────────────────────────────────────────────────────────────
// O mesmo caminho do boleto do aluguel:
//   1) "Gerar no sistema": um boleto por parcela em aberto (ou um com o saldo,
//      na dívida de pagamentos avulsos) — fica só aqui, dá para imprimir;
//   2) "Gerar no banco": depois de confirmar, registra na Cora (código de
//      barras + Pix);
//   3) pago no banco, a Cora avisa (webhook) ou a conferência ao abrir
//      Devedores pergunta — e a baixa entra sozinha: o pagamento em
//      loan_payments e a parcela PAGA.
// Como todo o módulo Devedores, NADA daqui encosta no caixa (transactions).

/** Só uma trava contra engano de digitação (ex.: 480 parcelas). */
const MAXIMO_DE_BOLETOS_DA_DIVIDA = 120;

export interface ResultadoBoletosDivida {
  gerados: number;
  aviso: string | null;
}

export function boletoDividaError(error: { code?: string; message: string }): string {
  if (error.code === "42P01" || error.code === "PGRST205")
    return "Rode a migration 139 no Supabase para gerar os boletos da dívida";
  return error.message;
}

async function lerDivida(supabase: SupabaseClient, loanId: string) {
  const { data } = await supabase.from("loans").select("*").eq("id", loanId).maybeSingle();
  return data as Loan | null;
}

/** "Gerar no sistema": cria os boletos que faltam, sem banco. */
export async function criarBoletosDaDividaNoSistema(
  supabase: SupabaseClient,
  loanId: string,
  userId: string
): Promise<ResultadoBoletosDivida> {
  const divida = await lerDivida(supabase, loanId);
  if (!divida) return { gerados: 0, aviso: "Dívida não encontrada" };
  if (divida.status === "cancelado") return { gerados: 0, aviso: "Dívida cancelada não gera boleto" };

  const [boletosRes, parcelasRes, pagosRes] = await Promise.all([
    supabase.from("loan_boletos").select("*").eq("loan_id", loanId),
    supabase.from("loan_installments").select("*").eq("loan_id", loanId).order("number"),
    supabase.from("loan_payments").select("amount").eq("loan_id", loanId),
  ]);
  if (boletosRes.error) return { gerados: 0, aviso: boletoDividaError(boletosRes.error) };

  const boletos = ((boletosRes.data as LoanBoleto[]) ?? []).filter(boletoValendo);
  const parcelas = (parcelasRes.data as LoanInstallment[]) ?? [];

  if (parcelas.length > 0) {
    // Boleto que não aponta mais para parcela nenhuma: o do total (a dívida
    // virou parcelada) ou de uma parcela que foi refeita. O que está só no
    // sistema é cancelado aqui — senão a cobrança sairia em dobro. O que já
    // está no banco não é mexido sem o dono ver: vira aviso.
    const orfaos = boletos.filter((b) => !b.installment_id && boletoEmAberto(b));
    const orfaosNoSistema = orfaos.filter((b) => b.cora_status === "SISTEMA");
    if (orfaosNoSistema.length > 0) {
      await supabase
        .from("loan_boletos")
        .update({ cora_status: "CANCELLED" })
        .in(
          "id",
          orfaosNoSistema.map((b) => b.id)
        );
    }
    const avisoOrfaos =
      orfaos.length > orfaosNoSistema.length
        ? `Há ${orfaos.length - orfaosNoSistema.length} boleto(s) antigo(s) no banco que não batem mais com as parcelas — cancele na tela da dívida.`
        : null;

    // um boleto por parcela em aberto que ainda não tem boleto valendo
    const cobertas = new Set(boletos.map((b) => b.installment_id).filter(Boolean));
    const faltam = parcelas.filter((p) => !p.paid && !cobertas.has(p.id));
    if (faltam.length === 0)
      return { gerados: 0, aviso: avisoOrfaos ?? "Toda parcela em aberto já tem boleto." };
    // Todas as parcelas de uma vez (dívida de 48 vezes = 48 boletos): o teto
    // de 36 do aluguel aqui deixava 12 para um segundo toque que ninguém via.
    const agora = faltam.slice(0, MAXIMO_DE_BOLETOS_DA_DIVIDA);
    const { error } = await supabase.from("loan_boletos").insert(
      agora.map((p) => ({
        loan_id: loanId,
        installment_id: p.id,
        numero: p.number,
        due_date: p.due_date,
        amount: Number(p.amount),
        cora_status: "SISTEMA",
        created_by: userId,
      }))
    );
    if (error) return { gerados: 0, aviso: boletoDividaError(error) };
    return { gerados: agora.length, aviso: avisoOrfaos };
  }

  // Pagamentos avulsos: um boleto só, com o saldo, no vencimento da dívida
  const pago = ((pagosRes.data as { amount: number }[]) ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const saldo = Math.round((loanTotalDue(divida) - pago) * 100) / 100;
  if (!(saldo > 0)) return { gerados: 0, aviso: "A dívida já está paga." };
  if (boletos.some((b) => boletoEmAberto(b)))
    return { gerados: 0, aviso: "Já tem boleto em aberto desta dívida — cancele ele para fazer outro." };
  if (!divida.due_date)
    return { gerados: 0, aviso: "Coloque o vencimento na dívida (Editar) para gerar o boleto." };

  const { error } = await supabase.from("loan_boletos").insert({
    loan_id: loanId,
    descricao: "SALDO DA DÍVIDA",
    due_date: divida.due_date,
    amount: saldo,
    cora_status: "SISTEMA",
    created_by: userId,
  });
  if (error) return { gerados: 0, aviso: boletoDividaError(error) };
  return { gerados: 1, aviso: null };
}

/**
 * "Gerar no banco": registra na Cora os boletos que estão só no sistema. `ids`
 * = quais (null = todos os da dívida). A Cora não aceita vencimento no
 * passado nem valor abaixo de R$ 5,00: esses ficam só no sistema.
 */
export async function registrarBoletosDaDividaNoBanco(
  supabase: SupabaseClient,
  loanId: string,
  ids: string[] | null
): Promise<ResultadoBoletosDivida> {
  const divida = await lerDivida(supabase, loanId);
  if (!divida) return { gerados: 0, aviso: "Dívida não encontrada" };

  const doc = divida.borrower_document ?? "";
  const tipo = tipoDocumento(doc);
  if (!tipo || !validarCpfCnpj(doc))
    return { gerados: 0, aviso: "Para gerar no banco, a dívida precisa do CPF (ou CNPJ) certo do devedor." };

  let q = supabase
    .from("loan_boletos")
    .select("*")
    .eq("loan_id", loanId)
    .eq("cora_status", "SISTEMA")
    .order("due_date");
  if (ids) q = q.in("id", ids);
  const { data, error } = await q;
  if (error) return { gerados: 0, aviso: boletoDividaError(error) };

  const hoje = localDateISO();
  const lista = (data as LoanBoleto[]) ?? [];
  const vencidos = lista.filter((b) => b.due_date < hoje);
  const baixos = lista.filter((b) => b.due_date >= hoje && Number(b.amount) < VALOR_MINIMO_BOLETO);
  const aRegistrar = lista.filter((b) => b.due_date >= hoje && Number(b.amount) >= VALOR_MINIMO_BOLETO);

  let gerados = 0;
  const falhas: string[] = [];

  async function registrar(b: LoanBoleto) {
    const titulo = tituloDoBoletoDaDivida(b, divida!.installments_count);
    const pedido = (code: string) =>
      criarBoleto({
        code,
        customer: {
          name: divida!.borrower_name.slice(0, 60),
          document: { identity: doc.replace(/\D/g, ""), type: tipo! },
        },
        services: [
          {
            name: `${titulo} - DÍVIDA Nº ${divida!.loan_number}`.toUpperCase().slice(0, 60),
            description: `${titulo} da dívida nº ${divida!.loan_number} - ${divida!.borrower_name}`.slice(0, 100),
            amount: Math.round(Number(b.amount) * 100),
          },
        ],
        payment_terms: {
          due_date: b.due_date,
          fine: { rate: MULTA_DA_DIVIDA },
          interest: { rate: JUROS_DA_DIVIDA },
        },
        payment_forms: ["BANK_SLIP", "PIX"],
      });

    let resposta: CoraInvoiceResponse;
    try {
      try {
        resposta = await pedido(b.id);
      } catch (e) {
        // código já usado numa tentativa que a Cora guardou e foi cancelada
        if (!/code|c[óo]digo/i.test((e as Error).message)) throw e;
        resposta = await pedido(`${b.id.slice(0, 8)}-${Date.now()}`);
      }
    } catch (e) {
      console.error("[devedores] boleto não saiu na Cora", b.id, (e as Error).message);
      falhas.push(`${titulo}: ${(e as Error).message}`);
      return;
    }

    const { error: erroGravar } = await supabase
      .from("loan_boletos")
      .update({
        cora_invoice_id: resposta.id,
        cora_status: resposta.status,
        digitable_line: resposta.payment_options?.bank_slip?.digitable ?? null,
        barcode: resposta.payment_options?.bank_slip?.barcode ?? null,
        pdf_url: resposta.payment_options?.bank_slip?.url ?? null,
        our_number: resposta.payment_options?.bank_slip?.our_number ?? null,
        pix_emv: resposta.pix?.emv ?? null,
      })
      .eq("id", b.id);
    if (erroGravar) {
      // não ficou guardado: cancela na Cora para não sobrar boleto solto
      try {
        await cancelarBoleto(resposta.id);
      } catch {}
      falhas.push(`${titulo}: ${boletoDividaError(erroGravar)}`);
      return;
    }
    gerados++;
  }

  // Um de cada vez: de 3 em 3 a Cora respondeu 429 (muitos pedidos) e, de 36
  // boletos, só 15 saíram. Mais devagar, mas sai tudo.
  for (const b of aRegistrar) await registrar(b);

  const avisos: string[] = [];
  if (falhas.length > 0) avisos.push(`${falhas.length} boleto(s) não saíram na Cora. Primeiro erro — ${falhas[0]}`);
  if (vencidos.length > 0)
    avisos.push(`${vencidos.length} com vencimento já passado ficaram só no sistema (o banco não registra boleto vencido).`);
  if (baixos.length > 0) avisos.push(`${baixos.length} abaixo de R$ 5,00 ficaram só no sistema (mínimo do banco).`);
  return { gerados, aviso: avisos.length > 0 ? avisos.join(" ") : null };
}

/** Cancela um boleto da dívida — na Cora, se já estava no banco. */
export async function cancelarBoletoDaDivida(
  supabase: SupabaseClient,
  id: string
): Promise<{ ok: true } | { error: string }> {
  const { data } = await supabase.from("loan_boletos").select("*").eq("id", id).maybeSingle();
  const b = data as LoanBoleto | null;
  if (!b) return { error: "Boleto não encontrado" };
  if (!boletoEmAberto(b)) return { error: "Esse boleto não está mais em aberto" };
  if (b.cora_invoice_id && b.cora_status !== "SISTEMA") {
    try {
      await cancelarBoleto(b.cora_invoice_id);
    } catch (e) {
      return { error: `Não consegui cancelar na Cora: ${(e as Error).message}` };
    }
  }
  const { error } = await supabase.from("loan_boletos").update({ cora_status: "CANCELLED" }).eq("id", id);
  if (error) return { error: boletoDividaError(error) };
  return { ok: true };
}

// ── A BAIXA: pago no banco vira pagamento da dívida ─────────────────────────

/** "2026-11-05T02:10:00Z" → o dia em São Paulo ("2026-11-04"). */
function diaEmSaoPaulo(iso: string | undefined | null): string | null {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Quitado / em aberto pelos pagamentos (não mexe em cancelado). */
async function recalcularSituacao(supabase: SupabaseClient, loanId: string) {
  const divida = await lerDivida(supabase, loanId);
  if (!divida || divida.status === "cancelado") return;
  const { data: pagamentos } = await supabase.from("loan_payments").select("amount").eq("loan_id", loanId);
  const pago = ((pagamentos as { amount: number }[]) ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const nova: LoanStatus = pago + 0.005 >= loanTotalDue(divida) ? "quitado" : "em_aberto";
  if (nova !== divida.status) await supabase.from("loans").update({ status: nova }).eq("id", loanId);
}

/**
 * Grava o que a Cora diz do boleto da dívida. Pago: o boleto fica PAGO, o
 * pagamento entra em loan_payments (com o valor que o banco recebeu — com
 * multa e juros, se pagou atrasado) e a parcela fica PAGA. A virada para PAGO
 * é condicional: se o webhook e a conferência chegarem juntos, só um cria o
 * pagamento.
 */
export async function aplicarStatusDaCoraNaDivida(
  supabase: SupabaseClient,
  boleto: LoanBoleto,
  invoice: CoraInvoiceResponse
): Promise<{ resultado: "baixado" | "atualizado" } | { erro: string }> {
  const pago = invoice.status === "PAID";
  if (!pago) {
    const { error } = await supabase
      .from("loan_boletos")
      .update({ cora_status: invoice.status })
      .eq("id", boleto.id)
      .neq("cora_status", "PAID");
    if (error) return { erro: error.message };
    return { resultado: "atualizado" };
  }

  const pagamento = invoice.payments?.[0];
  const paidAt =
    diaEmSaoPaulo(pagamento?.finalized_at) ??
    diaEmSaoPaulo(invoice.occurrence_date) ??
    diaEmSaoPaulo(new Date().toISOString())!;
  const paidAmount =
    (pagamento?.total_paid || invoice.total_paid || Math.round(Number(boleto.amount) * 100)) / 100;

  const { data: virou, error } = await supabase
    .from("loan_boletos")
    .update({ cora_status: "PAID", paid_at: paidAt, paid_amount: paidAmount })
    .eq("id", boleto.id)
    .neq("cora_status", "PAID")
    .select("id")
    .maybeSingle();
  if (error) return { erro: error.message };
  if (!virou) return { resultado: "atualizado" }; // outro caminho já deu a baixa

  const { data: pg, error: erroPagamento } = await supabase
    .from("loan_payments")
    .insert({
      loan_id: boleto.loan_id,
      installment_id: boleto.installment_id,
      amount: paidAmount,
      payment_date: paidAt,
      notes: `PAGO NO BANCO (CORA) · ${pagamento?.method === "PIX" ? "PIX" : "BOLETO"}`,
    })
    .select("id")
    .single();
  if (erroPagamento) return { erro: erroPagamento.message };

  await supabase.from("loan_boletos").update({ payment_id: pg.id }).eq("id", boleto.id);
  if (boleto.installment_id) {
    await supabase.from("loan_installments").update({ paid: true }).eq("id", boleto.installment_id);
  }
  await recalcularSituacao(supabase, boleto.loan_id);
  return { resultado: "baixado" };
}

/**
 * Confere na Cora os boletos de dívida em aberto no banco e dá a baixa dos que
 * já foram pagos — pega o pagamento cujo aviso (webhook) se perdeu. Só olha os
 * que vencem até 40 dias à frente.
 */
export async function conferirBoletosDasDividasNaCora(
  supabase: SupabaseClient
): Promise<{ conferidos: number; baixados: number; erros: string[] }> {
  const limite = new Date(Date.now() + 40 * 86400000).toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  const { data, error } = await supabase
    .from("loan_boletos")
    .select("*")
    .in("cora_status", ["OPEN", "LATE", "IN_PAYMENT", "DRAFT"])
    .not("cora_invoice_id", "is", null)
    .lte("due_date", limite)
    .order("due_date")
    .limit(60);
  if (error) return { conferidos: 0, baixados: 0, erros: [] }; // sem a 139, nada a conferir

  const lista = (data as LoanBoleto[]) ?? [];
  let baixados = 0;
  const erros: string[] = [];

  async function conferir(b: LoanBoleto) {
    try {
      const invoice = await consultarBoleto(b.cora_invoice_id!);
      const r = await aplicarStatusDaCoraNaDivida(supabase, b, invoice);
      if ("resultado" in r) {
        if (r.resultado === "baixado") baixados++;
      } else erros.push(r.erro);
    } catch (e) {
      erros.push((e as Error).message);
    }
  }

  for (let i = 0; i < lista.length; i += 5) {
    await Promise.all(lista.slice(i, i + 5).map(conferir));
  }
  return { conferidos: lista.length, baixados, erros };
}
