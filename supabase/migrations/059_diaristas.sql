-- ============================================================================
-- ILNET Finance — DIARISTAS (o calendário de quem veio trabalhar)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 051 e 057 (obras e setores do Estoque).
-- ============================================================================
-- Por que:
--   O diarista não é funcionário fixo: ele vem no dia, faz o serviço e recebe
--   por dia. Quem sabe quem veio é o mesmo cara que já avisa o material usado
--   na obra (o técnico, migration 052) — ele está lá, vê quem trabalhou. Mas
--   ele NÃO cadastra ninguém nem arbitra valor: só marca no calendário o dia
--   que fulano veio e escreve o que ele fez.
--
--   Então são duas tabelas com donos diferentes:
--     • diaristas      → cadastro do chefe (nome, chave PIX, valor da diária)
--     • diarista_dias  → o calendário, onde o técnico marca os dias
--
--   O vínculo com o Estoque é a OBRA: o dia aponta para supply_obras (e para o
--   setor dela), a mesma lista que o técnico já usa para o material. Assim a
--   obra passa a ter as duas metades do custo — o material E a mão de obra.
--
--   O valor da diária é COPIADO para o dia no momento do lançamento
--   (diarista_dias.daily_rate). Se o chefe aumentar a diária em setembro, o que
--   foi trabalhado em agosto continua valendo o preço de agosto — o histórico
--   não pode mudar de valor sozinho.
-- ============================================================================

-- ============================================================================
-- TABELA: diaristas (cadastro do chefe)
-- ============================================================================
create table if not exists public.diaristas (
  id   uuid primary key default uuid_generate_v4(),
  name text not null,

  phone text,
  -- Chave PIX para pagar: o chefe não fica caçando o número no WhatsApp.
  -- Texto livre de propósito (CPF, celular, e-mail ou chave aleatória).
  pix_key text,
  -- Quanto vale um dia de trabalho dele. 0 = ainda não combinado.
  daily_rate numeric(12, 2) not null default 0 check (daily_rate >= 0),

  notes  text,
  active boolean not null default true,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- nome único sem diferenciar maiúscula/minúscula (o app grava em CAIXA ALTA,
-- mas ninguém precisa descobrir isso para o cadastro duplicado ser barrado)
create unique index if not exists uq_diaristas_nome
  on public.diaristas(lower(name));

-- ============================================================================
-- TABELA: diarista_dias (o calendário — um registro por dia trabalhado)
-- ============================================================================
create table if not exists public.diarista_dias (
  id uuid primary key default uuid_generate_v4(),

  diarista_id uuid not null references public.diaristas(id) on delete cascade,
  work_date   date not null,

  -- O que ele fez no dia. É a razão de a tela pedir uma descrição por
  -- lançamento: daqui a dois meses "vim dia 12" não explica nada.
  description text,

  -- O vínculo com o Estoque: a mesma obra (e o mesmo setor) do material.
  -- Apagar a obra NÃO apaga a diária — ela só fica sem obra.
  obra_id   uuid references public.supply_obras(id)        on delete set null,
  sector_id uuid references public.supply_obra_sectors(id) on delete set null,

  -- Valor congelado no lançamento (ver o cabeçalho: o histórico não muda de
  -- preço quando o chefe reajusta a diária).
  daily_rate numeric(12, 2) not null default 0 check (daily_rate >= 0),

  -- Nome de quem marcou, gravado no lançamento: created_by aponta para
  -- auth.users, que não dá para juntar com profiles numa consulta do PostgREST.
  registered_by_name text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  -- Um dia é um dia: o mesmo diarista não pode ter duas diárias na mesma data.
  -- É o que impede o dedo tremido de pagar o dia 12 duas vezes.
  constraint uq_diarista_dia unique (diarista_id, work_date)
);

create index if not exists idx_diarista_dias_diarista on public.diarista_dias(diarista_id);
create index if not exists idx_diarista_dias_data     on public.diarista_dias(work_date desc);
create index if not exists idx_diarista_dias_obra     on public.diarista_dias(obra_id);

-- ============================================================================
-- VIEW: v_diaristas (cadastro + quanto ele já trabalhou)
-- ============================================================================
-- Totais da vida inteira, para o card da lista. O relatório do chefe filtra por
-- período em cima de diarista_dias — aqui é só o retrato de quem é quem.
-- ============================================================================
drop view if exists public.v_diaristas;
create view public.v_diaristas
with (security_invoker = on) as
select
  d.*,
  coalesce(t.days_count, 0)  as days_count,
  coalesce(t.total_value, 0) as total_value,
  t.last_work_date
from public.diaristas d
left join lateral (
  select
    count(*)                     as days_count,
    coalesce(sum(x.daily_rate), 0) as total_value,
    max(x.work_date)             as last_work_date
  from public.diarista_dias x
  where x.diarista_id = d.id
) t on true;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- O cadastro é do chefe; o calendário é do técnico. Por isso as duas tabelas
-- têm políticas diferentes — o técnico escreve na segunda e NUNCA na primeira.
-- ============================================================================
alter table public.diaristas     enable row level security;
alter table public.diarista_dias enable row level security;

-- ── diaristas: quem manda no Estoque cadastra; todo logado lê ────────────────
drop policy if exists "diaristas_read"  on public.diaristas;
drop policy if exists "diaristas_write" on public.diaristas;

create policy "diaristas_read" on public.diaristas
  for select using (auth.uid() is not null);

create policy "diaristas_write" on public.diaristas
  for all
  using (public.user_can_write_module('estoque'))
  with check (public.user_can_write_module('estoque'));

-- ── diarista_dias: o técnico marca o dia, o chefe corrige ───────────────────
drop policy if exists "diarista_dias_read"   on public.diarista_dias;
drop policy if exists "diarista_dias_insert" on public.diarista_dias;
drop policy if exists "diarista_dias_update" on public.diarista_dias;
drop policy if exists "diarista_dias_delete" on public.diarista_dias;

create policy "diarista_dias_read" on public.diarista_dias
  for select using (auth.uid() is not null);

-- marcar o dia: o técnico (é para isso que ele existe) e quem manda no Estoque.
--
-- O ::text não é enfeite: current_user_role() devolve o enum user_role, e o
-- valor 'tecnico' só entra nele na migration 052. Comparando como texto, esta
-- migration roda mesmo que a 052 ainda não tenha sido executada — sem o cast, o
-- Postgres recusa a policy inteira com "invalid input value for enum".
create policy "diarista_dias_insert" on public.diarista_dias
  for insert with check (
    public.current_user_role()::text in ('tecnico', 'admin')
    or public.user_can_write_module('estoque')
  );

-- corrigir o que foi lançado é do chefe: o dia vale dinheiro. O técnico que
-- marcou errado apaga e marca de novo (política de baixo).
create policy "diarista_dias_update" on public.diarista_dias
  for update
  using (public.user_can_write_module('estoque'))
  with check (public.user_can_write_module('estoque'));

-- apagar: o chefe apaga qualquer um; o técnico só o que ele mesmo marcou
create policy "diarista_dias_delete" on public.diarista_dias
  for delete using (
    public.user_can_write_module('estoque') or created_by = auth.uid()
  );
