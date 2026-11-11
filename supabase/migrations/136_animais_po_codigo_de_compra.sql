-- PO COM O CÓDIGO DE COMPRA: o gado PO (puro de origem) passa a ser
-- identificado pelo código de compra/registro (ex: GSC 7893, CSCN 21368,
-- GART 1341) no lugar do número de brinco. Quando o número é trocado pela tela
-- "Código de compra", o número de antes fica guardado aqui — a busca por ele
-- continua achando o animal e a ficha mostra "nº antigo".
alter table public.animals add column if not exists tag_antigo text;

comment on column public.animals.tag_antigo is
  'Número que o animal tinha antes de virar o código de compra (gado PO).';

-- A v_animals é recriada para enxergar a coluna nova (o `a.*` é resolvido na
-- criação da view). Mesma definição da 128, sem mudança de regra.
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
