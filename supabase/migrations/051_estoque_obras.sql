-- ============================================================================
-- ILNET Finance — Estoque: OBRAS do módulo
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 049 e 050.
-- ============================================================================
-- O que muda:
--   • O Estoque ganha a sua própria lista de obras, para saber quanto de
--     material cada uma consumiu. É uma tabela separada (supply_obras): NÃO
--     encosta no módulo Obras nem na tabela public.obras.
--   • A saída passa a poder ser atrelada a uma dessas obras (opcional).
-- ============================================================================

-- ============================================================================
-- TABELA: supply_obras (obras do Estoque)
-- ============================================================================
create table if not exists public.supply_obras (
  id   uuid primary key default uuid_generate_v4(),
  name text not null unique,

  client text,                                -- para quem é a obra (opcional)
  notes  text,
  active boolean not null default true,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- supply_movements ganha a obra
-- ============================================================================
-- Apagar a obra NÃO apaga o histórico de saídas: o lançamento fica sem obra.
alter table public.supply_movements
  add column if not exists obra_id uuid
    references public.supply_obras(id) on delete set null;

create index if not exists idx_supply_movements_obra on public.supply_movements(obra_id);

-- ============================================================================
-- VIEW: v_supply_obra_usage (obra + quanto de material foi consumido)
-- ============================================================================
-- O valor usa o custo médio do item, o mesmo critério do "valor em estoque".
-- ============================================================================
drop view if exists public.v_supply_obra_usage;
create view public.v_supply_obra_usage
with (security_invoker = on) as
select
  o.*,
  coalesce(u.items_count, 0)  as items_count,
  coalesce(u.movements_count, 0) as movements_count,
  coalesce(u.total_value, 0)  as total_value,
  u.last_usage_at
from public.supply_obras o
left join lateral (
  select
    count(distinct m.item_id)                                    as items_count,
    count(*)                                                     as movements_count,
    coalesce(sum(m.quantity * coalesce(s.avg_unit_cost, 0)), 0)  as total_value,
    max(m.created_at)                                            as last_usage_at
  from public.supply_movements m
  join public.v_supply_stock s on s.id = m.item_id
  where m.obra_id = o.id and m.type = 'saida'
) u on true;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.supply_obras enable row level security;

drop policy if exists "supply_obras_read"  on public.supply_obras;
drop policy if exists "supply_obras_write" on public.supply_obras;
create policy "supply_obras_read" on public.supply_obras
  for select using (auth.uid() is not null);
create policy "supply_obras_write" on public.supply_obras
  for all
  using (public.user_can_write_module('estoque'))
  with check (public.user_can_write_module('estoque'));
