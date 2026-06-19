-- ============================================================================
-- ILNET Finance — Encaminhar OS para outro operador (histórico)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Conceito:
--   • O operador pode ENCAMINHAR uma OS (ex.: serviço rápido) para outra pessoa
--     quando não puder fazer. A OS muda de dono (service_orders.assigned_to) e
--     passa a aparecer no painel de quem recebeu.
--   • Cada encaminhamento vira uma linha aqui: de quem, para quem, quando e uma
--     observação opcional. Guardamos o NOME (snapshot) de cada um para o
--     histórico/impressão não depender de join no profiles (cuja RLS esconde
--     outros usuários para quem não é admin).
-- ============================================================================

create table if not exists public.service_order_forwards (
  id uuid primary key default uuid_generate_v4(),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,

  from_user uuid references auth.users(id) on delete set null,
  from_name text,            -- nome de quem encaminhou (snapshot)
  to_user   uuid references auth.users(id) on delete set null,
  to_name   text,            -- nome de quem recebeu (snapshot)
  note      text,            -- observação opcional

  created_at timestamptz not null default now()
);

create index if not exists idx_service_order_forwards_order
  on public.service_order_forwards(service_order_id);

alter table public.service_order_forwards enable row level security;

-- Leitura: todo usuário logado. Escrita: admin/financeiro/operador
-- (o próprio operador encaminha) — mesma regra de service_order_pauses.
drop policy if exists "service_order_forwards_read"  on public.service_order_forwards;
drop policy if exists "service_order_forwards_write" on public.service_order_forwards;
create policy "service_order_forwards_read"  on public.service_order_forwards
  for select using (auth.uid() is not null);
create policy "service_order_forwards_write" on public.service_order_forwards
  for all using (public.current_user_role() in ('admin', 'financeiro', 'operador'));
