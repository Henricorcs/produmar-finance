-- ============================================================================
-- ILNET Finance — Animais: TIPO DO ANIMAL (bovino, equino, caprino, ovino)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 041 a 046.
-- ============================================================================
-- Por que:
--   O rebanho não é só de gado. Agora cada animal tem um TIPO (a espécie) e
--   TUDO QUE JÁ ESTÁ CADASTRADO VIRA BOVINO — é o default da coluna, ninguém
--   precisa mexer em nada.
--
--   • animals.species        → o tipo do animal.
--   • animal_breeds.species  → a raça é de um tipo só (nelore é de bovino,
--     mangalarga é de equino). No cadastro do animal a lista de raças já vem
--     filtrada pelo tipo. As raças que já existiam viram todas de bovino.
--
--   A CATEGORIA continua saindo sozinha da idade + sexo (view v_animals) e
--   continua com as mesmas três chaves — elas são o PAPEL do animal, não o
--   nome dele:
--     bezerro = filhote (menos de 12 meses)   boi = macho adulto
--     vaca    = fêmea adulta
--   Quem dá nome a isso é a tela, conforme o tipo: bezerro/potro/cabrito/
--   cordeiro, boi/cavalo/bode/carneiro, vaca/égua/cabra/ovelha.
-- ============================================================================

-- ── ENUM: tipo do animal ─────────────────────────────────────────────────────
do $$ begin
  create type animal_species as enum ('bovino', 'equino', 'caprino', 'ovino');
exception
  when duplicate_object then null;
end $$;

-- ── animals.species (o que já existe vira bovino) ────────────────────────────
alter table public.animals
  add column if not exists species animal_species not null default 'bovino';

create index if not exists idx_animals_species on public.animals(species);

-- ── animal_breeds.species (as raças de hoje são todas de bovino) ─────────────
alter table public.animal_breeds
  add column if not exists species animal_species not null default 'bovino';

-- o nome da raça agora só precisa ser único DENTRO do tipo ("mestiço" existe
-- em bovino, em caprino, em ovino...)
alter table public.animal_breeds drop constraint if exists animal_types_name_key;
alter table public.animal_breeds drop constraint if exists animal_breeds_name_key;
drop index if exists public.animal_types_name_key;
drop index if exists public.animal_breeds_name_key;

create unique index if not exists uq_animal_breeds_species_name
  on public.animal_breeds(species, name);

-- ── Raças mais comuns dos tipos novos (o usuário pode renomear/remover) ──────
insert into public.animal_breeds (name, species)
values
  ('mangalarga',    'equino'),
  ('quarto de milha','equino'),
  ('campolina',     'equino'),
  ('crioulo',       'equino'),
  ('mestiço',       'equino'),
  ('boer',          'caprino'),
  ('saanen',        'caprino'),
  ('anglo-nubiana', 'caprino'),
  ('alpina',        'caprino'),
  ('mestiço',       'caprino'),
  ('santa inês',    'ovino'),
  ('dorper',        'ovino'),
  ('morada nova',   'ovino'),
  ('texel',         'ovino'),
  ('mestiço',       'ovino')
on conflict (species, name) do nothing;

-- ============================================================================
-- VIEW: v_animals — recriada para trazer a coluna nova
-- ============================================================================
-- O `a.*` da view foi expandido coluna a coluna quando ela foi criada: sem
-- recriar, `species` não chegaria na tela.
-- ============================================================================
drop view if exists public.v_animals;

create view public.v_animals
with (security_invoker = on) as
select
  a.*,
  br.name as breed_name,
  ag.age_months,
  case
    when ag.age_months is not null and ag.age_months < 12 then 'bezerro'
    when a.sex = 'macho'                                  then 'boi'
    else                                                       'vaca'
  end as category,
  vs.vaccines_total,
  vs.vaccines_ok,
  (vs.vaccines_total - vs.vaccines_ok) as vaccines_due
from public.animals a
left join public.animal_breeds br on br.id = a.breed_id
-- idade em meses cheios
left join lateral (
  select case
    when a.birth_date is null then null
    else (extract(year  from age(current_date, a.birth_date)) * 12
        + extract(month from age(current_date, a.birth_date)))::int
  end as age_months
) ag on true
-- vacinação: para cada vacina cadastrada, o animal está em dia?
--   em dia = já aplicada e (dose única ou o reforço ainda não venceu)
left join lateral (
  select
    count(*)::int as vaccines_total,
    (count(*) filter (
      where z.last_app is not null
        and (
          coalesce(z.rec, 0) = 0
          or z.last_app + make_interval(months => z.rec) > current_date
        )
    ))::int as vaccines_ok
  from (
    select
      av.recurrence_months as rec,
      (
        select max(x.applied_at)
        from public.animal_vaccinations x
        where x.animal_id = a.id and x.vaccine_id = av.id
      ) as last_app
    from public.animal_vaccines av
  ) z
) vs on true;
