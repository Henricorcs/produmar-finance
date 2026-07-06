-- ============================================================================
-- PRODUMAR — Módulo Obras (Fase 3)
-- ============================================================================
-- Execute este arquivo no SQL Editor do Supabase
-- (Dashboard → SQL Editor → New Query → cole tudo → Run)
-- ============================================================================
-- Conceito:
--   • Obra = canteiro/serviço cadastrado (cliente, local, prazo, status).
--   • OS, retirada de ferramenta e lançamento financeiro podem, opcionalmente,
--     ser vinculados a uma obra (obra_id) — o custo da obra é a soma desses
--     vínculos, sem duplicar cadastro de cliente (reaproveita public.contacts).
-- ============================================================================

-- ── ENUM: status da obra ─────────────────────────────────────────────────────
do $$ begin
  create type obra_status as enum ('planejamento', 'em_andamento', 'concluida', 'cancelada');
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- TABELA: obras
-- ============================================================================
create table if not exists public.obras (
  id uuid primary key default uuid_generate_v4(),
  obra_number serial not null unique,

  name       text not null,
  contact_id uuid references public.contacts(id) on delete set null,  -- cliente (opcional)
  location   text,
  status     obra_status not null default 'planejamento',

  start_date        date,
  planned_end_date  date,
  actual_end_date   date,
  budget            numeric(12, 2),

  notes  text,
  active boolean not null default true,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_obras_active     on public.obras(active);
create index if not exists idx_obras_contact_id on public.obras(contact_id);

drop trigger if exists set_obras_updated_at on public.obras;
create trigger set_obras_updated_at before update on public.obras
  for each row execute function public.set_updated_at();

-- ============================================================================
-- obra_id — vínculo opcional em OS, retirada de ferramenta e lançamento
-- ============================================================================
alter table public.transactions
  add column if not exists obra_id uuid references public.obras(id) on delete set null;
create index if not exists idx_transactions_obra_id on public.transactions(obra_id);

alter table public.service_orders
  add column if not exists obra_id uuid references public.obras(id) on delete set null;
create index if not exists idx_service_orders_obra_id on public.service_orders(obra_id);

alter table public.tool_loans
  add column if not exists obra_id uuid references public.obras(id) on delete set null;
create index if not exists idx_tool_loans_obra_id on public.tool_loans(obra_id);

-- ============================================================================
-- v_tool_status — passa a expor a obra da retirada em aberto (current_obra_id)
-- ============================================================================
create or replace view public.v_tool_status
with (security_invoker = on) as
-- Atenção: CREATE OR REPLACE VIEW só permite ACRESCENTAR colunas no final da
-- lista (não inserir no meio) — por isso current_obra_id vai depois de status,
-- preservando a ordem/nome de todas as colunas que já existiam na view.
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
  case
    when not t.active      then 'baixada'
    when om.id is not null then 'manutencao'
    when ol.id is not null then 'em_uso'
    else 'disponivel'
  end as status,
  ol.obra_id as current_obra_id
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
) om on true;

-- ============================================================================
-- VIEW: v_obra_summary (obra + custo total + contagens agregadas)
-- ============================================================================
create or replace view public.v_obra_summary
with (security_invoker = on) as
select
  o.*,
  coalesce(sum(t.amount) filter (where t.type = 'saida'), 0) as total_cost,
  count(distinct so.id)                                       as os_count,
  count(distinct tl.id) filter (where tl.returned_at is null) as tools_in_use
from public.obras o
left join public.transactions   t  on t.obra_id = o.id
left join public.service_orders so on so.obra_id = o.id
left join public.tool_loans     tl on tl.obra_id = o.id
group by o.id;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.obras enable row level security;

-- Leitura: todo usuário logado (OS/ferramentas/contas precisam listar obras
-- pra vincular). Escrita: admin/financeiro — mesmo padrão de tools/pickup_locations.
drop policy if exists "obras_read"  on public.obras;
drop policy if exists "obras_write" on public.obras;
create policy "obras_read"  on public.obras for select using (auth.uid() is not null);
create policy "obras_write" on public.obras for all
  using (public.current_user_role() in ('admin', 'financeiro'));
