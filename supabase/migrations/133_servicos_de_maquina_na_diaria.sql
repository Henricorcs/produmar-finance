-- ============================================================================
-- PRODUMAR — SERVIÇOS DE MÁQUINA NA DIÁRIA: abre de manhã, fecha à tarde
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 059, 060, 099 e 132.
-- ============================================================================
-- Por que:
--
--   A 132 guardava a máquina dentro da diária: uma máquina, dois horímetros,
--   gravados juntos. Só que o operador não sabe o horímetro final de manhã,
--   quando começa o serviço, e no mesmo dia ele pode fazer mais de um serviço
--   (de manhã gradeia um piquete, à tarde joga calcário em outra área).
--
--   Agora a diária continua sendo UMA (uma por colaborador por dia, é ela que
--   vale dinheiro) e os serviços de máquina ficam nesta tabela nova, quantos
--   forem, cada um com a sua máquina, obra, setor, descrição e horímetros.
--
--   Serviço ABERTO = tem horímetro inicial e ainda não tem o final. Enquanto
--   estiver aberto, ele não entra no custo da obra (não há horas para contar)
--   e o acerto do colaborador não passa aquele dia.
--
-- Permissão:
--
--   O encarregado de obra não pode alterar uma diária já lançada (060: o dia
--   vale dinheiro). Por isso a tabela tem policy própria: quem pode lançar
--   diária para aquele colaborador abre e fecha os serviços dele.
--
-- Nada é apagado: o que já foi lançado pela 132 é COPIADO para a tabela nova.
-- As colunas antigas de diarista_dias ficam lá, mas o sistema para de usar.
-- Rodar de novo não duplica o que já foi copiado.
-- ============================================================================

begin;

-- ── 1) Os serviços de máquina da diária ────────────────────────────────────
create table if not exists public.diarista_dia_maquinas (
  id uuid primary key default uuid_generate_v4(),

  -- apagar a diária leva os serviços dela junto
  dia_id uuid not null references public.diarista_dias(id) on delete cascade,

  -- apagar a máquina ou a obra não apaga o serviço nem as horas
  machine_id uuid references public.machines(id)              on delete set null,
  obra_id    uuid references public.supply_obras(id)          on delete set null,
  sector_id  uuid references public.supply_obra_sectors(id)   on delete set null,

  description text,

  hourmeter_start numeric(12, 2) not null,
  hourmeter_end   numeric(12, 2),

  -- As horas saem SEMPRE da conta do horímetro. Sem o final, fica vazio.
  machine_hours numeric(12, 2)
    generated always as (
      case
        when hourmeter_end is not null
          then round(hourmeter_end - hourmeter_start, 2)
      end
    ) stored,

  -- Valor da hora quando o serviço foi lançado. Vazio = usa o do cadastro.
  machine_hourly_rate numeric(12, 2),

  closed_at  timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint diarista_dia_maquinas_horimetro_check check (
    hourmeter_start >= 0
    and (hourmeter_end is null or hourmeter_end > hourmeter_start)
  ),
  constraint diarista_dia_maquinas_rate_check check (
    machine_hourly_rate is null or machine_hourly_rate >= 0
  )
);

create index if not exists idx_diarista_dia_maquinas_dia
  on public.diarista_dia_maquinas(dia_id);
create index if not exists idx_diarista_dia_maquinas_obra
  on public.diarista_dia_maquinas(obra_id);
create index if not exists idx_diarista_dia_maquinas_machine
  on public.diarista_dia_maquinas(machine_id);

-- Uma pessoa opera uma máquina por vez: no máximo um serviço aberto por diária.
-- É também o que impede o toque duplo de abrir o mesmo serviço duas vezes.
create unique index if not exists uq_diarista_dia_maquina_aberta
  on public.diarista_dia_maquinas(dia_id)
  where hourmeter_end is null;

comment on table public.diarista_dia_maquinas is
  'Serviços de máquina pesada de cada diária. Sem horímetro final = serviço aberto.';

-- ── 2) O que já foi lançado pela 132 vem para a tabela nova ────────────────
insert into public.diarista_dia_maquinas (
  dia_id, machine_id, obra_id, sector_id, description,
  hourmeter_start, hourmeter_end, machine_hourly_rate,
  closed_at, created_by, created_at
)
select
  d.id, d.machine_id, d.obra_id, d.sector_id, d.description,
  d.hourmeter_start, d.hourmeter_end, d.machine_hourly_rate,
  d.created_at, d.created_by, d.created_at
from public.diarista_dias d
where d.hourmeter_start is not null
  and not exists (
    select 1 from public.diarista_dia_maquinas s where s.dia_id = d.id
  );

comment on column public.diarista_dias.machine_id is
  'Aposentada na migration 133: os serviços de máquina ficam em diarista_dia_maquinas.';

-- ── 3) Quem mexe ───────────────────────────────────────────────────────────
-- Ler: todo logado, igual à diária. Abrir e fechar: a mesma regra de lançar
-- diária (099). Apagar: o chefe, ou quem lançou o serviço.
alter table public.diarista_dia_maquinas enable row level security;

drop policy if exists "diarista_dia_maquinas_read"   on public.diarista_dia_maquinas;
drop policy if exists "diarista_dia_maquinas_insert" on public.diarista_dia_maquinas;
drop policy if exists "diarista_dia_maquinas_update" on public.diarista_dia_maquinas;
drop policy if exists "diarista_dia_maquinas_delete" on public.diarista_dia_maquinas;

create policy "diarista_dia_maquinas_read" on public.diarista_dia_maquinas
  for select using (auth.uid() is not null);

create policy "diarista_dia_maquinas_insert" on public.diarista_dia_maquinas
  for insert with check (
    public.current_user_role()::text = 'admin'
    or public.user_can_write_module('diaristas')
    or public.user_can_write_module('estoque')
    or (
      public.current_user_role()::text = 'tecnico'
      and exists (
        select 1
        from public.diarista_dias d
        join public.diarista_tecnicos t on t.diarista_id = d.diarista_id
        where d.id = diarista_dia_maquinas.dia_id
          and t.tecnico_id = auth.uid()
      )
    )
  );

create policy "diarista_dia_maquinas_update" on public.diarista_dia_maquinas
  for update
  using (
    public.current_user_role()::text = 'admin'
    or public.user_can_write_module('diaristas')
    or public.user_can_write_module('estoque')
    or (
      public.current_user_role()::text = 'tecnico'
      and exists (
        select 1
        from public.diarista_dias d
        join public.diarista_tecnicos t on t.diarista_id = d.diarista_id
        where d.id = diarista_dia_maquinas.dia_id
          and t.tecnico_id = auth.uid()
      )
    )
  );

create policy "diarista_dia_maquinas_delete" on public.diarista_dia_maquinas
  for delete using (
    public.current_user_role()::text = 'admin'
    or public.user_can_write_module('diaristas')
    or public.user_can_write_module('estoque')
    or created_by = auth.uid()
  );

-- ============================================================================
-- VIEW: v_supply_obra_usage — o custo da máquina vem dos serviços fechados
-- ============================================================================
-- Mesmas colunas e mesma ordem da 132: só muda de onde a máquina é lida.
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
  -- os serviços de máquina FECHADOS desta obra: o valor gravado manda; sem
  -- ele, o valor da hora do cadastro da máquina. Dois serviços no mesmo dia
  -- contam uma diária só (a tela escreve "N h em N diárias").
  select
    count(distinct x.dia_id)              as machine_uses_count,
    coalesce(sum(x.machine_hours), 0)     as machine_hours,
    coalesce(sum(round(
      x.machine_hours * coalesce(x.machine_hourly_rate, mm.hourly_rate, 0), 2
    )), 0)                                as machine_value
  from public.diarista_dia_maquinas x
  left join public.machines mm on mm.id = x.machine_id
  where x.obra_id = o.id and x.machine_hours is not null
) mq on true;

-- ============================================================================
-- VIEW: v_supply_obra_extrato — cada serviço de máquina vira uma linha
-- ============================================================================
-- Mesmas colunas da 132. A linha da máquina agora tem o que foi feito no
-- detalhe, e cai na obra do serviço, que pode não ser a obra da diária.
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

-- cada serviço de máquina FECHADO é uma linha, na obra do serviço (a linha se
-- acerta abrindo o dia em Colaboradores)
select
  s.id,
  s.obra_id,
  'maquina'::text,
  d.work_date,
  coalesce(mm.name, 'Máquina'),
  'h'::text,
  s.machine_hours,
  round(s.machine_hours * coalesce(s.machine_hourly_rate, mm.hourly_rate, 0), 2),
  di.name,
  coalesce(nullif(s.description, '') || ' · ', '')
    || 'Horímetro ' || replace(trim_scale(s.hourmeter_start)::text, '.', ',')
    || ' → ' || replace(trim_scale(s.hourmeter_end)::text, '.', ','),
  null::text,
  null::text,
  null::text,
  s.created_at
from public.diarista_dia_maquinas s
join public.diarista_dias d on d.id = s.dia_id
join public.diaristas di on di.id = d.diarista_id
left join public.machines mm on mm.id = s.machine_id
where s.obra_id is not null and s.machine_hours is not null;

commit;
