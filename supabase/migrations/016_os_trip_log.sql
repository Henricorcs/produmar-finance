-- ============================================================================
-- ILNET Finance — Horário de cada viagem marcada pelo técnico (modo "viagem")
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Conceito:
--   • Cada toque em "+1 VIAGEM" no painel do operador grava uma linha aqui
--     com o número da viagem e a hora (relógio do celular do técnico).
--   • O "−" remove a última linha. O contador oficial continua sendo
--     service_orders.trips_count (o escritório pode corrigi-lo sem log).
--   • Hora de início (start_time) e de fechamento (end_time) já existem na
--     service_orders e passam a ser gravadas em TODOS os fluxos do técnico.

create table if not exists public.service_order_trips (
  id uuid primary key default uuid_generate_v4(),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  trip_number integer not null,
  trip_time   time,
  created_at  timestamptz not null default now()
);

create index if not exists idx_service_order_trips_order
  on public.service_order_trips(service_order_id);

alter table public.service_order_trips enable row level security;

-- Leitura: todo usuário logado. Escrita: admin/financeiro/operador
-- (mesma regra de service_orders — o técnico marca as viagens).
drop policy if exists "service_order_trips_read"  on public.service_order_trips;
drop policy if exists "service_order_trips_write" on public.service_order_trips;
create policy "service_order_trips_read"  on public.service_order_trips
  for select using (auth.uid() is not null);
create policy "service_order_trips_write" on public.service_order_trips
  for all using (public.current_user_role() in ('admin', 'financeiro', 'operador'));
