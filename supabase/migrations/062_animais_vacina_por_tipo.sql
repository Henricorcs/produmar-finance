-- ============================================================================
-- ILNET Finance — Animais: a VACINA é de um tipo de animal
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 047 (animals.species) e 054/055 (o tipo suíno).
-- ============================================================================
-- Por que:
--   O cadastro de vacinas era um só para a fazenda inteira: febre aftosa
--   aparecia na coluna do cavalo, do bode e do porco, e todo animal que não
--   fosse boi nascia com a planilha cheia de vermelho de vacina que ele nunca
--   vai tomar. Vacina é do BICHO — aftosa é de bovino, influenza equina é de
--   cavalo, peste suína é de porco.
--
--   • animal_vaccines.species  → de que tipo é a vacina. Tudo que já está
--     cadastrado vira BOVINO (é o default da coluna, ninguém mexe em nada).
--   • O nome agora só precisa ser único DENTRO do tipo — "raiva" e
--     "clostridiose" existem em mais de uma criação, cada uma com a sua dose.
--   • A view v_animals passa a contar SÓ as vacinas do tipo do animal: a
--     situação "em dia / pendente" de um porco olha as vacinas de suíno.
--
--   As aplicações já registradas (animal_vaccinations) não mudam nada.
-- ============================================================================

-- ── animal_vaccines.species (as vacinas de hoje são todas de bovino) ─────────
alter table public.animal_vaccines
  add column if not exists species animal_species not null default 'bovino';

create index if not exists idx_animal_vaccines_species
  on public.animal_vaccines(species);

-- ── O nome é único dentro do tipo ────────────────────────────────────────────
alter table public.animal_vaccines drop constraint if exists animal_vaccines_name_key;
drop index if exists public.animal_vaccines_name_key;

create unique index if not exists uq_animal_vaccines_species_name
  on public.animal_vaccines(species, name);

-- ── Um empurrão inicial para os outros tipos ─────────────────────────────────
-- Só os nomes mais conhecidos de cada criação, para a tela não nascer vazia.
-- A periodicidade só vem preenchida onde ela é a mesma em qualquer lugar
-- (raiva, tétano e clostridiose de ano em ano; influenza de seis em seis
-- meses) — o resto entra como dose única e o dono ajusta na tela conforme o
-- que o veterinário dele manda. Nada aqui é obrigatório: pode renomear,
-- apagar e cadastrar as suas (Animais → Vacinação → Vacinas).
insert into public.animal_vaccines (name, species, recurrence_months)
values
  ('raiva',                 'equino',  12),
  ('tétano',                'equino',  12),
  ('influenza equina',      'equino',   6),
  ('encefalomielite',       'equino',  12),
  ('clostridiose',          'caprino', 12),
  ('raiva',                 'caprino', 12),
  ('linfadenite caseosa',   'caprino', null),
  ('clostridiose',          'ovino',   12),
  ('raiva',                 'ovino',   12),
  ('linfadenite caseosa',   'ovino',   null),
  ('peste suína clássica',  'suino',   null),
  ('erisipela',             'suino',   null),
  ('parvovirose suína',     'suino',   null),
  ('micoplasma',            'suino',   null),
  ('circovirose',           'suino',   null)
on conflict (species, name) do nothing;

-- ============================================================================
-- VIEW: v_animals — a situação de vacinação olha só as vacinas do tipo
-- ============================================================================
-- O `a.*` da view foi expandido coluna a coluna quando ela foi criada, e
-- `create or replace view` só aceita acrescentar coluna NO FIM — por isso o
-- drop. O `a.*` traz junto o que a 056 acrescentou (saída do rebanho), quando
-- ela já tiver rodado.
--
-- A ÚNICA mudança de lógica está no `where av.species = a.species` lá embaixo.
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
-- vacinação: para cada vacina DO TIPO DELE, o animal está em dia?
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
    where av.species = a.species
  ) z
) vs on true;
