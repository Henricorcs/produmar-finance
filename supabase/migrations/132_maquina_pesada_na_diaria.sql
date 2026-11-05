-- ============================================================================
-- PRODUMAR — DIÁRIA COM MÁQUINA PESADA: o horímetro vira custo da obra
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 059, 064, 073 e 107.
-- ============================================================================
-- Por que:
--
--   Ao lançar a diária, o encarregado diz em qual obra o colaborador
--   trabalhou. Quando ele passou o dia na retroescavadeira, no trator ou na
--   carregadeira, a máquina também trabalhou para aquela obra — e isso não
--   entrava no custo dela em lugar nenhum.
--
--   Agora a diária pergunta "Usou máquina pesada?". Se sim, o encarregado
--   escolhe a máquina (do cadastro de Máquinas e Veículos) e anota o horímetro
--   de quando começou e de quando parou. A conta é:
--
--       horas = horímetro final − horímetro inicial
--       valor = horas × valor da hora da máquina
--
--   e esse valor entra no custo da obra da diária, junto com material,
--   diárias, serviços e despesas.
--
-- Onde mora cada coisa:
--
--   1) machines.hourly_rate — o VALOR DA HORA da máquina para a obra. É do
--      cadastro da máquina, preenchido por quem cuida da frota (a policy
--      machines_write da 073 já cobre a coluna nova). O encarregado não digita
--      preço: ele só anota o horímetro.
--
--   2) Na diária (diarista_dias), a máquina e os dois horímetros, mais o
--      valor da hora DO DIA (machine_hourly_rate). Mudar o valor da hora da
--      máquina amanhã não mexe no que já foi lançado hoje — igual à diária do
--      colaborador, que também fica gravada no dia.
--
--      Se a máquina ainda não tinha valor da hora quando o dia foi lançado, a
--      coluna fica vazia e a obra usa o valor do cadastro assim que ele for
--      preenchido: as horas nunca se perdem por falta do preço.
--
--   As colunas ficam na própria diária — uma diária, no máximo uma máquina —
--   e por isso seguem a RLS de diarista_dias que já existe (059/060/099):
--   quem pode lançar o dia lança a máquina junto. Não entra tabela nova.
--
--   IMPORTANTE: a máquina NÃO entra no que se paga ao colaborador. O
--   daily_rate continua sendo só a diária dele; o valor da máquina é custo
--   da obra, somado à parte.
--
-- Nada é apagado: entram colunas e as duas views da obra ganham a máquina.
-- Rodar de novo não quebra.
-- ============================================================================

begin;

-- ── 1) O valor da hora no cadastro da máquina ──────────────────────────────
alter table public.machines
  add column if not exists hourly_rate numeric(12, 2);

alter table public.machines drop constraint if exists machines_hourly_rate_check;
alter table public.machines add constraint machines_hourly_rate_check
  check (hourly_rate is null or hourly_rate >= 0);

comment on column public.machines.hourly_rate is
  'Valor da hora da máquina, cobrado da obra quando ela é lançada junto com a diária.';

-- ── 2) A máquina na diária ─────────────────────────────────────────────────
-- Apagar a máquina do cadastro não apaga a diária nem o custo que já foi para
-- a obra: a referência fica vazia e as horas continuam valendo.
alter table public.diarista_dias
  add column if not exists machine_id uuid references public.machines(id) on delete set null,
  add column if not exists hourmeter_start numeric(12, 2),
  add column if not exists hourmeter_end   numeric(12, 2),
  add column if not exists machine_hourly_rate numeric(12, 2);

-- As horas saem SEMPRE da conta do horímetro: ninguém digita um número que
-- desmente os outros dois.
alter table public.diarista_dias
  add column if not exists machine_hours numeric(12, 2)
    generated always as (
      case
        when hourmeter_start is not null and hourmeter_end is not null
          then round(hourmeter_end - hourmeter_start, 2)
      end
    ) stored;

alter table public.diarista_dias drop constraint if exists diarista_dias_horimetro_check;
alter table public.diarista_dias add constraint diarista_dias_horimetro_check
  check (
    (hourmeter_start is null and hourmeter_end is null)
    or (
      hourmeter_start is not null
      and hourmeter_end is not null
      and hourmeter_start >= 0
      and hourmeter_end > hourmeter_start
    )
  );

alter table public.diarista_dias drop constraint if exists diarista_dias_machine_rate_check;
alter table public.diarista_dias add constraint diarista_dias_machine_rate_check
  check (machine_hourly_rate is null or machine_hourly_rate >= 0);

create index if not exists idx_diarista_dias_machine
  on public.diarista_dias(machine_id)
  where machine_id is not null;

comment on column public.diarista_dias.machine_id is
  'Máquina pesada usada no dia (migration 132). O custo vai para a obra da diária.';
comment on column public.diarista_dias.machine_hourly_rate is
  'Valor da hora da máquina no dia do lançamento. Vazio = usa o do cadastro da máquina.';

-- ============================================================================
-- VIEW: v_supply_obra_usage — a obra ganha a máquina no custo
-- ============================================================================
-- Mesmas colunas da 107, na mesma ordem; o total_cost passa a somar a
-- máquina e três colunas novas entram NO FIM (por isso create or replace,
-- sem drop — nada que lê a view quebra).
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
    + coalesce(e.expense_value, 0) + coalesce(v.service_value, 0)
    + coalesce(mq.machine_value, 0) as total_cost,

  coalesce(mq.machine_uses_count, 0) as machine_uses_count,
  coalesce(mq.machine_hours, 0)      as machine_hours,
  coalesce(mq.machine_value, 0)      as machine_value
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
) v on true
left join lateral (
  -- a máquina usada nas diárias desta obra: o valor do dia manda; sem ele,
  -- o valor da hora do cadastro da máquina
  select
    count(*)                              as machine_uses_count,
    coalesce(sum(x.machine_hours), 0)     as machine_hours,
    coalesce(sum(round(
      x.machine_hours * coalesce(x.machine_hourly_rate, mm.hourly_rate, 0), 2
    )), 0)                                as machine_value
  from public.diarista_dias x
  left join public.machines mm on mm.id = x.machine_id
  where x.obra_id = o.id and x.machine_hours is not null
) mq on true;

-- ============================================================================
-- VIEW: v_supply_obra_extrato — cada uso de máquina vira uma linha
-- ============================================================================
-- Mesmas colunas da 107. Entra uma quinta origem, kind = 'maquina':
--   description → o nome da máquina
--   unit/qty    → 'h' e as horas usadas
--   value       → horas × valor da hora
--   person      → o colaborador que operou
--   detail      → o horímetro, de onde a conta saiu
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
left join public.supply_obra_sectors sec on sec.id = y.sector_id

union all

-- a máquina pesada usada na diária (o id é o da diária: a linha se acerta
-- abrindo o dia em Colaboradores)
select
  d.id,
  d.obra_id,
  'maquina'::text,
  d.work_date,
  coalesce(mm.name, 'Máquina'),
  'h'::text,
  d.machine_hours,
  round(d.machine_hours * coalesce(d.machine_hourly_rate, mm.hourly_rate, 0), 2),
  di.name,
  'Horímetro ' || replace(trim_scale(d.hourmeter_start)::text, '.', ',')
    || ' → ' || replace(trim_scale(d.hourmeter_end)::text, '.', ','),
  null::text,
  null::text,
  null::text,
  d.created_at
from public.diarista_dias d
join public.diaristas di on di.id = d.diarista_id
left join public.machines mm on mm.id = d.machine_id
where d.obra_id is not null and d.machine_hours is not null;

commit;
