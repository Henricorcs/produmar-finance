-- ============================================================================
-- ILNET Finance — Animais: pendência de vacina MARCADA NA MÃO
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 041, 042 e 043.
-- ============================================================================
-- Por que:
--   A planilha continua mostrando em vermelho o que falta aplicar (nunca
--   aplicada ou reforço vencido) — é assim que se enxerga os ml a dar. O que
--   sai é o CONTADOR automático de "pendentes": quem decide o que fica
--   pendente é o dono do rebanho, marcando na ficha do animal.
--
--   Uma linha aqui = "esta vacina deste animal está pendente de propósito".
--   Ao aplicar a vacina a marca sai sozinha (a pendência foi resolvida).
-- ============================================================================

create table if not exists public.animal_vaccine_pending (
  id         uuid primary key default uuid_generate_v4(),
  animal_id  uuid not null references public.animals(id)         on delete cascade,
  vaccine_id uuid not null references public.animal_vaccines(id) on delete cascade,

  note       text,                                   -- por que ficou pendente
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- a mesma vacina só fica pendente uma vez por animal
create unique index if not exists uq_animal_vaccine_pending
  on public.animal_vaccine_pending(animal_id, vaccine_id);
create index if not exists idx_animal_vaccine_pending_animal
  on public.animal_vaccine_pending(animal_id);

-- ── ROW LEVEL SECURITY (igual às outras tabelas do módulo) ──────────────────
alter table public.animal_vaccine_pending enable row level security;

drop policy if exists "animal_vaccine_pending_read"  on public.animal_vaccine_pending;
drop policy if exists "animal_vaccine_pending_write" on public.animal_vaccine_pending;

create policy "animal_vaccine_pending_read" on public.animal_vaccine_pending
  for select using (auth.uid() is not null);
create policy "animal_vaccine_pending_write" on public.animal_vaccine_pending
  for all
  using (public.user_can_write_module('animais'))
  with check (public.user_can_write_module('animais'));
