import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consultarBoleto } from "@/lib/cora/client";
import { aplicarStatusDaCora } from "@/lib/alugueis-baixa-cora";
import { aplicarStatusDaCoraNaDivida } from "@/lib/devedores-boletos-banco";
import type { LoanBoleto } from "@/lib/types";
import type { CoraInvoiceStatus } from "@/lib/cora/types";
import type { TransactionStatus } from "@/lib/types";

/**
 * Webhook da Cora: avisa quando um boleto muda de status (pago, vencido,
 * cancelado...).
 *
 * ┌─ SOBRE A SEGURANÇA DESTA ROTA ───────────────────────────────────────────┐
 * │ A notificação da Cora NÃO tem assinatura nem segredo — é só um POST com  │
 * │ headers (webhook-event-type, webhook-resource-id), sem corpo. Qualquer   │
 * │ um que descobrir esta URL pode forjar essa chamada.                      │
 * │                                                                          │
 * │ Por isso o header NUNCA decide o status de um lançamento sozinho: ele só │
 * │ diz "vai lá conferir o boleto X". Quem manda é a reconsulta autenticada  │
 * │ (com o certificado) na própria API da Cora, logo abaixo.                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const dynamic = "force-dynamic";

const STATUS_MAP: Record<CoraInvoiceStatus, TransactionStatus | null> = {
  DRAFT: null, // estado transitório da criação, nada a fazer
  OPEN: "pendente",
  IN_PAYMENT: "pendente",
  LATE: "vencido",
  PAID: "recebido",
  CANCELLED: "cancelado",
};

export async function POST(request: NextRequest) {
  const eventType = request.headers.get("webhook-event-type") ?? "";
  const eventId = request.headers.get("webhook-event-id");
  const resourceId = request.headers.get("webhook-resource-id");

  if (!eventType.startsWith("invoice.") || !resourceId) {
    return NextResponse.json({ ok: true });
  }

  const supabase = createAdminClient();

  // Idempotência: a Cora reenvia a notificação em caso de falha na entrega.
  if (eventId) {
    const { error: dedupeError } = await supabase
      .from("cora_webhook_events")
      .insert({ event_id: eventId });
    if (dedupeError) {
      if (dedupeError.code === "23505") {
        // já processamos este evento
        return NextResponse.json({ ok: true, dedup: true });
      }
      console.error("[webhook cora] falha ao registrar evento", eventId, dedupeError);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
  }

  const { data: transaction } = await supabase
    .from("transactions")
    .select("id")
    .eq("cora_invoice_id", resourceId)
    .maybeSingle();

  // Não é lançamento de Contas: pode ser o boleto de um aluguel.
  if (!transaction) return baixarBoletoDeAluguel(supabase, resourceId);

  let invoice;
  try {
    invoice = await consultarBoleto(resourceId);
  } catch (e) {
    console.error("[webhook cora] falha ao reconsultar boleto", resourceId, e);
    return NextResponse.json({ ok: false }, { status: 502 });
  }

  const status = STATUS_MAP[invoice.status];
  if (!status) return NextResponse.json({ ok: true });

  const paidDate = invoice.payments?.[0]?.finalized_at?.slice(0, 10) ?? invoice.occurrence_date;

  const { error } = await supabase
    .from("transactions")
    .update({
      status,
      cora_status: invoice.status,
      // Só grava data de baixa quando realmente foi paga — o "undefined" nos
      // outros casos faz o update ignorar a coluna, sem apagar o que já tinha.
      paid_date: status === "recebido" ? paidDate ?? new Date().toISOString().slice(0, 10) : undefined,
    })
    .eq("id", transaction.id);

  if (error) {
    console.error("[webhook cora] falha ao atualizar transação", transaction.id, error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * O boleto do aluguel (rental_boletos, migration 129). A Cora é reconsultada
 * e a baixa do mês é feita em lib/alugueis-baixa-cora (o mesmo código da
 * conferência ao abrir Aluguéis).
 */
async function baixarBoletoDeAluguel(supabase: ReturnType<typeof createAdminClient>, resourceId: string) {
  const { data: boleto } = await supabase
    .from("rental_boletos")
    // "*" traz o avulso (135) quando existe — o avulso pago não dá baixa em mês
    .select("*")
    .eq("cora_invoice_id", resourceId)
    .maybeSingle();

  // Não é do aluguel: pode ser o boleto de uma dívida (Devedores, migration 139).
  if (!boleto) return baixarBoletoDeDivida(supabase, resourceId);

  let invoice;
  try {
    invoice = await consultarBoleto(resourceId);
  } catch (e) {
    console.error("[webhook cora] falha ao reconsultar boleto do aluguel", resourceId, e);
    return NextResponse.json({ ok: false }, { status: 502 });
  }

  const r = await aplicarStatusDaCora(supabase, boleto, invoice);
  if (r.erro) {
    console.error("[webhook cora] falha ao dar baixa no aluguel", boleto.id, r.erro);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * O boleto de uma dívida (loan_boletos, migration 139). A Cora é reconsultada
 * e a baixa — o pagamento em loan_payments e a parcela paga — é feita em
 * lib/devedores-boletos-banco (o mesmo código da conferência ao abrir
 * Devedores). Nada vai para o caixa.
 */
async function baixarBoletoDeDivida(supabase: ReturnType<typeof createAdminClient>, resourceId: string) {
  const { data: boleto } = await supabase
    .from("loan_boletos")
    .select("*")
    .eq("cora_invoice_id", resourceId)
    .maybeSingle();

  // Não é um boleto nosso (ou o vínculo já foi removido) — nada a fazer.
  if (!boleto) return NextResponse.json({ ok: true });

  let invoice;
  try {
    invoice = await consultarBoleto(resourceId);
  } catch (e) {
    console.error("[webhook cora] falha ao reconsultar boleto da dívida", resourceId, e);
    return NextResponse.json({ ok: false }, { status: 502 });
  }

  const r = await aplicarStatusDaCoraNaDivida(supabase, boleto as LoanBoleto, invoice);
  if ("erro" in r) {
    console.error("[webhook cora] falha ao dar baixa na dívida", boleto.id, r.erro);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
