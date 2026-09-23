-- Integração com a Cora: emissão de boleto direto do sistema e conciliação
-- automática de pagamento via webhook.
--
-- cora_status guarda o status BRUTO devolvido pela Cora (OPEN/LATE/PAID/
-- CANCELLED/DRAFT), só para depuração — quem manda no lançamento continua
-- sendo o `transactions.status` de sempre (pendente/vencido/recebido/...).

alter table public.transactions
  add column if not exists cora_invoice_id text unique,
  add column if not exists cora_status text,
  add column if not exists boleto_digitable_line text,
  add column if not exists boleto_barcode text,
  add column if not exists boleto_url text,
  add column if not exists boleto_our_number text,
  add column if not exists pix_emv text;

-- Dedupe das notificações do webhook: a Cora reenvia em caso de falha, e o
-- webhook dela não tem assinatura — o event_id é a única forma de saber que
-- já processamos aquele aviso.
create table if not exists public.cora_webhook_events (
  event_id text primary key,
  received_at timestamptz not null default now()
);

alter table public.cora_webhook_events enable row level security;
-- Sem policy de select/insert para authenticated: só o service-role (usado
-- pela rota do webhook, que não tem sessão de usuário) grava aqui.
