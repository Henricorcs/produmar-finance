-- ============================================================================
-- PRODUMAR — COLABORADORES: a forma de pagamento e o preço de cada uma
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS da migration 069.
-- ============================================================================
-- Por que:
--   A 069 ensinou o sistema a distinguir DIARISTA de EMPREITEIRO, mas o
--   cadastro do empreiteiro só sabia guardar um preço: o da diária. E o
--   empreiteiro quase nunca ganha por dia — ele ganha POR METRO ou PELO VALOR
--   DA OBRA, e o preço dele é combinado UMA VEZ, não a cada serviço.
--
--   Agora o cadastro diz as duas coisas:
--
--     • payment_mode → COMO ele é pago: 'diaria', 'metro' ou 'obra';
--     • o preço unitário de cada uma dessas formas:
--         daily_rate  → o valor do dia   (já existia, migration 059)
--         meter_rate  → o valor do metro (novo)
--         job_rate    → o valor da obra  (novo)
--
--   As três convivem de propósito: o mesmo pedreiro pode ter um preço de metro
--   combinado E vir um dia avulso na diária. `payment_mode` é o que costuma
--   valer — é ele que a tela do serviço já traz preenchido, para ninguém ter
--   que lembrar de cabeça quanto foi combinado com cada um.
--
--   Com isso o lançamento do serviço vira uma conta que se lê em voz alta:
--   "10 metros de cerca a R$ 2,00 = R$ 20,00" — e a soma disso é o que cada um
--   tem a receber.
--
-- Nada é apagado: entram três colunas e a v_diaristas recriada. Rodar de novo
-- não quebra nada.
-- ============================================================================

-- ============================================================================
-- 1) O CADASTRO: como ele é pago e quanto vale cada forma
-- ============================================================================
-- Quem já está cadastrado é pago na diária: era a única forma que existia.
alter table public.diaristas
  add column if not exists payment_mode text           not null default 'diaria',
  add column if not exists meter_rate   numeric(12, 2) not null default 0,
  add column if not exists job_rate     numeric(12, 2) not null default 0;

alter table public.diaristas drop constraint if exists diaristas_payment_mode_check;
alter table public.diaristas add constraint diaristas_payment_mode_check
  check (payment_mode in ('diaria', 'metro', 'obra'));

alter table public.diaristas drop constraint if exists diaristas_meter_rate_check;
alter table public.diaristas add constraint diaristas_meter_rate_check
  check (meter_rate >= 0);

alter table public.diaristas drop constraint if exists diaristas_job_rate_check;
alter table public.diaristas add constraint diaristas_job_rate_check
  check (job_rate >= 0);

comment on column public.diaristas.payment_mode is
  'Como ele costuma ser pago: diaria (por dia), metro (por metro) ou obra (valor fechado)';
comment on column public.diaristas.meter_rate is
  'Preco combinado do metro. 0 = nao combinado.';
comment on column public.diaristas.job_rate is
  'Preco combinado da obra inteira. 0 = nao combinado.';

-- ============================================================================
-- 2) VIEW: v_diaristas — recriada para enxergar as colunas novas
-- ============================================================================
-- O `select d.*` de uma view é resolvido na CRIAÇÃO dela: coluna acrescentada
-- depois NÃO aparece sozinha. Por isso toda migration que mexe em `diaristas`
-- precisa recriar esta view — do contrário o cadastro grava o preço e a tela
-- continua sem ver.
--
-- O conteúdo é o mesmo da 069: diárias + serviços, o que ainda se deve das duas
-- origens, os vales em aberto e o saldo.
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

  -- o que ele já rendeu, as duas origens somadas
  coalesce(t.days_value, 0) + coalesce(v.services_value, 0) as total_value,

  -- ainda não acertado: é o que o chefe deve
  coalesce(p.pending_days, 0)           as pending_days,
  coalesce(p.pending_days_value, 0)     as pending_days_value,
  coalesce(q.pending_services, 0)       as pending_services,
  coalesce(q.pending_services_value, 0) as pending_services_value,
  coalesce(p.pending_days_value, 0) + coalesce(q.pending_services_value, 0)
    as pending_value,

  -- vales em aberto, que saem do valor a receber
  coalesce(a.advance_pending, 0) as advance_pending,

  -- o que sai da mão no próximo acerto
  coalesce(p.pending_days_value, 0) + coalesce(q.pending_services_value, 0)
    - coalesce(a.advance_pending, 0) as balance,

  s.last_settled_on
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
  select max(k.settled_on) as last_settled_on
  from public.diarista_acertos k
  where k.diarista_id = d.id
) s on true;

-- ============================================================================
-- 3) VIEW: v_supply_obra_servicos — recriada pelo mesmo motivo
-- ============================================================================
-- Ela lê colunas de `diaristas` para dizer QUEM fez o serviço. Agora traz junto
-- a forma de pagamento e os preços combinados, para a tela do serviço poder
-- mostrar de onde veio o valor unitário que ela preencheu sozinha.
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
