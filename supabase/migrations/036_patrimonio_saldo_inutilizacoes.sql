-- ============================================================================
-- PRODUMAR — Patrimônio (Fase 3): controle por saldo + inutilizações
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- IMPORTANTE: rode o 035 antes deste.
-- ============================================================================
-- Conceitos novos:
--   • Baixar     = empréstimo temporário (tool_loans) — volta com Devolver.
--                  Agora com quantidade: dá pra baixar N de M unidades.
--   • Inutilizar = perda definitiva (tool_writeoffs) — quebrado, perdido,
--                  roubado, sucateado. Reversível (Desfazer repõe o saldo).
--   • Saldo      = quantity - em uso (retiradas abertas) - inutilizadas.
-- ============================================================================

-- ── tool_loans ganha quantidade e deixa de ter trava de uma retirada aberta ──
alter table public.tool_loans
  add column if not exists quantity integer not null default 1;

-- várias retiradas parciais podem coexistir no mesmo item
drop index if exists uq_tool_loans_open;

-- ============================================================================
-- TABELA: tool_writeoffs (inutilizações / perdas)
-- ============================================================================
create table if not exists public.tool_writeoffs (
  id uuid primary key default uuid_generate_v4(),
  tool_id uuid not null references public.tools(id) on delete cascade,

  quantity integer not null default 1,
  reason   text,                         -- quebrado, perdido, roubado, sucateado...

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tool_writeoffs_tool on public.tool_writeoffs(tool_id);

alter table public.tool_writeoffs enable row level security;

drop policy if exists "tool_writeoffs_read"  on public.tool_writeoffs;
drop policy if exists "tool_writeoffs_write" on public.tool_writeoffs;
create policy "tool_writeoffs_read"  on public.tool_writeoffs for select using (auth.uid() is not null);
create policy "tool_writeoffs_write" on public.tool_writeoffs for all
  using (public.current_user_role() in ('admin', 'financeiro'));

-- ============================================================================
-- VIEW: v_tool_status — recriada com saldos (in_use_qty / written_off_qty /
-- available_qty). Precisa ser DROP + CREATE (não OR REPLACE), porque o `t.*`
-- "congela" as colunas no momento da criação e a lista de colunas mudou.
-- ============================================================================
drop view if exists public.v_tool_status;
create view public.v_tool_status
with (security_invoker = on) as
select
  t.*,
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
