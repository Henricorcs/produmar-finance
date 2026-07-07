-- ============================================================================
-- PRODUMAR — Módulo Obras: lista de materiais/mão de obra (fase 4)
-- ============================================================================
-- Execute este arquivo no SQL Editor do Supabase
-- (Dashboard → SQL Editor → New Query → cole tudo → Run)
-- ============================================================================
-- Conceito:
--   • obra_items = cada linha lançada na obra (material comprado, diária de
--     mão de obra, refeição etc.), igual à planilha que a Andréia já usava:
--     data, produto, quantidade, unidade, valor unitário pago, e o valor
--     que custaria "no comércio" (pra calcular a economia de ter comprado
--     mais barato / negociado direto).
--   • O custo total da obra passa a ser a soma dos itens desta tabela —
--     substitui o cálculo anterior (soma de transactions vinculadas).
-- ============================================================================

create table if not exists public.obra_items (
  id uuid primary key default uuid_generate_v4(),
  obra_id uuid not null references public.obras(id) on delete cascade,

  item_date         date not null default current_date,
  product           text not null,
  quantity          numeric(12, 3) not null default 1,
  unit              text not null default 'UNIDADE',
  unit_price        numeric(12, 2) not null default 0,
  market_unit_price numeric(12, 2),  -- valor "de comércio" (opcional) — base da economia

  notes text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_obra_items_obra_id on public.obra_items(obra_id);

drop trigger if exists set_obra_items_updated_at on public.obra_items;
create trigger set_obra_items_updated_at before update on public.obra_items
  for each row execute function public.set_updated_at();

-- ============================================================================
-- VIEW: v_obra_summary — custo total agora vem de obra_items (não mais de
-- transactions); adiciona total_savings (economia) no final da lista de
-- colunas (CREATE OR REPLACE VIEW só permite acrescentar no final).
-- ============================================================================
create or replace view public.v_obra_summary
with (security_invoker = on) as
select
  o.*,
  coalesce(sum(oi.quantity * oi.unit_price), 0) as total_cost,
  count(distinct so.id)                                       as os_count,
  count(distinct tl.id) filter (where tl.returned_at is null) as tools_in_use,
  coalesce(
    sum(oi.quantity * (oi.market_unit_price - oi.unit_price))
      filter (where oi.market_unit_price is not null),
    0
  ) as total_savings
from public.obras o
left join public.obra_items     oi on oi.obra_id = o.id
left join public.service_orders so on so.obra_id = o.id
left join public.tool_loans     tl on tl.obra_id = o.id
group by o.id;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.obra_items enable row level security;

drop policy if exists "obra_items_read"  on public.obra_items;
drop policy if exists "obra_items_write" on public.obra_items;
create policy "obra_items_read"  on public.obra_items for select using (auth.uid() is not null);
create policy "obra_items_write" on public.obra_items for all
  using (public.current_user_role() in ('admin', 'financeiro'));
