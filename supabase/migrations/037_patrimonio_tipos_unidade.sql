-- ============================================================================
-- PRODUMAR — Patrimônio (Fase 3): tipos de unidade editáveis
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Cadastro editável de tipos de unidade (unidade, peça, jogo, par...).
-- tools.unit continua sendo texto livre (sem FK): apagar um tipo aqui não
-- afeta o patrimônio já cadastrado.
-- ============================================================================

create table if not exists public.tool_units (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- semeia os tipos padrão
insert into public.tool_units (name)
values ('unidade'), ('peça'), ('jogo'), ('par'), ('caixa'), ('metro'), ('kg'), ('litro')
on conflict (name) do nothing;

alter table public.tool_units enable row level security;

drop policy if exists "tool_units_read"  on public.tool_units;
drop policy if exists "tool_units_write" on public.tool_units;
create policy "tool_units_read"  on public.tool_units for select using (auth.uid() is not null);
create policy "tool_units_write" on public.tool_units for all
  using (public.current_user_role() in ('admin', 'financeiro'));
