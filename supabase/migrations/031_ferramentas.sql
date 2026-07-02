-- ============================================================================
-- PRODUMAR — Módulo Ferramentas (Fase 2)
-- ============================================================================
-- Execute este arquivo no SQL Editor do Supabase
-- (Dashboard → SQL Editor → New Query → cole tudo → Run)
-- ============================================================================
-- Conceito:
--   • Ferramenta  = item cadastrado com código/patrimônio, foto e estado.
--   • Retirada    = alguém pegou a ferramenta (tool_loans). A devolução
--                   preenche returned_at e atualiza o estado da ferramenta.
--   • Manutenção  = ferramenta parada para conserto (tool_maintenance).
--   • Status      = derivado (view v_tool_status): baixada > manutenção >
--                   em uso > disponível. Nada de status gravado na mão.
-- ============================================================================

-- ── ENUM: estado de conservação ─────────────────────────────────────────────
do $$ begin
  create type tool_condition as enum ('otimo', 'bom', 'regular', 'ruim');
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- TABELA: tools (ferramentas)
-- ============================================================================
create table if not exists public.tools (
  id uuid primary key default uuid_generate_v4(),
  tool_number serial not null unique,

  name      text not null,
  code      text,                                   -- código/patrimônio (opcional)
  condition tool_condition not null default 'bom',  -- estado atual
  photo_path text,                                  -- foto no bucket attachments

  active boolean not null default true,             -- false = baixada (perdida/sucateada)

  notes      text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tools_name   on public.tools(name);
create index if not exists idx_tools_active on public.tools(active);

-- ============================================================================
-- TABELA: tool_loans (retiradas e devoluções)
-- ============================================================================
create table if not exists public.tool_loans (
  id uuid primary key default uuid_generate_v4(),
  tool_id uuid not null references public.tools(id) on delete cascade,

  borrower_name text not null,          -- quem pegou (texto livre — nem todos são usuários)
  destination   text,                   -- onde vai usar (obra/local)

  checked_out_at       timestamptz not null default now(),
  expected_return_date date,

  returned_at      timestamptz,
  return_condition tool_condition,      -- estado na devolução
  return_notes     text,

  notes      text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tool_loans_tool on public.tool_loans(tool_id);

-- garante no máximo UMA retirada em aberto por ferramenta
create unique index if not exists uq_tool_loans_open
  on public.tool_loans(tool_id) where returned_at is null;

-- ============================================================================
-- TABELA: tool_maintenance (manutenções/consertos)
-- ============================================================================
create table if not exists public.tool_maintenance (
  id uuid primary key default uuid_generate_v4(),
  tool_id uuid not null references public.tools(id) on delete cascade,

  description text not null,            -- o que está sendo feito
  cost        numeric(12, 2) not null default 0,

  started_at  date not null default current_date,
  finished_at date,

  notes      text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tool_maintenance_tool on public.tool_maintenance(tool_id);

-- garante no máximo UMA manutenção em aberto por ferramenta
create unique index if not exists uq_tool_maintenance_open
  on public.tool_maintenance(tool_id) where finished_at is null;

-- ============================================================================
-- VIEW: v_tool_status (ferramenta + status derivado + retirada/manutenção aberta)
-- ============================================================================
create or replace view public.v_tool_status
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
  case
    when not t.active      then 'baixada'
    when om.id is not null then 'manutencao'
    when ol.id is not null then 'em_uso'
    else 'disponivel'
  end as status
from public.tools t
left join lateral (
  select id, borrower_name, destination, checked_out_at, expected_return_date
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
-- updated_at em tools
-- ============================================================================
drop trigger if exists set_tools_updated_at on public.tools;
create trigger set_tools_updated_at before update on public.tools
  for each row execute function public.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.tools            enable row level security;
alter table public.tool_loans       enable row level security;
alter table public.tool_maintenance enable row level security;

-- Leitura: todo usuário logado. Escrita: admin/financeiro.
drop policy if exists "tools_read"  on public.tools;
drop policy if exists "tools_write" on public.tools;
create policy "tools_read"  on public.tools for select using (auth.uid() is not null);
create policy "tools_write" on public.tools for all
  using (public.current_user_role() in ('admin', 'financeiro'));

drop policy if exists "tool_loans_read"  on public.tool_loans;
drop policy if exists "tool_loans_write" on public.tool_loans;
create policy "tool_loans_read"  on public.tool_loans for select using (auth.uid() is not null);
create policy "tool_loans_write" on public.tool_loans for all
  using (public.current_user_role() in ('admin', 'financeiro'));

drop policy if exists "tool_maintenance_read"  on public.tool_maintenance;
drop policy if exists "tool_maintenance_write" on public.tool_maintenance;
create policy "tool_maintenance_read"  on public.tool_maintenance for select using (auth.uid() is not null);
create policy "tool_maintenance_write" on public.tool_maintenance for all
  using (public.current_user_role() in ('admin', 'financeiro'));
