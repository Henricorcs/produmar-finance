-- ============================================================================
-- PRODUMAR — FROTA: a ficha de cada máquina e de cada veículo
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 001, 003, 015, 017, 023 e 039.
-- ============================================================================
-- Por que:
--
--   O caminhão e a caçamba já trabalhavam no sistema, mas só por dentro da
--   Ordem de Serviço — e a OS é do CLIENTE, não do veículo. Ninguém conseguia
--   responder a pergunta que interessa: a caçamba se paga? O que ela rodou no
--   mês estava espalhado; o que ela custou (diesel, pneu, mecânico, o
--   motorista) não tinha onde ser lançado.
--
--   Agora cada máquina/veículo tem FICHA PRÓPRIA, com os dois lados:
--
--   1) O QUE ELE RENDEU — o serviço lançado direto na ficha, do jeito que foi
--      combinado na rua: a DIÁRIA da máquina, a HORA trabalhada, a VIAGEM (o
--      frete da caçamba), o KM rodado ou um valor fechado. Cada lançamento diz
--      PRA QUEM FOI — o contratante —, de onde saiu, para onde foi, quem
--      operou e se já foi pago.
--
--   2) O QUE ELE CUSTOU — combustível, manutenção, peça, pneu, motorista,
--      imposto, seguro. O abastecimento guarda litros e a marcação do
--      hodômetro/horímetro: é assim que sai a média e o custo por km.
--
--   A OS continua onde está: a ficha só LÊ o que o veículo fez em Operações
--   (o valor da OS de um lado, o combustível e o gasto dela do outro). Nada é
--   copiado nem duplicado — quem manda na OS continua sendo o módulo Operações.
--
--   IMPORTANTE: como na obra (migration 067) e nos animais (072), o que se
--   lança aqui NÃO vira lançamento no módulo Contas. É registro e relatório
--   dentro da Frota.
--
-- Nada é apagado: entram duas tabelas e duas views. Rodar de novo não quebra.
-- ============================================================================

-- ============================================================================
-- TABELA: machine_servicos (o que o veículo fez e por quanto)
-- ============================================================================
-- Apagar o veículo APAGA os serviços dele: o lançamento não tem vida própria
-- fora da máquina que o fez.
create table if not exists public.machine_servicos (
  id uuid primary key default uuid_generate_v4(),

  machine_id uuid not null references public.machines(id) on delete cascade,

  -- o dia do serviço, não o da digitação
  service_date date not null default current_date,

  -- COMO foi cobrado. É o que muda a conta na tela:
  --   diaria  → tantos dias    x valor da diária
  --   hora    → tantas horas   x valor da hora
  --   viagem  → tantas viagens x valor da viagem  (o frete da caçamba)
  --   km      → tantos km      x valor do km
  --   servico → um valor fechado, sem conta
  kind text not null default 'diaria',

  -- PRA QUEM FOI: o contratante. Texto livre, igual ao cliente da OS — é por
  -- este nome que a tela soma quanto cada um contratou e quanto ainda deve.
  contratante text,

  -- o que foi feito / o que foi levado
  description text,

  -- o trecho, quando é frete ou viagem
  origin      text,
  destination text,

  -- a conta: quantidade x valor. Num valor fechado, quantidade = 1.
  quantity   numeric(12, 2) not null default 1 check (quantity   >= 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  total      numeric(12, 2) generated always as (round(quantity * unit_price, 2)) stored,

  -- quem estava na máquina (motorista/operador). Texto livre: nem todo
  -- motorista tem login no sistema.
  operator text,

  -- serviço da própria firma (roçada na fazenda, frete do material da obra):
  -- trabalho feito, mas não é dinheiro entrando. Fica fora da receita e é
  -- somado à parte.
  internal boolean not null default false,

  -- já recebeu? é o que responde quem ainda me deve
  paid boolean not null default false,

  notes text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.machine_servicos drop constraint if exists machine_servicos_kind_check;
alter table public.machine_servicos add constraint machine_servicos_kind_check
  check (kind in ('diaria', 'hora', 'viagem', 'km', 'servico'));

create index if not exists idx_machine_servicos_machine
  on public.machine_servicos(machine_id);
create index if not exists idx_machine_servicos_data
  on public.machine_servicos(service_date desc);
create index if not exists idx_machine_servicos_contratante
  on public.machine_servicos(contratante);

comment on table public.machine_servicos is
  'Serviço, diária, frete ou viagem feita por uma máquina/veículo, com o contratante.';

-- ============================================================================
-- TABELA: machine_despesas (o que o veículo custou)
-- ============================================================================
create table if not exists public.machine_despesas (
  id uuid primary key default uuid_generate_v4(),

  machine_id uuid not null references public.machines(id) on delete cascade,

  -- a data do gasto, não a da digitação
  expense_date date not null default current_date,

  -- COMBUSTÍVEL, MANUTENÇÃO, PEÇA, PNEU... texto livre com sugestões na tela:
  -- é o que agrupa o relatório
  category text,

  description text not null,
  amount      numeric(12, 2) not null check (amount >= 0),

  -- de quem se comprou / quem fez o serviço
  supplier text,

  -- Só no abastecimento: quantos litros entraram e em que marcação do
  -- hodômetro (km) ou do horímetro (horas). É o par que dá a média e o custo
  -- por km — sem eles o diesel vira só um valor solto.
  liters   numeric(12, 3) check (liters   is null or liters   >= 0),
  odometer numeric(12, 2) check (odometer is null or odometer >= 0),

  notes text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_machine_despesas_machine
  on public.machine_despesas(machine_id);
create index if not exists idx_machine_despesas_data
  on public.machine_despesas(expense_date desc);

comment on table public.machine_despesas is
  'Gasto de uma máquina/veículo: combustível, manutenção, peça, motorista, imposto.';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Leitura: qualquer um logado, como no resto do sistema.
-- Escrita: quem manda na FROTA — e também quem já manda em Materiais e
-- Serviços, que é de onde a frota saiu (mesma ideia da migration 060: ninguém
-- que já trabalhava perde o acesso).
alter table public.machine_servicos enable row level security;
alter table public.machine_despesas enable row level security;

drop policy if exists "machine_servicos_read"  on public.machine_servicos;
drop policy if exists "machine_servicos_write" on public.machine_servicos;

create policy "machine_servicos_read" on public.machine_servicos
  for select using (auth.uid() is not null);

create policy "machine_servicos_write" on public.machine_servicos
  for all
  using (
    public.user_can_write_module('frota')
    or public.user_can_write_module('materiais-servicos')
  )
  with check (
    public.user_can_write_module('frota')
    or public.user_can_write_module('materiais-servicos')
  );

drop policy if exists "machine_despesas_read"  on public.machine_despesas;
drop policy if exists "machine_despesas_write" on public.machine_despesas;

create policy "machine_despesas_read" on public.machine_despesas
  for select using (auth.uid() is not null);

create policy "machine_despesas_write" on public.machine_despesas
  for all
  using (
    public.user_can_write_module('frota')
    or public.user_can_write_module('materiais-servicos')
  )
  with check (
    public.user_can_write_module('frota')
    or public.user_can_write_module('materiais-servicos')
  );

-- ── O cadastro do veículo passa a ser editável por quem cuida da frota ──────
-- Antes só admin/financeiro mexiam (migration 001). O helper já devolve true
-- para os dois papéis, então nada muda para quem já cadastrava — só entra o
-- operador com o módulo liberado.
drop policy if exists "machines_write" on public.machines;
create policy "machines_write" on public.machines
  for all
  using (
    public.user_can_write_module('frota')
    or public.user_can_write_module('materiais-servicos')
  )
  with check (
    public.user_can_write_module('frota')
    or public.user_can_write_module('materiais-servicos')
  );

-- ============================================================================
-- VIEW: v_machine_ficha — a ficha do veículo, linha a linha
-- ============================================================================
-- Uma linha por movimento, das quatro origens, todas com as mesmas colunas:
--
--   kind       → servico | despesa | os | os_custo
--   flow       → receita (entrou) | despesa (saiu)
--   internal   → trabalho da própria firma: conta como serviço, não como
--                dinheiro entrando
--   entry_date → a data do fato
--   value      → sempre positivo; o sinal está no flow
--   person     → o contratante (receita) ou o fornecedor (despesa)
--   paid       → só o serviço da ficha sabe dizer; na OS o recebimento mora
--                em Contas, então vem nulo
--
-- As duas últimas origens são LEITURA do módulo Operações: a OS que este
-- veículo fez (o valor cobrado) e o que aquela OS consumiu (combustível e
-- gasto do serviço). A OS continua sendo mantida lá — aqui ela só aparece.
-- ============================================================================
drop view if exists public.v_machine_resumo;
drop view if exists public.v_machine_ficha;

create view public.v_machine_ficha
with (security_invoker = on) as

-- 1) O SERVIÇO lançado na ficha: diária, hora, viagem, km ou valor fechado
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
  d.liters,
  d.odometer,
  null::integer,
  d.notes,
  d.created_at
from public.machine_despesas d

union all

-- 3) A OS que este veículo fez (módulo Operações) — só leitura
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

-- 4) O COMBUSTÍVEL lançado dentro da OS (migration 003)
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

-- 5) O GASTO DO SERVIÇO lançado dentro da OS (migration 003)
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
-- VIEW: v_machine_resumo — o veículo com a conta fechada de sempre
-- ============================================================================
-- O cadastro da máquina somado ao que ela já rendeu e ao que já custou, desde
-- o primeiro lançamento. A tela usa isto no card do veículo; o recorte do mês
-- ela faz por cima da ficha.
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
    max(x.entry_date)                                                              as ultimo_movimento
  from public.v_machine_ficha x
  where x.machine_id = m.id
) f on true;
