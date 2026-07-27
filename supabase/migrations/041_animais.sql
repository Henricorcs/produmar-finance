-- ============================================================================
-- ILNET Finance — Módulo Animais (rebanho da fazenda)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Conceito:
--   • Animal      = boi / vaca / bezerro cadastrado com número (brinco), sexo,
--                   nascimento, tipo (raça, cadastrável), peso e fotos.
--   • Categoria   = DERIVADA (view v_animals): menos de 12 meses → bezerro;
--                   senão macho → boi, fêmea → vaca. Nada digitado na mão.
--   • Parto       = uma linha por bezerro nascido (animal_births). "Quantos
--                   pariu" é a contagem; cada linha tem a data do bezerro.
--                   O bezerro pode virar um cadastro de animal (calf_animal_id).
--   • Tratamento  = ocorrência de saúde + o remédio aplicado.
--   • Vacina      = cadastro (animal_vaccines, com periodicidade em meses) e
--                   aplicações por animal (animal_vaccinations). A situação
--                   "em dia / pendente" é derivada da última aplicação.
-- Depende de user_can_write_module() (migration 039).
-- ============================================================================

-- ── ENUM: sexo ───────────────────────────────────────────────────────────────
do $$ begin
  create type animal_sex as enum ('macho', 'femea');
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- TABELA: animal_types (tipo/raça do animal — cadastro editável)
-- ============================================================================
create table if not exists public.animal_types (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- semeia os tipos mais comuns (o usuário pode renomear/remover)
insert into public.animal_types (name)
values ('nelore'), ('angus'), ('girolando'), ('gir'), ('guzerá'), ('holandesa'), ('mestiço')
on conflict (name) do nothing;

-- ============================================================================
-- TABELA: animals (o rebanho)
-- ============================================================================
create table if not exists public.animals (
  id  uuid primary key default uuid_generate_v4(),
  tag text not null,                                    -- número do animal (brinco)

  sex        animal_sex not null,
  birth_date date,
  type_id    uuid references public.animal_types(id) on delete set null,
  weight     numeric(10, 2) not null default 0,         -- peso atual em kg

  photo_path text,                                      -- foto principal (bucket attachments)
  active     boolean not null default true,             -- false = saiu do rebanho

  notes      text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_animals_tag  on public.animals(tag);
create index        if not exists idx_animals_sex on public.animals(sex);
create index        if not exists idx_animals_active on public.animals(active);

-- ============================================================================
-- TABELA: animal_photos (galeria — várias fotos por animal)
-- ============================================================================
create table if not exists public.animal_photos (
  id         uuid primary key default uuid_generate_v4(),
  animal_id  uuid not null references public.animals(id) on delete cascade,
  path       text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_animal_photos_animal on public.animal_photos(animal_id);

-- ============================================================================
-- TABELA: animal_births (partos — uma linha por bezerro)
-- ============================================================================
create table if not exists public.animal_births (
  id         uuid primary key default uuid_generate_v4(),
  mother_id  uuid not null references public.animals(id) on delete cascade,

  birth_date date not null default current_date,        -- nascimento deste bezerro
  calf_tag   text,                                      -- número do bezerro (opcional)
  calf_sex   animal_sex,
  -- preenchido quando o bezerro também virou cadastro de animal
  calf_animal_id uuid references public.animals(id) on delete set null,

  notes      text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_animal_births_mother on public.animal_births(mother_id);

-- ============================================================================
-- TABELA: animal_treatments (tratamentos + remédio aplicado)
-- ============================================================================
create table if not exists public.animal_treatments (
  id        uuid primary key default uuid_generate_v4(),
  animal_id uuid not null references public.animals(id) on delete cascade,

  description text not null,                            -- o que o animal teve / o que foi feito
  medicine    text,                                     -- remédio usado
  dose        text,                                     -- ex.: "10 ml", "2 comprimidos"
  applied_at  date not null default current_date,
  next_application date,                                -- próxima aplicação (opcional)
  cost        numeric(12, 2) not null default 0,

  notes      text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_animal_treatments_animal on public.animal_treatments(animal_id);

-- ============================================================================
-- TABELA: animal_vaccines (cadastro de vacinas)
-- ============================================================================
create table if not exists public.animal_vaccines (
  id   uuid primary key default uuid_generate_v4(),
  name text not null unique,
  -- de quantos em quantos meses precisa repetir. null/0 = dose única.
  recurrence_months int,
  notes      text,
  created_at timestamptz not null default now()
);

-- semeia as vacinas mais comuns do rebanho bovino
insert into public.animal_vaccines (name, recurrence_months)
values ('febre aftosa', 6), ('brucelose', null), ('clostridiose', 12), ('raiva', 12)
on conflict (name) do nothing;

-- ============================================================================
-- TABELA: animal_vaccinations (aplicações de vacina por animal)
-- ============================================================================
create table if not exists public.animal_vaccinations (
  id         uuid primary key default uuid_generate_v4(),
  animal_id  uuid not null references public.animals(id) on delete cascade,
  vaccine_id uuid not null references public.animal_vaccines(id) on delete cascade,

  applied_at date not null default current_date,
  dose       text,

  notes      text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_animal_vaccinations_animal  on public.animal_vaccinations(animal_id);
create index if not exists idx_animal_vaccinations_vaccine on public.animal_vaccinations(vaccine_id);

-- ============================================================================
-- VIEW: v_animals (animal + categoria, idade, partos e situação de vacinação)
-- ============================================================================
create or replace view public.v_animals
with (security_invoker = on) as
select
  a.*,
  ty.name as type_name,
  ag.age_months,
  case
    when ag.age_months is not null and ag.age_months < 12 then 'bezerro'
    when a.sex = 'macho'                                  then 'boi'
    else                                                       'vaca'
  end as category,
  bs.calves_count,
  bs.last_birth_date,
  tr.treatments_count,
  tr.last_treatment_at,
  vs.vaccines_ok,
  (vs.vaccines_total - vs.vaccines_ok) as vaccines_due
from public.animals a
left join public.animal_types ty on ty.id = a.type_id
-- idade em meses cheios
left join lateral (
  select case
    when a.birth_date is null then null
    else (extract(year  from age(current_date, a.birth_date)) * 12
        + extract(month from age(current_date, a.birth_date)))::int
  end as age_months
) ag on true
-- partos
left join lateral (
  select count(*)::int as calves_count, max(b.birth_date) as last_birth_date
  from public.animal_births b
  where b.mother_id = a.id
) bs on true
-- tratamentos
left join lateral (
  select count(*)::int as treatments_count, max(t.applied_at) as last_treatment_at
  from public.animal_treatments t
  where t.animal_id = a.id
) tr on true
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

-- ============================================================================
-- updated_at em animals
-- ============================================================================
drop trigger if exists set_animals_updated_at on public.animals;
create trigger set_animals_updated_at before update on public.animals
  for each row execute function public.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.animals             enable row level security;
alter table public.animal_types        enable row level security;
alter table public.animal_photos       enable row level security;
alter table public.animal_births       enable row level security;
alter table public.animal_treatments   enable row level security;
alter table public.animal_vaccines     enable row level security;
alter table public.animal_vaccinations enable row level security;

-- Leitura: todo usuário logado. Escrita: quem tem o módulo 'animais' liberado.
drop policy if exists "animals_read"  on public.animals;
drop policy if exists "animals_write" on public.animals;
create policy "animals_read"  on public.animals for select using (auth.uid() is not null);
create policy "animals_write" on public.animals for all
  using (public.user_can_write_module('animais'))
  with check (public.user_can_write_module('animais'));

drop policy if exists "animal_types_read"  on public.animal_types;
drop policy if exists "animal_types_write" on public.animal_types;
create policy "animal_types_read"  on public.animal_types for select using (auth.uid() is not null);
create policy "animal_types_write" on public.animal_types for all
  using (public.user_can_write_module('animais'))
  with check (public.user_can_write_module('animais'));

drop policy if exists "animal_photos_read"  on public.animal_photos;
drop policy if exists "animal_photos_write" on public.animal_photos;
create policy "animal_photos_read"  on public.animal_photos for select using (auth.uid() is not null);
create policy "animal_photos_write" on public.animal_photos for all
  using (public.user_can_write_module('animais'))
  with check (public.user_can_write_module('animais'));

drop policy if exists "animal_births_read"  on public.animal_births;
drop policy if exists "animal_births_write" on public.animal_births;
create policy "animal_births_read"  on public.animal_births for select using (auth.uid() is not null);
create policy "animal_births_write" on public.animal_births for all
  using (public.user_can_write_module('animais'))
  with check (public.user_can_write_module('animais'));

drop policy if exists "animal_treatments_read"  on public.animal_treatments;
drop policy if exists "animal_treatments_write" on public.animal_treatments;
create policy "animal_treatments_read"  on public.animal_treatments for select using (auth.uid() is not null);
create policy "animal_treatments_write" on public.animal_treatments for all
  using (public.user_can_write_module('animais'))
  with check (public.user_can_write_module('animais'));

drop policy if exists "animal_vaccines_read"  on public.animal_vaccines;
drop policy if exists "animal_vaccines_write" on public.animal_vaccines;
create policy "animal_vaccines_read"  on public.animal_vaccines for select using (auth.uid() is not null);
create policy "animal_vaccines_write" on public.animal_vaccines for all
  using (public.user_can_write_module('animais'))
  with check (public.user_can_write_module('animais'));

drop policy if exists "animal_vaccinations_read"  on public.animal_vaccinations;
drop policy if exists "animal_vaccinations_write" on public.animal_vaccinations;
create policy "animal_vaccinations_read"  on public.animal_vaccinations for select using (auth.uid() is not null);
create policy "animal_vaccinations_write" on public.animal_vaccinations for all
  using (public.user_can_write_module('animais'))
  with check (public.user_can_write_module('animais'));
