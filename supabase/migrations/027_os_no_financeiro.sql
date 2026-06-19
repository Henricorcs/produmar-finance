-- ============================================================================
-- ILNET Finance — OS contabilizadas direto nas finanças (sem aparecer em Contas)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Conceito:
--   • O valor de uma OS finalizada (receita do cliente + custos internos como
--     combustível) passa a virar lançamento em `transactions` AUTOMATICAMENTE,
--     já realizado (recebido/pago), pra somar no saldo e nos totais do mês.
--   • Esses lançamentos ficam marcados com `service_order_id`. A aba Contas e o
--     Visualizador filtram `service_order_id IS NULL` — ou seja, eles CONTAM nas
--     finanças (views do dashboard somam tudo) mas NÃO aparecem na lista de Contas.
--   • Apagar a OS remove os lançamentos (ON DELETE CASCADE). A app recria os
--     lançamentos ao finalizar/editar/mudar status da OS (syncServiceOrderFinance).
-- ============================================================================

-- ── Coluna de vínculo OS → lançamento ───────────────────────────────────────
alter table public.transactions
  add column if not exists service_order_id uuid
    references public.service_orders(id) on delete cascade;

create index if not exists idx_transactions_service_order
  on public.transactions(service_order_id);

-- ── Backfill das OS já finalizadas (idempotente) ────────────────────────────
-- Recria do zero os lançamentos automáticos (os manuais antigos, ligados via
-- service_orders.transaction_id, são preservados e NÃO são reprocessados).
delete from public.transactions where service_order_id is not null;

-- Valor principal: cliente = receita (entrada/recebido); interno = custo (saida/pago).
insert into public.transactions
  (type, description, amount, due_date, paid_date, status, service_order_id, created_by)
select
  case when so.freight_type = 'cliente' then 'entrada'::transaction_type
       else 'saida'::transaction_type end,
  'OS #' || so.order_number || ' - ' ||
    coalesce(nullif(so.client_name, ''), nullif(so.service_description, ''), 'Consumo interno'),
  so.total_amount,
  coalesce(so.delivery_date, so.issue_date),
  coalesce(so.delivery_date, so.issue_date),
  case when so.freight_type = 'cliente' then 'recebido'::transaction_status
       else 'pago'::transaction_status end,
  so.id,
  so.created_by
from public.service_orders so
where so.status = 'entregue'
  and so.transaction_id is null
  and so.total_amount > 0;

-- Custos internos (combustível + gasto no serviço) → sempre despesa (saida/pago).
insert into public.transactions
  (type, description, amount, due_date, paid_date, status, service_order_id, created_by)
select
  'saida'::transaction_type,
  'OS #' || so.order_number || ' - Custos internos',
  coalesce(so.service_cost, 0) + coalesce(so.fuel_cost, 0),
  coalesce(so.delivery_date, so.issue_date),
  coalesce(so.delivery_date, so.issue_date),
  'pago'::transaction_status,
  so.id,
  so.created_by
from public.service_orders so
where so.status = 'entregue'
  and so.transaction_id is null
  and (coalesce(so.service_cost, 0) + coalesce(so.fuel_cost, 0)) > 0;
