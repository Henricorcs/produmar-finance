-- ============================================================================
-- PRODUMAR — DIARISTAS: adiantamento e acerto semanal
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 059 e 064.
-- ============================================================================
-- Por que:
--   O calendário já dizia quantos dias o diarista trabalhou, mas não dizia o
--   que ainda se DEVE a ele. Faltavam duas coisas do dia a dia:
--
--   1) ADIANTAMENTO — o diarista pede um dinheiro no meio da semana. Isso não é
--      pagamento do acerto: é um vale, que na hora de acertar se desconta.
--
--   2) ACERTO — no fim da semana o chefe paga. A partir daí aqueles dias estão
--      quitados e não podem entrar na conta da semana seguinte. O acerto guarda
--      quanto era de diária, quanto já tinha sido adiantado e quanto saiu de
--      dinheiro na hora.
--
--   Com as duas, a ficha responde sozinha: VALOR A RECEBER (as diárias ainda
--   não acertadas), VALOR ADIANTADO (os vales ainda não descontados) e SALDO A
--   RECEBER (a diferença) — que é o que o chefe entrega na mão.
--
--   No calendário, o dia já acertado fica CINZA: verde e amarelo passam a
--   significar "ainda devo", e cinza, "já paguei".
--
-- Nada é apagado. Rodar de novo não quebra nada.
-- ============================================================================

-- ============================================================================
-- TABELA: diarista_acertos (o pagamento da semana)
-- ============================================================================
create table if not exists public.diarista_acertos (
  id uuid primary key default uuid_generate_v4(),

  diarista_id uuid not null references public.diaristas(id) on delete cascade,

  -- o dia em que o dinheiro foi entregue
  settled_on date not null default current_date,

  -- Fotografia da conta no momento do acerto. Fica congelada de propósito: se
  -- amanhã alguém corrigir uma diária antiga, o recibo do que foi pago naquele
  -- dia continua contando a mesma história.
  days_total    numeric(12, 2) not null default 0 check (days_total >= 0),
  advance_total numeric(12, 2) not null default 0 check (advance_total >= 0),
  amount_paid   numeric(12, 2) not null default 0,

  notes text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_diarista_acertos_diarista
  on public.diarista_acertos(diarista_id);
create index if not exists idx_diarista_acertos_data
  on public.diarista_acertos(settled_on desc);

-- ============================================================================
-- TABELA: diarista_adiantamentos (o vale)
-- ============================================================================
-- acerto_id nulo = vale ainda em aberto, será descontado no próximo acerto.
create table if not exists public.diarista_adiantamentos (
  id uuid primary key default uuid_generate_v4(),

  diarista_id uuid not null references public.diaristas(id) on delete cascade,

  advance_date date not null default current_date,
  amount       numeric(12, 2) not null check (amount > 0),
  notes        text,

  -- Desfazer o acerto devolve o vale para "em aberto" — por isso set null, e
  -- não cascade: o dinheiro adiantado existiu, apagar o acerto não o desfaz.
  acerto_id uuid references public.diarista_acertos(id) on delete set null,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_diarista_adiantamentos_diarista
  on public.diarista_adiantamentos(diarista_id);
create index if not exists idx_diarista_adiantamentos_acerto
  on public.diarista_adiantamentos(acerto_id);

-- ============================================================================
-- diarista_dias: o dia passa a saber se já foi pago
-- ============================================================================
-- Nulo = ainda não acertado (verde/amarelo no calendário).
-- Preenchido = já foi pago naquele acerto (cinza).
alter table public.diarista_dias
  add column if not exists acerto_id uuid
    references public.diarista_acertos(id) on delete set null;

create index if not exists idx_diarista_dias_acerto on public.diarista_dias(acerto_id);

-- ============================================================================
-- VIEW: v_diaristas — agora também com o que ainda se deve
-- ============================================================================
-- Mantém tudo o que as migrations 059 e 064 já entregavam e acrescenta as três
-- contas da ficha. `balance` pode ficar NEGATIVO: é quando o diarista pegou
-- mais adiantado do que trabalhou — nesse caso ele é que está devendo, e o
-- saldo segue para a semana seguinte.
-- ============================================================================
drop view if exists public.v_diaristas;
create view public.v_diaristas
with (security_invoker = on) as
select
  d.*,
  coalesce(t.days_count, 0)      as days_count,
  coalesce(t.half_days_count, 0) as half_days_count,
  coalesce(t.total_value, 0)     as total_value,
  t.last_work_date,

  -- ainda não acertado: é o que o chefe deve
  coalesce(p.pending_days, 0)     as pending_days,
  coalesce(p.pending_value, 0)    as pending_value,
  -- vales em aberto, que saem do valor a receber
  coalesce(a.advance_pending, 0)  as advance_pending,
  -- o que sai da mão no próximo acerto
  coalesce(p.pending_value, 0) - coalesce(a.advance_pending, 0) as balance,

  s.last_settled_on
from public.diaristas d
left join lateral (
  select
    count(*)                                   as days_count,
    count(*) filter (where x.half_day)         as half_days_count,
    coalesce(sum(x.daily_rate), 0)             as total_value,
    max(x.work_date)                           as last_work_date
  from public.diarista_dias x
  where x.diarista_id = d.id
) t on true
left join lateral (
  select
    count(*)                       as pending_days,
    coalesce(sum(x.daily_rate), 0) as pending_value
  from public.diarista_dias x
  where x.diarista_id = d.id and x.acerto_id is null
) p on true
left join lateral (
  select coalesce(sum(v.amount), 0) as advance_pending
  from public.diarista_adiantamentos v
  where v.diarista_id = d.id and v.acerto_id is null
) a on true
left join lateral (
  select max(k.settled_on) as last_settled_on
  from public.diarista_acertos k
  where k.diarista_id = d.id
) s on true;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Dinheiro é do chefe: o técnico marca o dia, mas vale e acerto só quem manda
-- no Estoque mexe. A leitura é liberada para qualquer logado, como no resto.
-- ============================================================================
alter table public.diarista_acertos        enable row level security;
alter table public.diarista_adiantamentos  enable row level security;

drop policy if exists "diarista_acertos_read"        on public.diarista_acertos;
drop policy if exists "diarista_acertos_write"       on public.diarista_acertos;
drop policy if exists "diarista_adiantamentos_read"  on public.diarista_adiantamentos;
drop policy if exists "diarista_adiantamentos_write" on public.diarista_adiantamentos;

create policy "diarista_acertos_read" on public.diarista_acertos
  for select using (auth.uid() is not null);
create policy "diarista_acertos_write" on public.diarista_acertos
  for all
  using (public.user_can_write_module('estoque'))
  with check (public.user_can_write_module('estoque'));

create policy "diarista_adiantamentos_read" on public.diarista_adiantamentos
  for select using (auth.uid() is not null);
create policy "diarista_adiantamentos_write" on public.diarista_adiantamentos
  for all
  using (public.user_can_write_module('estoque'))
  with check (public.user_can_write_module('estoque'));
