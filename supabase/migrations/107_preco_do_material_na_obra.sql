-- ============================================================================
-- 107 — Preço do material lançado na obra
-- ============================================================================
-- Até aqui o valor do material na obra era sempre a quantidade × o CUSTO MÉDIO
-- das entradas do item. Não tinha onde corrigir: material que entrou sem preço
-- ficava zerado na obra, e o que foi comprado mais caro (ou mais barato) só
-- dava para acertar mexendo nas entradas — o que muda TODAS as obras de uma vez.
--
-- A saída já tinha a coluna unit_cost (vinha sempre nula). Agora, quando ela
-- está preenchida, é o preço daquele lançamento; vazia, continua valendo o
-- custo médio. O custo médio não muda: ele só olha as ENTRADAS.
--
-- Só as duas views que dão valor à saída mudam — mesmas colunas, na mesma
-- ordem, por isso create or replace (sem drop).
-- ============================================================================

begin;

create or replace view public.v_supply_obra_usage
with (security_invoker = on) as
select
  o.*,
  l.name as local_name,

  r.name         as responsavel_name,
  r.profession   as responsavel_profession,
  r.payment_mode as responsavel_payment_mode,
  r.daily_rate   as responsavel_daily_rate,
  r.meter_rate   as responsavel_meter_rate,
  r.job_rate     as responsavel_job_rate,
  coalesce(rd.days_count, 0) as responsavel_days_count,
  coalesce(rd.days_value, 0) as responsavel_days_value,
  coalesce(ct.contract_value, 0) as contract_value,

  coalesce(u.items_count, 0)     as items_count,
  coalesce(u.movements_count, 0) as movements_count,
  coalesce(u.total_value, 0)     as total_value,
  u.last_usage_at,

  coalesce(d.days_count, 0)      as days_count,
  coalesce(d.workers_count, 0)   as workers_count,
  coalesce(d.labor_value, 0)     as labor_value,
  d.last_work_date,

  coalesce(e.expenses_count, 0)  as expenses_count,
  coalesce(e.expense_value, 0)   as expense_value,
  e.last_expense_date,

  coalesce(v.services_count, 0)  as services_count,
  coalesce(v.service_value, 0)   as service_value,
  v.last_service_date,

  coalesce(u.total_value, 0) + coalesce(d.labor_value, 0)
    + coalesce(e.expense_value, 0) + coalesce(v.service_value, 0) as total_cost
from public.supply_obras o
left join public.supply_locais l on l.id = o.local_id
left join public.diaristas r on r.id = o.responsavel_id
left join lateral (
  select
    count(*)                       as days_count,
    coalesce(sum(z.daily_rate), 0) as days_value
  from public.diarista_dias z
  where z.obra_id = o.id and z.diarista_id = o.responsavel_id
) rd on true
left join lateral (
  select coalesce(sum(k.total_value), 0) as contract_value
  from public.supply_obra_servicos k
  where k.obra_id = o.id and k.is_obra_contract
) ct on true
left join lateral (
  select
    count(distinct m.item_id)                                                  as items_count,
    count(*)                                                                   as movements_count,
    -- o preço do lançamento manda; sem ele, o custo médio do item
    coalesce(sum(m.quantity * coalesce(m.unit_cost, s.avg_unit_cost, 0)), 0)   as total_value,
    max(m.created_at)                                                          as last_usage_at
  from public.supply_movements m
  join public.v_supply_stock s on s.id = m.item_id
  where m.obra_id = o.id and m.type = 'saida'
) u on true
left join lateral (
  select
    count(*)                       as days_count,
    count(distinct x.diarista_id)  as workers_count,
    coalesce(sum(x.daily_rate), 0) as labor_value,
    max(x.work_date)               as last_work_date
  from public.diarista_dias x
  where x.obra_id = o.id
) d on true
left join lateral (
  select
    count(*)                    as expenses_count,
    coalesce(sum(g.amount), 0)  as expense_value,
    max(g.expense_date)         as last_expense_date
  from public.supply_obra_despesas g
  where g.obra_id = o.id
) e on true
left join lateral (
  select
    count(*)                        as services_count,
    coalesce(sum(y.total_value), 0) as service_value,
    max(y.service_date)             as last_service_date
  from public.supply_obra_servicos y
  where y.obra_id = o.id
) v on true;

create or replace view public.v_supply_obra_extrato
with (security_invoker = on) as
select
  m.id,
  m.obra_id,
  'material'::text                                                   as kind,
  m.movement_date                                                    as entry_date,
  i.name                                                             as description,
  i.unit                                                             as unit,
  m.quantity                                                         as quantity,
  -- o preço do lançamento manda; sem ele, o custo médio do item
  round(m.quantity * coalesce(m.unit_cost, s.avg_unit_cost, 0), 2)   as value,
  m.person                                                           as person,
  m.destination                                                      as detail,
  null::text                                                         as category,
  m.notes                                                            as notes,
  m.photo_path                                                       as photo_path,
  m.created_at
from public.supply_movements m
join public.supply_items i on i.id = m.item_id
left join public.v_supply_stock s on s.id = m.item_id
where m.type = 'saida' and m.obra_id is not null

union all

select
  d.id,
  d.obra_id,
  'diaria'::text,
  d.work_date,
  case when d.half_day then 'Meia diária' else 'Diária' end,
  'dia'::text,
  case when d.half_day then 0.5 else 1 end,
  d.daily_rate,
  di.name,
  d.description,
  null::text,
  null::text,
  null::text,
  d.created_at
from public.diarista_dias d
join public.diaristas di on di.id = d.diarista_id
where d.obra_id is not null

union all

select
  g.id,
  g.obra_id,
  'despesa'::text,
  g.expense_date,
  g.description,
  null::text,
  1::numeric,
  g.amount,
  g.person,
  null::text,
  g.category,
  g.notes,
  g.photo_path,
  g.created_at
from public.supply_obra_despesas g

union all

select
  y.id,
  y.obra_id,
  'servico'::text,
  y.service_date,
  case
    when y.is_obra_contract then 'Fechamento da obra · ' || y.service_type
    when y.contract_mode = 'metro' then y.service_type || ' (por metro)'
    else y.service_type || ' (empreita)'
  end,
  case when y.contract_mode = 'metro' then y.unit else null end,
  case when y.contract_mode = 'metro' then y.quantity else 1::numeric end,
  y.total_value,
  c.name,
  coalesce(sec.name, y.description),
  y.service_type,
  y.notes,
  null::text,
  y.created_at
from public.supply_obra_servicos y
left join public.diaristas c on c.id = y.diarista_id
left join public.supply_obra_sectors sec on sec.id = y.sector_id;

commit;
