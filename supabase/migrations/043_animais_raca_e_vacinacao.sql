-- ============================================================================
-- ILNET Finance — Animais: "tipo" vira RAÇA e o módulo fica só de vacinação
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 041 e 042.
-- ============================================================================
-- O que muda:
--   • animal_types → animal_breeds e animals.type_id → animals.breed_id
--     (o cadastro sempre foi de raça: nelore, angus, girolando...).
--   • A view v_animals deixa de trazer os agregados de tratamento e parto —
--     o módulo passou a ser só de vacinação, com a ficha do animal servindo
--     de guia impresso na hora de vacinar.
--
-- As tabelas animal_treatments e animal_births NÃO são apagadas: ficam no banco
-- sem uso, para não perder nada que já tenha sido lançado. Se quiser limpar de
-- vez: drop table public.animal_treatments, public.animal_births;
-- ============================================================================

-- ── A view depende das colunas renomeadas: recriada no fim ───────────────────
drop view if exists public.v_animals;

-- ── animal_types → animal_breeds ─────────────────────────────────────────────
alter table if exists public.animal_types rename to animal_breeds;

-- ── animals.type_id → animals.breed_id ───────────────────────────────────────
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'animals' and column_name = 'type_id'
  ) then
    alter table public.animals rename column type_id to breed_id;
  end if;
end $$;

-- ── Policies com o nome novo ─────────────────────────────────────────────────
drop policy if exists "animal_types_read"   on public.animal_breeds;
drop policy if exists "animal_types_write"  on public.animal_breeds;
drop policy if exists "animal_breeds_read"  on public.animal_breeds;
drop policy if exists "animal_breeds_write" on public.animal_breeds;

create policy "animal_breeds_read"  on public.animal_breeds for select using (auth.uid() is not null);
create policy "animal_breeds_write" on public.animal_breeds for all
  using (public.user_can_write_module('animais'))
  with check (public.user_can_write_module('animais'));

-- ============================================================================
-- VIEW: v_animals (animal + raça, idade, categoria e situação de vacinação)
-- ============================================================================
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
