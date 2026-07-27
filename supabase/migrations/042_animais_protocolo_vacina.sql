-- ============================================================================
-- ILNET Finance — Animais: protocolo de vacinação (várias vacinas de uma vez)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS da migration 041_animais.sql.
-- ============================================================================
-- O que muda:
--   • Vacinação deixa de ser "uma vacina por vez" e vira PROTOCOLO: marca-se
--     várias vacinas na mesma aplicação. As linhas do protocolo compartilham
--     o mesmo protocol_id (não há tabela nova — o id agrupa o histórico).
--   • Cada vacina do cadastro guarda a DOSE PADRÃO em ml. A dose pode ser
--     fixa (default_dose_ml) ou por peso ("X ml a cada Y kg"), e aí o sistema
--     calcula quantos ml dar para aquele animal.
--   • Cada aplicação guarda a MARCA da vacina usada (o cadastro pode ter uma
--     marca padrão, que vem preenchida e pode ser trocada na hora).
-- ============================================================================

-- ── Cadastro de vacinas: dose padrão e marca padrão ─────────────────────────
alter table public.animal_vaccines
  add column if not exists default_dose_ml    numeric(10, 2),  -- dose fixa em ml
  -- dose por peso: "dose_ml_per_weight ml a cada dose_weight_kg kg"
  add column if not exists dose_ml_per_weight numeric(10, 2),
  add column if not exists dose_weight_kg     numeric(10, 2),
  add column if not exists default_brand      text;

-- ── Aplicações: ml, marca e agrupamento por protocolo ───────────────────────
alter table public.animal_vaccinations
  add column if not exists dose_ml     numeric(10, 2),
  add column if not exists brand       text,
  add column if not exists protocol_id uuid;

-- a dose virou número em ml — a coluna de texto não é mais usada
alter table public.animal_vaccinations drop column if exists dose;

create index if not exists idx_animal_vaccinations_protocol
  on public.animal_vaccinations(protocol_id);

-- ── Doses padrão das vacinas semeadas + a 5ª vacina do protocolo ────────────
update public.animal_vaccines set default_dose_ml = 5 where name = 'febre aftosa'  and default_dose_ml is null;
update public.animal_vaccines set default_dose_ml = 2 where name = 'brucelose'     and default_dose_ml is null;
update public.animal_vaccines set default_dose_ml = 5 where name = 'clostridiose'  and default_dose_ml is null;
update public.animal_vaccines set default_dose_ml = 2 where name = 'raiva'         and default_dose_ml is null;

insert into public.animal_vaccines (name, recurrence_months, default_dose_ml)
values ('botulismo', 12, 5)
on conflict (name) do nothing;
