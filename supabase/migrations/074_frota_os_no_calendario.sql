-- ============================================================================
-- PRODUMAR — FROTA: a ordem de serviço nasce na ficha, no calendário
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS da migration 073.
-- ============================================================================
-- Por que:
--
--   A ordem de serviço da máquina passa a ser feita DENTRO DA FICHA dela, no
--   calendário do mês — toca no dia e abre a caixa para lançar a OS daquele
--   dia. Para o calendário poder pintar de verde "o dia que tem OS ABERTA", a
--   OS precisa saber se ainda está aberta ou se já foi concluída. Era isso que
--   faltava: até aqui o lançamento só sabia dizer se o dinheiro já tinha
--   entrado (`paid`), e serviço concluído não é a mesma coisa que serviço pago.
--
--   Então são duas perguntas diferentes, cada uma com a sua resposta:
--     status = aberta | concluida  → o SERVIÇO acabou?
--     paid   = true   | false      → o DINHEIRO entrou?
--
--   No calendário: dia com OS aberta fica VERDE; dia em que tudo já foi
--   concluído fica CINZA; dia sem nada continua normal.
--
-- Nada é apagado: entra uma coluna e as duas views são recriadas com ela.
-- Rodar de novo não quebra nada.
-- ============================================================================

-- ============================================================================
-- 1) A OS ESTÁ ABERTA OU JÁ FOI CONCLUÍDA?
-- ============================================================================
-- Nasce ABERTA: quem lança está registrando um serviço combinado/em andamento.
-- Fecha com um toque na própria ficha, ou sozinha quando o serviço é marcado
-- como recebido (dinheiro na mão é serviço acabado).
alter table public.machine_servicos
  add column if not exists status text not null default 'aberta';

alter table public.machine_servicos drop constraint if exists machine_servicos_status_check;
alter table public.machine_servicos add constraint machine_servicos_status_check
  check (status in ('aberta', 'concluida'));

comment on column public.machine_servicos.status is
  'aberta = serviço ainda em andamento (fica verde no calendário); concluida = serviço acabado';

create index if not exists idx_machine_servicos_status
  on public.machine_servicos(status);

-- O que já foi recebido está acabado: fecha o que veio da 073.
update public.machine_servicos set status = 'concluida'
where paid is true and status = 'aberta';

-- ============================================================================
-- 2) VIEW: v_machine_ficha — a mesma da 073, agora com o `status` junto
-- ============================================================================
-- Só o serviço da própria ficha tem situação: a despesa não abre nem fecha, e
-- a OS do módulo Operações tem o status dela lá (pendente/em andamento/
-- entregue), que não se mistura com este. Nessas linhas o campo vem nulo.
-- ============================================================================
drop view if exists public.v_machine_resumo;
drop view if exists public.v_machine_ficha;

create view public.v_machine_ficha
with (security_invoker = on) as

-- 1) A ORDEM DE SERVIÇO lançada na ficha: diária, hora, viagem, km ou fechado
select
  s.id,
  s.machine_id,
  'servico'::text  as kind,
  'receita'::text  as flow,
  s.internal       as internal,
  s.service_date   as entry_date,
  coalesce(nullif(btrim(s.description), ''), 'Serviço') as description,
  s.kind           as servico_kind,
  null::text       as category,
  s.contratante    as person,
  s.quantity       as quantity,
  s.unit_price     as unit_price,
  s.total          as value,
  s.origin         as origin,
  s.destination    as destination,
  s.operator       as operator,
  s.paid           as paid,
  s.status         as status,
  null::numeric    as liters,
  null::numeric    as odometer,
  null::integer    as order_number,
  s.notes          as notes,
  s.created_at     as created_at
from public.machine_servicos s

union all

-- 2) A DESPESA do veículo: diesel, mecânico, peça, pneu, motorista...
select
  d.id,
  d.machine_id,
  'despesa'::text,
  'despesa'::text,
  false,
  d.expense_date,
  d.description,
  null::text,
  d.category,
  d.supplier,
  1::numeric,
  d.amount,
  d.amount,
  null::text,
  null::text,
  null::text,
  null::boolean,
  null::text,
  d.liters,
  d.odometer,
  null::integer,
  d.notes,
  d.created_at
from public.machine_despesas d

union all

-- 3) A OS que este veículo fez no módulo Operações — só leitura
select
  o.id,
  o.machine_id,
  'os'::text,
  'receita'::text,
  (o.freight_type = 'interno'),
  coalesce(o.delivery_date, o.issue_date),
  coalesce(
    nullif(btrim(o.service_description), ''),
    'Ordem de serviço nº ' || o.order_number
  ),
  null::text,
  case o.type::text
    when 'entrega_material'  then 'ENTREGA DE MATERIAL'
    when 'prestacao_servico' then 'PRESTAÇÃO DE SERVIÇO'
    when 'frete'             then 'FRETE'
    when 'servico_rapido'    then 'SERVIÇO RÁPIDO'
    else upper(o.type::text)
  end,
  o.client_name,
  1::numeric,
  o.total_amount,
  o.total_amount,
  o.origin_address,
  o.delivery_address,
  null::text,
  null::boolean,
  null::text,
  null::numeric,
  null::numeric,
  o.order_number,
  o.notes,
  o.created_at
from public.service_orders o
where o.machine_id is not null
  and o.status::text <> 'cancelado'
  and coalesce(o.total_amount, 0) > 0

union all

-- 4) O COMBUSTÍVEL lançado dentro da OS de Operações (migration 003)
select
  o.id,
  o.machine_id,
  'os_custo'::text,
  'despesa'::text,
  false,
  coalesce(o.delivery_date, o.issue_date),
  'Combustível da OS nº ' || o.order_number,
  null::text,
  'COMBUSTÍVEL'::text,
  null::text,
  1::numeric,
  o.fuel_cost,
  o.fuel_cost,
  null::text,
  null::text,
  null::text,
  null::boolean,
  null::text,
  null::numeric,
  null::numeric,
  o.order_number,
  null::text,
  o.created_at
from public.service_orders o
where o.machine_id is not null
  and o.status::text <> 'cancelado'
  and coalesce(o.fuel_cost, 0) > 0

union all

-- 5) O GASTO DO SERVIÇO lançado dentro da OS de Operações (migration 003)
select
  o.id,
  o.machine_id,
  'os_custo'::text,
  'despesa'::text,
  false,
  coalesce(o.delivery_date, o.issue_date),
  'Gasto da OS nº ' || o.order_number,
  null::text,
  'SERVIÇO'::text,
  null::text,
  1::numeric,
  o.service_cost,
  o.service_cost,
  null::text,
  null::text,
  null::text,
  null::boolean,
  null::text,
  null::numeric,
  null::numeric,
  o.order_number,
  null::text,
  o.created_at
from public.service_orders o
where o.machine_id is not null
  and o.status::text <> 'cancelado'
  and coalesce(o.service_cost, 0) > 0;

-- ============================================================================
-- 3) VIEW: v_machine_resumo — agora dizendo quantas OS estão abertas
-- ============================================================================
create view public.v_machine_resumo
with (security_invoker = on) as
select
  m.*,
  coalesce(f.receitas,  0) as receitas,
  coalesce(f.despesas,  0) as despesas,
  coalesce(f.receitas, 0) - coalesce(f.despesas, 0) as resultado,
  coalesce(f.internos,  0) as internos,
  coalesce(f.a_receber, 0) as a_receber,
  coalesce(f.servicos,  0) as servicos,
  coalesce(f.abertas,   0) as abertas,
  f.ultimo_movimento
from public.machines m
left join lateral (
  select
    coalesce(sum(x.value) filter (where x.flow = 'receita' and not x.internal), 0) as receitas,
    coalesce(sum(x.value) filter (where x.flow = 'despesa'),                    0) as despesas,
    coalesce(sum(x.value) filter (where x.internal),                            0) as internos,
    coalesce(sum(x.value) filter (
      where x.flow = 'receita' and not x.internal and x.paid is false
    ), 0)                                                                          as a_receber,
    count(*) filter (where x.flow = 'receita')::int                                as servicos,
    -- as OS da ficha que ainda não foram concluídas — o verde do calendário
    count(*) filter (where x.status = 'aberta')::int                               as abertas,
    max(x.entry_date)                                                              as ultimo_movimento
  from public.v_machine_ficha x
  where x.machine_id = m.id
) f on true;
