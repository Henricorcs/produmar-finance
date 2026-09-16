-- ============================================================================
-- PRODUMAR — COLABORADORES: o funcionário CLT (salário do mês e adiantamento)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 068, 069 e 070.
-- ============================================================================
-- Por que:
--   O cadastro só conhecia quem ganha por DIA (diarista) e quem ganha por
--   SERVIÇO (empreiteiro). Faltava o funcionário de carteira assinada, que
--   ganha um SALÁRIO POR MÊS — e é com ele que mais se usa o adiantamento:
--
--     • no meio do mês ele pega um ADIANTAMENTO (o vale, que já existe desde
--       a 068 e é lançado do mesmo jeito);
--     • no fim do mês se paga o SALDO: o salário menos o que ele já pegou.
--
--   O pagamento do saldo é um ACERTO como o do diarista, só que ele diz DE QUAL
--   MÊS é o salário (reference_month). Com isso:
--
--     • o mesmo mês não é pago duas vezes (o índice único abaixo barra);
--     • o adiantamento que entra no desconto é o que foi pego até o último dia
--       daquele mês — o vale do mês seguinte fica para o salário seguinte.
--
-- Nada é apagado: entram duas colunas no acerto, uma no cadastro, e a
-- v_diaristas é recriada. Rodar de novo não quebra nada.
-- ============================================================================

-- ============================================================================
-- 1) O CADASTRO: CLT vira um tipo, com o salário do mês
-- ============================================================================
alter table public.diaristas drop constraint if exists diaristas_worker_type_check;
alter table public.diaristas add constraint diaristas_worker_type_check
  check (worker_type in ('diarista', 'empreiteiro', 'clt'));

alter table public.diaristas
  add column if not exists monthly_salary numeric(12, 2) not null default 0;

alter table public.diaristas drop constraint if exists diaristas_monthly_salary_check;
alter table public.diaristas add constraint diaristas_monthly_salary_check
  check (monthly_salary >= 0);

comment on column public.diaristas.worker_type is
  'diarista = ganha por dia (calendario); empreiteiro = ganha por servico fechado; clt = salario mensal';
comment on column public.diaristas.monthly_salary is
  'Salario do mes do CLT. 0 = nao informado. Diarista e empreiteiro ficam com 0.';

-- ============================================================================
-- 2) O ACERTO: de qual mês é o salário pago
-- ============================================================================
-- reference_month é sempre o PRIMEIRO dia do mês (2026-09-01 = setembro/2026).
-- Nulo = acerto de diária/serviço, como sempre foi.
--
-- salary_total é a fotografia do salário naquele pagamento — como o days_total
-- da 068: aumento de salário amanhã não reescreve o recibo de ontem. O
-- days_total continua sendo TUDO o que ele tinha a receber (salário + diárias
-- + serviços), para amount_paid = days_total − advance_total seguir valendo.
alter table public.diarista_acertos
  add column if not exists reference_month date,
  add column if not exists salary_total    numeric(12, 2) not null default 0;

alter table public.diarista_acertos drop constraint if exists diarista_acertos_salary_total_check;
alter table public.diarista_acertos add constraint diarista_acertos_salary_total_check
  check (salary_total >= 0);

alter table public.diarista_acertos drop constraint if exists diarista_acertos_reference_month_check;
alter table public.diarista_acertos add constraint diarista_acertos_reference_month_check
  check (reference_month is null or extract(day from reference_month) = 1);

-- o mesmo salário não sai duas vezes
create unique index if not exists uq_diarista_acerto_mes
  on public.diarista_acertos(diarista_id, reference_month)
  where reference_month is not null;

comment on column public.diarista_acertos.reference_month is
  'CLT: primeiro dia do mes do salario pago. Nulo nos acertos de diaria/servico.';
comment on column public.diarista_acertos.salary_total is
  'CLT: o salario do mes no momento do pagamento (congelado).';

-- ============================================================================
-- 3) VIEW: v_diaristas — o CLT tem um salário a receber
-- ============================================================================
-- O `select d.*` é resolvido na criação da view (ver a 070): a coluna nova só
-- aparece recriando. O que muda em relação à 070:
--
--   • salary_pending → o salário do próximo mês a fechar. Para o CLT ativo é
--     sempre UM salário: sempre existe um mês esperando o saldo. Diarista,
--     empreiteiro e CLT arquivado ficam com 0;
--   • pending_value e balance passam a somar esse salário — para diarista e
--     empreiteiro nada muda, porque o salário deles é 0;
--   • last_reference_month → o último mês de salário pago.
-- ============================================================================
drop view if exists public.v_diaristas;
create view public.v_diaristas
with (security_invoker = on) as
select
  d.*,
  coalesce(t.days_count, 0)      as days_count,
  coalesce(t.half_days_count, 0) as half_days_count,
  coalesce(t.days_value, 0)      as days_value,
  t.last_work_date,

  -- serviços por empreita / por metro (migration 069)
  coalesce(v.services_count, 0)  as services_count,
  coalesce(v.services_value, 0)  as services_value,
  v.last_service_date,

  -- o que ele já rendeu em diária e serviço, as duas origens somadas
  coalesce(t.days_value, 0) + coalesce(v.services_value, 0) as total_value,

  -- ainda não acertado: é o que o chefe deve
  coalesce(p.pending_days, 0)           as pending_days,
  coalesce(p.pending_days_value, 0)     as pending_days_value,
  coalesce(q.pending_services, 0)       as pending_services,
  coalesce(q.pending_services_value, 0) as pending_services_value,

  -- o salário do mês que ainda vai ser pago (CLT ativo)
  case when d.worker_type = 'clt' and d.active then d.monthly_salary else 0 end
    as salary_pending,

  coalesce(p.pending_days_value, 0) + coalesce(q.pending_services_value, 0)
    + case when d.worker_type = 'clt' and d.active then d.monthly_salary else 0 end
    as pending_value,

  -- vales em aberto, que saem do valor a receber
  coalesce(a.advance_pending, 0) as advance_pending,

  -- o que sai da mão no próximo acerto
  coalesce(p.pending_days_value, 0) + coalesce(q.pending_services_value, 0)
    + case when d.worker_type = 'clt' and d.active then d.monthly_salary else 0 end
    - coalesce(a.advance_pending, 0) as balance,

  s.last_settled_on,
  s.last_reference_month
from public.diaristas d
left join lateral (
  select
    count(*)                           as days_count,
    count(*) filter (where x.half_day) as half_days_count,
    coalesce(sum(x.daily_rate), 0)     as days_value,
    max(x.work_date)                   as last_work_date
  from public.diarista_dias x
  where x.diarista_id = d.id
) t on true
left join lateral (
  select
    count(*)                        as services_count,
    coalesce(sum(y.total_value), 0) as services_value,
    max(y.service_date)             as last_service_date
  from public.supply_obra_servicos y
  where y.diarista_id = d.id
) v on true
left join lateral (
  select
    count(*)                       as pending_days,
    coalesce(sum(x.daily_rate), 0) as pending_days_value
  from public.diarista_dias x
  where x.diarista_id = d.id and x.acerto_id is null
) p on true
left join lateral (
  select
    count(*)                        as pending_services,
    coalesce(sum(y.total_value), 0) as pending_services_value
  from public.supply_obra_servicos y
  where y.diarista_id = d.id and y.acerto_id is null
) q on true
left join lateral (
  select coalesce(sum(w.amount), 0) as advance_pending
  from public.diarista_adiantamentos w
  where w.diarista_id = d.id and w.acerto_id is null
) a on true
left join lateral (
  select
    max(k.settled_on)      as last_settled_on,
    max(k.reference_month) as last_reference_month
  from public.diarista_acertos k
  where k.diarista_id = d.id
) s on true;
