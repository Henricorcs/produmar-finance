import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consultarBoleto } from "@/lib/cora/client";
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
 * O boleto do aluguel (rental_boletos, migration 129). Atualiza o status e,
 * quando foi pago, dá a baixa do mês em rental_payments — menos se alguém já
 * deu a baixa à mão (aí a baixa de quem lançou manda).
 */
async function baixarBoletoDeAluguel(supabase: ReturnType<typeof createAdminClient>, resourceId: string) {
  const { data: boleto } = await supabase
    .from("rental_boletos")
    .select("id, contract_id, competencia, due_date, amount")
    .eq("cora_invoice_id", resourceId)
    .maybeSingle();

  // Não é um boleto nosso (ou o vínculo já foi removido) — nada a fazer.
  if (!boleto) return NextResponse.json({ ok: true });

  let invoice;
  try {
    invoice = await consultarBoleto(resourceId);
  } catch (e) {
    console.error("[webhook cora] falha ao reconsultar boleto do aluguel", resourceId, e);
    return NextResponse.json({ ok: false }, { status: 502 });
  }

  const pago = invoice.status === "PAID";
  const pagamento = invoice.payments?.[0];
  const paidAt = pago
    ? pagamento?.finalized_at?.slice(0, 10) ?? invoice.occurrence_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10)
    : null;
  const paidAmount = pago ? (invoice.total_paid || Math.round(Number(boleto.amount) * 100)) / 100 : null;

  const { error } = await supabase
    .from("rental_boletos")
    .update({
      cora_status: invoice.status,
      ...(pago ? { paid_at: paidAt, paid_amount: paidAmount } : {}),
    })
    .eq("id", boleto.id);
  if (error) {
    console.error("[webhook cora] falha ao atualizar boleto do aluguel", boleto.id, error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  if (pago) {
    const { data: baixa } = await supabase
      .from("rental_payments")
      .select("id, paid_at")
      .eq("contract_id", boleto.contract_id)
      .eq("competencia", boleto.competencia)
      .maybeSingle();
    if (!baixa?.paid_at) {
      const { error: baixaError } = await supabase.from("rental_payments").upsert(
        {
          contract_id: boleto.contract_id,
          competencia: boleto.competencia,
          due_date: boleto.due_date,
          amount: boleto.amount,
          paid_at: paidAt,
          paid_amount: paidAmount,
          method: pagamento?.method === "PIX" ? "PIX" : "BOLETO",
          notes: "BAIXA AUTOMÁTICA PELA CORA",
        },
        { onConflict: "contract_id,competencia" }
      );
      if (baixaError) {
        console.error("[webhook cora] falha ao dar baixa no aluguel", boleto.id, baixaError);
        return NextResponse.json({ ok: false }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
