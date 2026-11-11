import type { SupabaseClient } from "@supabase/supabase-js";
import { consultarBoleto } from "./cora/client";
import type { CoraInvoiceResponse } from "./cora/types";
import type { RentalBoleto } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// O PAGAMENTO DO BOLETO DO ALUGUEL NO BANCO VIRA BAIXA NO SISTEMA
// ─────────────────────────────────────────────────────────────────────────────
// Dois caminhos chegam aqui, e os dois perguntam à própria Cora (nunca confiam
// em quem avisou):
//   1) o webhook da Cora, na hora em que o boleto muda de status;
//   2) a conferência ao abrir Aluguéis (e o botão "Conferir pagamentos no
//      banco") — pega o pagamento cujo aviso se perdeu no caminho.
// Pago: o boleto fica PAGO e o mês ganha a baixa em rental_payments, com o
// dia e o valor que o banco recebeu (com multa e juros, se pagou atrasado).
// Se alguém já deu a baixa à mão, a de quem lançou fica valendo.

type Boleto = Pick<RentalBoleto, "id" | "contract_id" | "competencia" | "due_date" | "amount" | "avulso">;

/** "2026-11-05T02:10:00Z" → o dia em São Paulo ("2026-11-04"). */
function diaEmSaoPaulo(iso: string | undefined | null): string | null {
  if (!iso) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/**
 * Grava o que a Cora diz do boleto. Devolve "baixado" quando deu a baixa do
 * mês agora, "atualizado" quando só mudou o status, ou o erro.
 */
export async function aplicarStatusDaCora(
  supabase: SupabaseClient,
  boleto: Boleto,
  invoice: CoraInvoiceResponse
): Promise<{ resultado: "baixado" | "atualizado"; erro?: undefined } | { erro: string }> {
  const pago = invoice.status === "PAID";
  const pagamento = invoice.payments?.[0];
  const paidAt = pago
    ? diaEmSaoPaulo(pagamento?.finalized_at) ??
      diaEmSaoPaulo(invoice.occurrence_date) ??
      diaEmSaoPaulo(new Date().toISOString())
    : null;
  const paidAmount = pago
    ? (pagamento?.total_paid || invoice.total_paid || Math.round(Number(boleto.amount) * 100)) / 100
    : null;

  const { error } = await supabase
    .from("rental_boletos")
    .update({
      cora_status: invoice.status,
      ...(pago ? { paid_at: paidAt, paid_amount: paidAmount } : {}),
    })
    .eq("id", boleto.id);
  if (error) return { erro: error.message };
  if (!pago) return { resultado: "atualizado" };
  // o avulso (entrada, caução) não é mês do aluguel: a baixa é o próprio
  // boleto ficar PAGO, com o dia e o valor — não mexe em rental_payments
  if (boleto.avulso) return { resultado: "baixado" };

  const { data: baixa } = await supabase
    .from("rental_payments")
    .select("id, paid_at")
    .eq("contract_id", boleto.contract_id)
    .eq("competencia", boleto.competencia)
    .maybeSingle();
  if (baixa?.paid_at) return { resultado: "atualizado" };

  const { error: baixaError } = await supabase.from("rental_payments").upsert(
    {
      contract_id: boleto.contract_id,
      competencia: boleto.competencia,
      due_date: boleto.due_date,
      amount: boleto.amount,
      paid_at: paidAt,
      paid_amount: paidAmount,
      method: pagamento?.method === "PIX" ? "PIX" : "BOLETO",
      notes: "BAIXA AUTOMÁTICA PELO BANCO (CORA)",
    },
    { onConflict: "contract_id,competencia" }
  );
  if (baixaError) return { erro: baixaError.message };
  return { resultado: "baixado" };
}

/**
 * Confere na Cora os boletos de aluguel em aberto no banco e dá a baixa dos
 * que já foram pagos. Só olha os que vencem até 40 dias à frente — quem paga
 * adiantado paga perto do vencimento, e assim a conta não pergunta à Cora
 * pelo contrato inteiro toda vez.
 */
export async function conferirBoletosNaCora(
  supabase: SupabaseClient
): Promise<{ conferidos: number; baixados: number; erros: string[] }> {
  const limite = new Date(Date.now() + 40 * 86400000).toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  const { data, error } = await supabase
    .from("rental_boletos")
    // "*": a coluna avulso (135) pode ainda não existir — pedir por nome quebraria
    .select("*")
    .in("cora_status", ["OPEN", "LATE", "IN_PAYMENT", "DRAFT"])
    .not("cora_invoice_id", "is", null)
    .lte("due_date", limite)
    .order("due_date")
    .limit(60);
  if (error) return { conferidos: 0, baixados: 0, erros: [] }; // sem a migration, nada a conferir

  const lista = (data as (Boleto & { cora_invoice_id: string })[]) ?? [];
  let baixados = 0;
  const erros: string[] = [];

  async function conferir(b: Boleto & { cora_invoice_id: string }) {
    try {
      const invoice = await consultarBoleto(b.cora_invoice_id);
      const r = await aplicarStatusDaCora(supabase, b, invoice);
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
