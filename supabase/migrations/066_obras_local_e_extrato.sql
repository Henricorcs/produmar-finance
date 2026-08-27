-- ============================================================================
-- PRODUMAR — OBRAS: local da obra, custo cheio e extrato de gastos
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 051, 057, 059, 063 e 064.
-- ============================================================================
-- Por que:
--
--   1) LOCAL — a obra passa a dizer ONDE ela acontece (Fazenda 01, Fazenda 02,
--      Sítio, ...). Antes o lugar ficava grudado no nome da obra ("CERCAS
--      FAZENDA 01") e não dava para somar o gasto de uma fazenda inteira. Agora
--      é um cadastro à parte e livre: o dono cria quantos locais quiser, e a
--      mesma fazenda pode ter várias obras (cerca, baia, curral).
--
--   2) CUSTO CHEIO — a obra já tinha as duas metades do gasto no banco, mas a
--      tela só somava uma. O material vem das saídas do Estoque (migration
--      051); a mão de obra vem das diárias, que já apontam para a obra desde a
--      migration 059. Agora total_cost = material + diárias.
--
--   3) EXTRATO — uma view só, em linha do tempo, com tudo que a obra gastou:
--      QUANDO foi, COM O QUE foi, QUANTO custou e QUEM usou. É o que responde
--      "quanto gastei na cerca da Fazenda 01 em março e quem pegou o material".
--
-- Nada é apagado e nada muda de lugar: só entram uma tabela, uma coluna e duas
-- views. Rodar de novo não quebra nada.
-- ============================================================================

-- ============================================================================
-- TABELA: supply_locais (onde a obra acontece)
-- ============================================================================
create table if not exists public.supply_locais (
  id   uuid primary key default uuid_generate_v4(),
  name text not null,

  notes  text,
  active boolean not null default true,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- o nome é único sem diferenciar maiúscula de minúscula: o app grava em CAIXA
-- ALTA, mas ninguém precisa saber disso para o cadastro repetido ser barrado
create unique index if not exists uq_supply_locais_nome
  on public.supply_locais(lower(name));

alter table public.supply_locais enable row level security;

drop policy if exists "supply_locais_read"  on public.supply_locais;
drop policy if exists "supply_locais_write" on public.supply_locais;

-- leitura: qualquer um logado (o técnico precisa ver para se achar na obra)
create policy "supply_locais_read" on public.supply_locais
  for select using (auth.uid() is not null);

-- cadastro: só quem manda no Estoque — o local é do chefe, como a obra
create policy "supply_locais_write" on public.supply_locais
  for all
  using (public.user_can_write_module('estoque'))
  with check (public.user_can_write_module('estoque'));

-- ============================================================================
-- supply_obras ganha o local
-- ============================================================================
-- Apagar o local NÃO apaga a obra: ela só fica sem local.
alter table public.supply_obras
  add column if not exists local_id uuid
    references public.supply_locais(id) on delete set null;

create index if not exists idx_supply_obras_local on public.supply_obras(local_id);

-- ============================================================================
-- VIEW: v_supply_obra_usage (obra + local + material + mão de obra)
-- ============================================================================
-- Mantém tudo o que a 051 já entregava e acrescenta o local e a mão de obra.
-- O valor do material segue usando o custo médio do item, o mesmo critério do
-- "valor em estoque"; a diária usa o valor congelado no lançamento (na meia
-- diária o daily_rate já vem pela metade — migration 064).
-- ============================================================================
drop view if exists public.v_supply_obra_usage;
create view public.v_supply_obra_usage
with (security_invoker = on) as
select
  o.*,
  l.name as local_name,

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

  -- o que a obra custou de verdade, as duas metades somadas
  coalesce(u.total_value, 0) + coalesce(d.labor_value, 0) as total_cost
from public.supply_obras o
left join public.supply_locais l on l.id = o.local_id
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
) d on true;

-- ============================================================================
-- VIEW: v_supply_obra_extrato (a linha do tempo do gasto da obra)
-- ============================================================================
-- Uma linha por gasto, das duas origens, com as mesmas colunas:
--
--   entry_date  → QUANDO foi (a data do fato, não a de digitação)
--   description → COM O QUE foi (nome do material / "Diária")
--   value       → QUANTO custou
--   person      → QUEM usou o material / QUEM trabalhou o dia
--   detail      → complemento (destino do material / o que fez no dia)
--
-- O metro de cerca (migration 063) NÃO entra aqui de propósito: ele é o que a
-- obra PRODUZIU, não o que ela gastou — somar os dois contaria duas vezes.
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
  d.created_at
from public.diarista_dias d
join public.diaristas di on di.id = d.diarista_id
where d.obra_id is not null;
