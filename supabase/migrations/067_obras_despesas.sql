-- ============================================================================
-- PRODUMAR — OBRAS: despesa avulsa da obra
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS da migration 066.
-- ============================================================================
-- Por que:
--   Nem todo gasto de obra passa pelo Estoque ou pela folha do diarista. O
--   cimento entregue direto na porta, o combustível, o frete, o serviço de
--   terceiro, o aluguel da máquina — nada disso tinha onde ser lançado, e numa
--   obra costuma ser uma fatia grande do dinheiro.
--
--   Agora a obra tem a sua própria despesa: data, o que foi, quanto, quem, a
--   categoria e a foto do comprovante. Ela entra no mesmo extrato e no mesmo
--   total das outras duas origens.
--
--   IMPORTANTE: isto NÃO conversa com o módulo Contas. É registro e relatório
--   dentro de Obras — lançar despesa aqui não cria lançamento em Contas, e o
--   que está em Contas não aparece aqui. Essa ligação fica para depois.
--
-- Nada é apagado: entram uma tabela e as duas views recriadas. Rodar de novo
-- não quebra nada.
-- ============================================================================

-- ============================================================================
-- TABELA: supply_obra_despesas
-- ============================================================================
-- Apagar a obra APAGA as despesas dela: diferente do material e da diária, a
-- despesa não tem vida própria fora da obra — ela nasceu para aquela obra.
create table if not exists public.supply_obra_despesas (
  id uuid primary key default uuid_generate_v4(),

  obra_id uuid not null references public.supply_obras(id) on delete cascade,

  -- a data do gasto, não a da digitação
  expense_date date not null default current_date,

  -- combustível, serviço de terceiro, compra direta... texto livre com
  -- sugestões na tela: é o que agrupa o relatório
  category text,

  description text not null,
  amount      numeric(12, 2) not null check (amount >= 0),

  -- de quem comprou, quem fez o serviço, quem recebeu o dinheiro
  person text,

  -- comprovante no bucket attachments, o mesmo do resto do sistema
  photo_path text,

  notes text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_supply_obra_despesas_obra
  on public.supply_obra_despesas(obra_id);
create index if not exists idx_supply_obra_despesas_data
  on public.supply_obra_despesas(expense_date desc);

alter table public.supply_obra_despesas enable row level security;

drop policy if exists "supply_obra_despesas_read"  on public.supply_obra_despesas;
drop policy if exists "supply_obra_despesas_write" on public.supply_obra_despesas;

-- leitura: qualquer um logado, como o resto da obra
create policy "supply_obra_despesas_read" on public.supply_obra_despesas
  for select using (auth.uid() is not null);

-- lançar/editar/apagar: só quem manda no Estoque — é dinheiro, é do chefe
create policy "supply_obra_despesas_write" on public.supply_obra_despesas
  for all
  using (public.user_can_write_module('estoque'))
  with check (public.user_can_write_module('estoque'));

-- ============================================================================
-- VIEW: v_supply_obra_usage — agora com a terceira origem de gasto
-- ============================================================================
-- total_cost = material + mão de obra + despesas.
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

  -- despesa avulsa: o que foi comprado ou pago direto para a obra
  coalesce(e.expenses_count, 0)  as expenses_count,
  coalesce(e.expense_value, 0)   as expense_value,
  e.last_expense_date,

  -- o que a obra custou de verdade, as três origens somadas
  coalesce(u.total_value, 0) + coalesce(d.labor_value, 0) + coalesce(e.expense_value, 0)
    as total_cost
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
) d on true
left join lateral (
  select
    count(*)                    as expenses_count,
    coalesce(sum(g.amount), 0)  as expense_value,
    max(g.expense_date)         as last_expense_date
  from public.supply_obra_despesas g
  where g.obra_id = o.id
) e on true;

-- ============================================================================
-- VIEW: v_supply_obra_extrato — a linha do tempo, agora com três origens
-- ============================================================================
--   entry_date  → QUANDO foi (a data do fato, não a de digitação)
--   description → COM O QUE foi (material / "Diária" / o que foi comprado)
--   value       → QUANTO custou
--   person      → QUEM usou, QUEM trabalhou, ou de QUEM se comprou
--   detail      → complemento (destino do material / o que fez no dia)
--   category    → só a despesa tem: é o que agrupa o relatório
--
-- A linha traz também `notes` e `photo_path` porque a tela edita a despesa a
-- partir do próprio extrato — assim não precisa de uma segunda consulta.
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
from public.supply_obra_despesas g;
