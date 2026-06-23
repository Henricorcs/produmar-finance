-- Migration 029: "a receber" passa a somar todos os meses (não só o mês atual)
-- Renomeia a_receber_mes -> a_receber_total e count_a_receber_mes -> count_a_receber_total
-- Execute no Supabase SQL Editor
-- DROP necessario: create or replace view nao permite renomear colunas existentes

drop view if exists public.v_dashboard_kpis;

create view public.v_dashboard_kpis as
select
  coalesce(sum(case when type = 'entrada' and status = 'recebido' and date_trunc('month', paid_date) = date_trunc('month', current_date) then amount end), 0) as receitas_mes,
  coalesce(sum(case when type = 'saida'   and status = 'pago'     and date_trunc('month', paid_date) = date_trunc('month', current_date) then amount end), 0) as despesas_mes,
  coalesce(sum(case when type = 'saida'   and status in ('pendente', 'vencido') and due_date between current_date and current_date + interval '7 days' then amount end), 0) as a_pagar_7dias,
  coalesce(sum(case when type = 'entrada' and status in ('pendente', 'vencido') then amount end), 0) as a_receber_total,
  coalesce(
    sum(case when type = 'entrada' and status = 'recebido' then amount end) -
    sum(case when type = 'saida'   and status = 'pago'     then amount end),
  0) as saldo_atual,
  count(*) filter (where type = 'entrada' and date_trunc('month', due_date) = date_trunc('month', current_date)) as count_receitas_mes,
  count(*) filter (where type = 'saida'   and date_trunc('month', due_date) = date_trunc('month', current_date)) as count_despesas_mes,
  count(*) filter (where type = 'saida'   and status in ('pendente', 'vencido') and due_date between current_date and current_date + interval '7 days') as count_a_pagar_7dias,
  count(*) filter (where type = 'entrada' and status in ('pendente', 'vencido')) as count_a_receber_total
from public.transactions;
