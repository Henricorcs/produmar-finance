-- ============================================================================
-- ILNET Finance — Animais: PESAGENS (quanto o boi engordou e em quanto tempo)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 041 a 044.
-- ============================================================================
-- Por que:
--   Toda vez que o animal passa pelo curral para o protocolo de vacinação ele
--   também é pesado. Guardando cada pesagem dá para dizer quanto ele ganhou
--   desde a última — em kg, em dias e em ganho por dia (GMD).
--
--   • Uma linha = uma pesagem (animal, data, peso).
--   • protocol_id preenchido = o peso foi tirado naquele protocolo de vacina.
--   • animals.weight continua sendo o PESO ATUAL (a última pesagem) — é dele
--     que sai a dose em ml calculada por peso.
-- ============================================================================

create table if not exists public.animal_weights (
  id        uuid primary key default uuid_generate_v4(),
  animal_id uuid not null references public.animals(id) on delete cascade,

  weighed_at date          not null default current_date,
  weight     numeric(10,2) not null,               -- peso em kg naquele dia

  -- protocolo de vacinação em que o animal foi pesado (null = pesagem avulsa)
  protocol_id uuid,

  notes      text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- um peso por animal por dia: repesar no mesmo dia corrige, não duplica
create unique index if not exists uq_animal_weights_day
  on public.animal_weights(animal_id, weighed_at);
create index if not exists idx_animal_weights_animal
  on public.animal_weights(animal_id, weighed_at desc);
create index if not exists idx_animal_weights_protocol
  on public.animal_weights(protocol_id);

-- ── Backfill: o peso que já estava no cadastro vira a primeira pesagem ───────
insert into public.animal_weights (animal_id, weighed_at, weight, notes)
select a.id, a.created_at::date, a.weight, 'PESO DO CADASTRO'
from public.animals a
where a.weight > 0
on conflict (animal_id, weighed_at) do nothing;

-- ============================================================================
-- ROW LEVEL SECURITY (igual às outras tabelas do módulo)
-- ============================================================================
alter table public.animal_weights enable row level security;

drop policy if exists "animal_weights_read"  on public.animal_weights;
drop policy if exists "animal_weights_write" on public.animal_weights;

create policy "animal_weights_read" on public.animal_weights
  for select using (auth.uid() is not null);
create policy "animal_weights_write" on public.animal_weights
  for all
  using (public.user_can_write_module('animais'))
  with check (public.user_can_write_module('animais'));
