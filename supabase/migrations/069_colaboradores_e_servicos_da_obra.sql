-- ============================================================================
-- PRODUMAR — COLABORADORES (era "Diaristas") + SERVIÇO CONTRATADO NO SETOR
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 057, 059, 063, 064, 066, 067 e 068.
-- ============================================================================
-- Por que:
--
--   1) NEM TODO MUNDO É DIARISTA. O mesmo cadastro que guarda quem vem por dia
--      guarda também o EMPREITEIRO — o pedreiro que fecha o serviço por preço
--      combinado, não por dia. Faltava dizer no cadastro qual é qual, e qual é
--      a PROFISSÃO da pessoa (pedreiro, pintor, carpinteiro...). São só duas
--      colunas novas: quem já está cadastrado continua diarista, como sempre foi.
--
--   2) O SETOR NÃO DIZIA O QUE FOI FEITO NELE. O setor era só um nome ("curral",
--      "entrada"). Agora ele diz QUAL SERVIÇO foi feito ali e COMO o profissional
--      foi contratado:
--        • EMPREITA  → o valor fechado do serviço;
--        • POR METRO → o valor do metro × a metragem (ou a quantidade).
--      Das duas sai o MESMO número: quanto se deve ao profissional.
--
--   3) ESSE NÚMERO ENTRA NA CONTA DO COLABORADOR. O serviço aponta para quem o
--      fez, e a partir daí ele soma no "valor a receber" da ficha, é descontado
--      pelos adiantamentos e é quitado no MESMO acerto das diárias (068) — um
--      empreiteiro fecha a conta do mesmo jeito que um diarista.
--
--   Por que uma tabela nova e não colunas no setor: um setor recebe mais de um
--   serviço ao longo da obra (a cerca, depois a pintura do mourão), cada um com
--   o seu profissional e o seu preço. Uma coluna só guardaria o último.
--
--   Isto NÃO é o metro de cerca da migration 063. Lá é PRODUÇÃO — quanto de
--   cerca andou, lançado pelo técnico. Aqui é CUSTO — quanto se paga a quem fez.
--
-- Nada é apagado e nada muda de lugar: entram duas colunas, uma tabela e as
-- views recriadas. Rodar de novo não quebra nada.
-- ============================================================================

-- ============================================================================
-- 1) O CADASTRO: diarista ou empreiteiro, e a profissão
-- ============================================================================
-- A tabela continua se chamando `diaristas` de propósito: renomear quebraria
-- todas as chaves estrangeiras (dias, vales, acertos) sem ganhar nada. O nome
-- que mudou é o da TELA — "Colaboradores".
alter table public.diaristas
  add column if not exists worker_type text not null default 'diarista',
  add column if not exists profession  text;

alter table public.diaristas drop constraint if exists diaristas_worker_type_check;
alter table public.diaristas add constraint diaristas_worker_type_check
  check (worker_type in ('diarista', 'empreiteiro'));

comment on column public.diaristas.worker_type is
  'diarista = ganha por dia (calendario); empreiteiro = ganha por servico fechado';
comment on column public.diaristas.profession is
  'Pedreiro, pintor, carpinteiro... texto livre, em caixa alta';

-- ============================================================================
-- 2) TABELA: supply_obra_servicos (o serviço contratado, dentro do setor)
-- ============================================================================
-- Um lançamento = um serviço combinado com um profissional, num setor da obra.
create table if not exists public.supply_obra_servicos (
  id uuid primary key default uuid_generate_v4(),

  -- A obra é obrigatória: serviço sem obra não entra em conta nenhuma.
  obra_id uuid not null references public.supply_obras(id) on delete cascade,
  -- O setor é ONDE o serviço foi feito. Apagar o setor não apaga o serviço.
  sector_id uuid references public.supply_obra_sectors(id) on delete set null,

  -- QUAL SERVIÇO: CERCA, ALVENARIA, PINTURA... texto livre, com sugestões na
  -- tela. Livre porque cada obra inventa um serviço que a lista não previu.
  service_type text not null,

  -- QUEM FEZ. Nulo = ainda não se sabe (o custo é da obra, mas não entra na
  -- conta de ninguém). Apagar o colaborador não apaga o serviço da obra.
  diarista_id uuid references public.diaristas(id) on delete set null,

  -- COMO FOI CONTRATADO — é o que decide de onde sai o valor:
  --   'empreita' → contract_amount (preço fechado)
  --   'metro'    → rate_per_unit × quantity
  contract_mode text not null default 'empreita'
    check (contract_mode in ('empreita', 'metro')),

  contract_amount numeric(12, 2) not null default 0 check (contract_amount >= 0),
  rate_per_unit   numeric(12, 2) not null default 0 check (rate_per_unit   >= 0),
  quantity        numeric(12, 2) not null default 0 check (quantity        >= 0),
  -- M, M2, UN... só rótulo, para a tela dizer "120 M" e não "120".
  unit text not null default 'M',

  service_date date not null default current_date,
  description text,
  notes       text,

  -- O VALOR A PAGAR, calculado pelo banco. Fica aqui, e não na tela, para toda
  -- soma (obra, ficha do colaborador, acerto) enxergar o mesmo número.
  total_value numeric(12, 2) generated always as (
    case
      when contract_mode = 'metro' then round(rate_per_unit * quantity, 2)
      else contract_amount
    end
  ) stored,

  -- Em qual acerto este serviço foi pago (068). Nulo = ainda se deve.
  -- `set null` como nas diárias: desfazer o acerto devolve o serviço em aberto.
  acerto_id uuid references public.diarista_acertos(id) on delete set null,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_supply_obra_servicos_obra
  on public.supply_obra_servicos(obra_id);
create index if not exists idx_supply_obra_servicos_setor
  on public.supply_obra_servicos(sector_id);
create index if not exists idx_supply_obra_servicos_colab
  on public.supply_obra_servicos(diarista_id);
create index if not exists idx_supply_obra_servicos_acerto
  on public.supply_obra_servicos(acerto_id);
create index if not exists idx_supply_obra_servicos_data
  on public.supply_obra_servicos(service_date desc);

alter table public.supply_obra_servicos enable row level security;

drop policy if exists "supply_obra_servicos_read"  on public.supply_obra_servicos;
drop policy if exists "supply_obra_servicos_write" on public.supply_obra_servicos;

-- leitura: qualquer um logado, como o resto da obra
create policy "supply_obra_servicos_read" on public.supply_obra_servicos
  for select using (auth.uid() is not null);

-- escrita: é preço combinado, é dinheiro — só quem manda no Estoque ou em Obras
-- (a tela mora no módulo Obras, mas a obra é a do Estoque, ver a migration 065)
create policy "supply_obra_servicos_write" on public.supply_obra_servicos
  for all
  using (
    public.user_can_write_module('estoque') or public.user_can_write_module('obras')
  )
  with check (
    public.user_can_write_module('estoque') or public.user_can_write_module('obras')
  );

-- ============================================================================
-- VIEW: v_supply_obra_servicos (o serviço com os nomes já resolvidos)
-- ============================================================================
drop view if exists public.v_supply_obra_servicos;
create view public.v_supply_obra_servicos
with (security_invoker = on) as
select
  s.*,
  o.name     as obra_name,
  o.local_id as local_id,
  sec.name   as sector_name,
  c.name        as worker_name,
  c.worker_type as worker_type,
  c.profession  as worker_profession,
  c.pix_key     as worker_pix_key
from public.supply_obra_servicos s
join public.supply_obras o on o.id = s.obra_id
left join public.supply_obra_sectors sec on sec.id = s.sector_id
left join public.diaristas c on c.id = s.diarista_id;

-- ============================================================================
-- 3) VIEW: v_diaristas — a conta do colaborador soma diária E empreita
-- ============================================================================
-- Mantém tudo o que as migrations 059, 064 e 068 já entregavam. O que muda:
--
--   • total_value   → diárias + serviços (o que ele já rendeu de dinheiro)
--   • pending_value → o que ainda se deve, das duas origens
--   • balance       → pending_value − adiantado (continua podendo ficar negativo)
--
-- `days_value` e `services_value` ficam separados para a tela saber dizer de
-- onde vem cada pedaço, sem refazer conta nenhuma.
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
-- 4) VIEW: v_supply_obra_usage — a obra passa a ter QUATRO origens de gasto
-- ============================================================================
-- total_cost = material + diárias + despesas + serviços contratados.
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

  -- serviço contratado: empreita e metro combinados com o profissional (069)
  coalesce(v.services_count, 0)  as services_count,
  coalesce(v.service_value, 0)   as service_value,
  v.last_service_date,

  -- o que a obra custou de verdade, as quatro origens somadas
  coalesce(u.total_value, 0) + coalesce(d.labor_value, 0)
    + coalesce(e.expense_value, 0) + coalesce(v.service_value, 0) as total_cost
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
-- 5) VIEW: v_supply_obra_extrato — o serviço entra na linha do tempo
-- ============================================================================
--   entry_date  → QUANDO foi (a data do fato, não a de digitação)
--   description → COM O QUE foi (material / "Diária" / a compra / o serviço)
--   value       → QUANTO custou
--   person      → QUEM usou, QUEM trabalhou, de QUEM se comprou, QUEM fez
--   detail      → complemento (destino / o que fez no dia / o setor do serviço)
--   category    → despesa e serviço trazem: é o que agrupa o relatório
--
-- O metro de cerca (migration 063) continua FORA de propósito: ele é o que a
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
