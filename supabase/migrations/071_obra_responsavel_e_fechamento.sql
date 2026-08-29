-- ============================================================================
-- PRODUMAR — OBRAS: o RESPONSÁVEL pela obra e o fechamento com ele
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 069 e 070.
-- ============================================================================
-- Por que:
--   Até aqui o serviço era sempre de um SETOR: "a cerca do curral", "a pintura
--   do galpão". Mas quase toda obra tem um DONO DO SERVIÇO — o empreiteiro que
--   tocou a obra inteira e é com quem o preço foi combinado. Esse acerto não
--   cabe em setor nenhum: ele é da obra.
--
--   Agora a obra diz quem é o responsável, e o sistema já sabe COMO pagar essa
--   pessoa: a forma vem da ficha dela (migration 070) e não se digita de novo.
--
--     • ficha "no valor da obra" → o preço fechado da obra;
--     • ficha "no metro"         → o valor do metro × a metragem da obra;
--     • ficha "na diária"        → não há fechamento a lançar: ele já recebe
--                                  pelos dias marcados no calendário, e a view
--                                  abaixo mostra quantos dias e quanto é.
--
--   O fechamento é gravado como um SERVIÇO da obra (supply_obra_servicos) com
--   `is_obra_contract = true` e sem setor. Por quê, em vez de colunas novas em
--   supply_obras: porque o serviço JÁ SABE cair na conta do colaborador, ser
--   descontado pelos vales e ser quitado no acerto (069). Uma tabela nova
--   duplicaria toda essa máquina para chegar no mesmo lugar.
--
-- Nada é apagado: entram duas colunas, um índice e as views recriadas. Rodar de
-- novo não quebra nada.
-- ============================================================================

-- ============================================================================
-- 1) A OBRA GANHA UM RESPONSÁVEL
-- ============================================================================
-- Apagar o colaborador NÃO apaga a obra: ela só fica sem responsável.
alter table public.supply_obras
  add column if not exists responsavel_id uuid
    references public.diaristas(id) on delete set null;

create index if not exists idx_supply_obras_responsavel
  on public.supply_obras(responsavel_id);

comment on column public.supply_obras.responsavel_id is
  'Quem toca a obra — o colaborador com quem o preço da obra foi combinado';

-- ============================================================================
-- 2) O SERVIÇO SABE SE É O FECHAMENTO DA OBRA
-- ============================================================================
-- true  = é o acerto da obra inteira com o responsável (não tem setor);
-- false = é o serviço de um setor, como sempre foi.
alter table public.supply_obra_servicos
  add column if not exists is_obra_contract boolean not null default false;

-- Uma obra tem UM fechamento. Sem isso, dois cliques no botão criariam dois
-- acertos da mesma obra e o colaborador teria a receber duas vezes.
create unique index if not exists uq_supply_obra_contrato
  on public.supply_obra_servicos(obra_id)
  where is_obra_contract;

comment on column public.supply_obra_servicos.is_obra_contract is
  'true = fechamento da obra inteira com o responsavel; false = servico de setor';

-- ============================================================================
-- 3) VIEW: v_supply_obra_servicos — recriada para enxergar a coluna nova
-- ============================================================================
-- O `select s.*` de uma view é resolvido na CRIAÇÃO dela: coluna acrescentada
-- depois não aparece sozinha.
-- ============================================================================
drop view if exists public.v_supply_obra_servicos;
create view public.v_supply_obra_servicos
with (security_invoker = on) as
select
  s.*,
  o.name     as obra_name,
  o.local_id as local_id,
  sec.name   as sector_name,
  c.name         as worker_name,
  c.worker_type  as worker_type,
  c.profession   as worker_profession,
  c.pix_key      as worker_pix_key,
  c.payment_mode as worker_payment_mode
from public.supply_obra_servicos s
join public.supply_obras o on o.id = s.obra_id
left join public.supply_obra_sectors sec on sec.id = s.sector_id
left join public.diaristas c on c.id = s.diarista_id;

-- ============================================================================
-- 4) VIEW: v_supply_obra_usage — a obra passa a trazer o responsável resolvido
-- ============================================================================
-- Além de tudo o que já entregava (material, diárias, despesas e serviços), a
-- linha da obra agora responde sozinha:
--
--   • QUEM é o responsável, a profissão dele e COMO ele é pago;
--   • o preço combinado com ele para cada forma (metro / obra / dia);
--   • quantas diárias DELE já caíram nesta obra e quanto isso soma — é o que
--     mostra o valor de quem é pago na diária, que não tem fechamento;
--   • o valor do fechamento já lançado, quando existe.
--
-- Assim a tela não precisa carregar o cadastro inteiro nem as diárias de todo
-- mundo só para dizer quanto o responsável tem a receber pela obra.
-- ============================================================================
drop view if exists public.v_supply_obra_usage;
create view public.v_supply_obra_usage
with (security_invoker = on) as
select
  o.*,
  l.name as local_name,

  -- o responsável e o que está combinado com ele (migrations 070 e 071)
  r.name         as responsavel_name,
  r.profession   as responsavel_profession,
  r.payment_mode as responsavel_payment_mode,
  r.daily_rate   as responsavel_daily_rate,
  r.meter_rate   as responsavel_meter_rate,
  r.job_rate     as responsavel_job_rate,
  coalesce(rd.days_count, 0) as responsavel_days_count,
  coalesce(rd.days_value, 0) as responsavel_days_value,
  coalesce(ct.contract_value, 0) as contract_value,

  -- material que saiu do Estoque para esta obra
  coalesce(u.items_count, 0)     as items_count,
  coalesce(u.movements_count, 0) as movements_count,
  coalesce(u.total_value, 0)     as total_value,
  u.last_usage_at,

  -- mão de obra: as diárias lançadas nesta obra
  coalesce(d.days_count, 0)      as days_count,
  coalesce(d.workers_count, 0)   as workers_count,
  coalesce(d.labor_value, 0)     as labor_value,
  d.last_work_date,

  -- despesa avulsa: o que foi comprado ou pago direto para a obra
  coalesce(e.expenses_count, 0)  as expenses_count,
  coalesce(e.expense_value, 0)   as expense_value,
  e.last_expense_date,

  -- serviço contratado: empreita e metro combinados com o profissional (069),
  -- somando o fechamento da obra e os serviços de setor
  coalesce(v.services_count, 0)  as services_count,
  coalesce(v.service_value, 0)   as service_value,
  v.last_service_date,

  -- o que a obra custou de verdade, as quatro origens somadas
  coalesce(u.total_value, 0) + coalesce(d.labor_value, 0)
    + coalesce(e.expense_value, 0) + coalesce(v.service_value, 0) as total_cost
from public.supply_obras o
left join public.supply_locais l on l.id = o.local_id
left join public.diaristas r on r.id = o.responsavel_id
left join lateral (
  -- as diárias DO RESPONSÁVEL nesta obra: é o valor de quem é pago por dia
  select
    count(*)                       as days_count,
    coalesce(sum(z.daily_rate), 0) as days_value
  from public.diarista_dias z
  where z.obra_id = o.id and z.diarista_id = o.responsavel_id
) rd on true
left join lateral (
  -- o fechamento da obra, quando já foi lançado
  select coalesce(sum(k.total_value), 0) as contract_value
  from public.supply_obra_servicos k
  where k.obra_id = o.id and k.is_obra_contract
) ct on true
left join lateral (
  select
    count(distinct m.item_id)                                    as items_count,
    count(*)                                                     as movements_count,
    coalesce(sum(m.quantity * coalesce(s.avg_unit_cost, 0)), 0)  as total_value,
    max(m.created_at)                                            as last_usage_at
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

-- ============================================================================
-- 5) VIEW: v_supply_obra_extrato — o fechamento aparece com o nome certo
-- ============================================================================
-- Mesma linha do tempo das migrations 066/067/069. O que muda é só a descrição
-- do serviço: o fechamento da obra sai como "Fechamento da obra", para quem lê
-- o extrato não confundir o acerto do responsável com um serviço de setor.
-- ============================================================================
drop view if exists public.v_supply_obra_extrato;
create view public.v_supply_obra_extrato
with (security_invoker = on) as
select
  m.id,
  m.obra_id,
  'material'::text                                     as kind,
  m.movement_date                                      as entry_date,
  i.name                                               as description,
  i.unit                                               as unit,
  m.quantity                                           as quantity,
  round(m.quantity * coalesce(s.avg_unit_cost, 0), 2)  as value,
  m.person                                             as person,
  m.destination                                        as detail,
  null::text                                           as category,
  m.notes                                              as notes,
  m.photo_path                                         as photo_path,
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

-- O serviço combinado com o profissional. Na empreita a quantidade é 1 (é um
-- serviço fechado); no metro ela é a metragem, para o extrato mostrar "120 M".
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
