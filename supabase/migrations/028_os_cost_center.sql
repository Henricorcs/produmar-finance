-- ============================================================================
-- ILNET Finance — Centro de custo "Ordens de Serviço" para os lançamentos de OS
-- ============================================================================
-- Execute no SQL Editor do Supabase, DEPOIS da migration 027.
-- ============================================================================
-- Todo lançamento financeiro vindo de uma OS passa a ficar no centro de custo
-- "Ordens de Serviço", para aparecer agrupado no "Para onde foi" (centro de custo)
-- em vez de "Sem centro de custo".
-- ============================================================================

-- Garante o centro de custo (idempotente — name é unique).
insert into public.cost_centers (name, description)
values ('Ordens de Serviço', 'Receitas e custos das ordens de serviço (operações)')
on conflict (name) do nothing;

-- Backfill: marca os lançamentos automáticos de OS com esse centro de custo.
update public.transactions t
set cost_center_id = (select id from public.cost_centers where name = 'Ordens de Serviço')
where t.service_order_id is not null
  and t.cost_center_id is null;
