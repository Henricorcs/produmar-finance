-- ============================================================================
-- ILNET Finance — Patrimônio: ALMOXARIFADOS
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 035, 036 e 037.
-- ============================================================================
-- O que muda:
--   • Todo item do patrimônio passa a morar em um ALMOXARIFADO (garagem,
--     depósito, barracão...). O que já está cadastrado vai todo para a
--     "GARAGEM" — era de lá que saía tudo antes de existir a separação.
--   • A tela de Patrimônio abre escolhendo o almoxarifado; o cadastro de
--     almoxarifados fica na própria tela.
--   • "Baixar" virou "Emprestar" só no rótulo: continua sendo tool_loans
--     (empréstimo com devolução). Nada muda no banco por causa disso.
-- ============================================================================

-- ============================================================================
-- TABELA: tool_warehouses (almoxarifados)
-- ============================================================================
create table if not exists public.tool_warehouses (
  id   uuid primary key default uuid_generate_v4(),
  name text not null unique,                      -- GARAGEM, DEPÓSITO, BARRACÃO...

  location text,                                  -- onde fica (opcional)
  notes    text,
  active   boolean not null default true,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- o almoxarifado de sempre: tudo que já existe é da garagem
insert into public.tool_warehouses (name)
values ('GARAGEM')
on conflict (name) do nothing;

-- ============================================================================
-- tools ganha o almoxarifado
-- ============================================================================
alter table public.tools
  add column if not exists warehouse_id uuid
    references public.tool_warehouses(id) on delete set null;

create index if not exists idx_tools_warehouse on public.tools(warehouse_id);

-- backfill: todo item sem almoxarifado é da GARAGEM
update public.tools
   set warehouse_id = (select id from public.tool_warehouses where name = 'GARAGEM')
 where warehouse_id is null;

-- ============================================================================
-- VIEW: v_tool_status — recriada com o almoxarifado
-- ============================================================================
-- Precisa ser DROP + CREATE (não OR REPLACE): o `t.*` "congela" as colunas no
-- momento da criação e a lista mudou (entrou warehouse_id).
-- ============================================================================
drop view if exists public.v_tool_status;
create view public.v_tool_status
with (security_invoker = on) as
select
  t.*,
  wh.name                 as warehouse_name,
  ol.id                   as open_loan_id,
  ol.borrower_name        as current_borrower,
  ol.destination          as current_destination,
  ol.checked_out_at       as current_checked_out_at,
  ol.expected_return_date as current_expected_return_date,
  om.id                   as open_maintenance_id,
  om.description          as open_maintenance_description,
  om.started_at           as open_maintenance_started_at,
  ol.obra_id              as current_obra_id,
  coalesce(iu.qty, 0)     as in_use_qty,
  coalesce(wo.qty, 0)     as written_off_qty,
  greatest(0, t.quantity - coalesce(iu.qty, 0) - coalesce(wo.qty, 0)) as available_qty,
  case
    when om.id is not null                              then 'manutencao'
    when coalesce(wo.qty, 0) >= t.quantity              then 'baixada'
    when greatest(0, t.quantity - coalesce(iu.qty, 0) - coalesce(wo.qty, 0)) <= 0
         and coalesce(iu.qty, 0) > 0                    then 'em_uso'
    else 'disponivel'
  end as status
from public.tools t
left join public.tool_warehouses wh on wh.id = t.warehouse_id
left join lateral (
  select id, borrower_name, destination, obra_id, checked_out_at, expected_return_date
  from public.tool_loans l
  where l.tool_id = t.id and l.returned_at is null
  order by l.checked_out_at desc
  limit 1
) ol on true
left join lateral (
  select id, description, started_at
  from public.tool_maintenance m
  where m.tool_id = t.id and m.finished_at is null
  order by m.started_at desc
  limit 1
) om on true
left join lateral (
  select sum(l.quantity) as qty
  from public.tool_loans l
  where l.tool_id = t.id and l.returned_at is null
) iu on true
left join lateral (
  select sum(w.quantity) as qty
  from public.tool_writeoffs w
  where w.tool_id = t.id
) wo on true;

-- ============================================================================
-- ROW LEVEL SECURITY (igual às outras tabelas do módulo)
-- ============================================================================
alter table public.tool_warehouses enable row level security;

drop policy if exists "tool_warehouses_read"  on public.tool_warehouses;
drop policy if exists "tool_warehouses_write" on public.tool_warehouses;

create policy "tool_warehouses_read" on public.tool_warehouses
  for select using (auth.uid() is not null);
create policy "tool_warehouses_write" on public.tool_warehouses
  for all
  using (public.user_can_write_module('ferramentas'))
  with check (public.user_can_write_module('ferramentas'));
