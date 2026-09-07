-- ============================================================================
-- PRODUMAR — ANIMAIS: tanque, ciclo e a conta de cada um
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 072 (a ficha), 086/087 (piscicultura e aves) e
-- 088 (venda de lote). Uma execução só.
-- ============================================================================
-- Por que:
--   O módulo já sabia quanto entrou e quanto saiu de dinheiro POR ESPÉCIE. Não
--   sabia o que está vivo, e não sabia separar por tanque. Quem põe 3.000
--   alevinos divididos em quatro tanques precisa das duas coisas: quanto morreu
--   e quanto cada tanque deu.
--
--   São três peças, e só três:
--
--   TANQUE    → cadastro fixo (Tanque 01, 02, 03, 04). Existe para sempre.
--   CICLO     → o povoamento daquele tanque: entrou tanto alevino, morreu
--               tanto, vendeu tanto, custou tanto. Fecha na despesca, e o
--               tanque recebe um ciclo novo depois.
--   MOVIMENTO → o que mexe na quantidade: entrada, morte, correção de contagem.
--
--   Despesa e venda passam a poder apontar para um ciclo. É daí que sai o bruto
--   e o líquido de cada tanque; o geral é a soma. Lançamento sem ciclo continua
--   valendo para a espécie e entra só no geral — a bomba do viveiro não é de
--   tanque nenhum.
--
--   Serve aves pelo mesmo caminho: o "tanque" é o galpão. Quem troca a palavra
--   na tela é a espécie.
--
-- Nada é apagado. Rodar de novo não quebra nada.
-- ============================================================================

-- ============================================================================
-- TABELA: animal_tanques (o cadastro)
-- ============================================================================
create table if not exists public.animal_tanques (
  id uuid primary key default uuid_generate_v4(),

  species text not null,
  name    text not null,

  -- tanque desativado some da hora de abrir ciclo, mas o histórico dele fica
  active boolean not null default true,

  notes text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.animal_tanques drop constraint if exists animal_tanques_species_check;
alter table public.animal_tanques add constraint animal_tanques_species_check
  check (
    species in ('bovino', 'equino', 'caprino', 'ovino', 'suino', 'piscicultura', 'aves')
  );

-- Dois "TANQUE 01" na mesma criação viram duas contas para o mesmo tanque.
create unique index if not exists uq_animal_tanques_nome
  on public.animal_tanques(species, name);

-- ============================================================================
-- TABELA: animal_lotes (o ciclo do tanque)
-- ============================================================================
create table if not exists public.animal_lotes (
  id uuid primary key default uuid_generate_v4(),

  tanque_id uuid not null references public.animal_tanques(id) on delete restrict,
  species   text not null,

  -- opcional, para quem quiser nomear a safra: "TILÁPIA 2026/1"
  name text,

  start_date date not null default current_date,

  status    text not null default 'aberto',
  closed_at date,

  notes text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.animal_lotes drop constraint if exists animal_lotes_status_check;
alter table public.animal_lotes add constraint animal_lotes_status_check
  check (status in ('aberto', 'fechado'));

-- UM CICLO ABERTO POR TANQUE. Sem esta trava, dois povoamentos abertos no mesmo
-- tanque dividem as mesmas despesas e o resultado de cada um vira ficção.
create unique index if not exists uq_animal_lote_aberto
  on public.animal_lotes(tanque_id)
  where status = 'aberto';

create index if not exists idx_animal_lotes_tanque on public.animal_lotes(tanque_id);
create index if not exists idx_animal_lotes_species on public.animal_lotes(species);

-- ============================================================================
-- TABELA: animal_lote_movimentos (o que mexe na quantidade)
-- ============================================================================
-- A quantidade inicial É o primeiro movimento de 'entrada', e não uma coluna
-- solta no ciclo: repovoar o tanque é comum e vira outra entrada, sem caso
-- especial e sem dois lugares dizendo quanto entrou.
create table if not exists public.animal_lote_movimentos (
  id uuid primary key default uuid_generate_v4(),

  lote_id uuid not null references public.animal_lotes(id) on delete cascade,

  --   entrada → povoou (+)
  --   morte   → morreu (−)
  --   ajuste  → recontagem, e é ela que o fechamento usa para zerar a sobra;
  --             é o único que aceita número negativo
  kind text not null,

  moved_on date not null default current_date,
  quantity numeric(12, 3) not null,

  notes text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.animal_lote_movimentos drop constraint if exists animal_lote_movimentos_kind_check;
alter table public.animal_lote_movimentos add constraint animal_lote_movimentos_kind_check
  check (kind in ('entrada', 'morte', 'ajuste'));

alter table public.animal_lote_movimentos drop constraint if exists animal_lote_movimentos_qtd_check;
alter table public.animal_lote_movimentos add constraint animal_lote_movimentos_qtd_check
  check (kind = 'ajuste' or quantity > 0);

create index if not exists idx_animal_lote_mov_lote
  on public.animal_lote_movimentos(lote_id);
create index if not exists idx_animal_lote_mov_data
  on public.animal_lote_movimentos(moved_on desc);

-- ============================================================================
-- O ciclo entra na venda e na despesa (as duas opcionais)
-- ============================================================================
alter table public.animal_vendas
  add column if not exists lote_id uuid references public.animal_lotes(id) on delete set null;

alter table public.animal_despesas
  add column if not exists lote_id uuid references public.animal_lotes(id) on delete set null;

create index if not exists idx_animal_vendas_lote   on public.animal_vendas(lote_id);
create index if not exists idx_animal_despesas_lote on public.animal_despesas(lote_id);

comment on column public.animal_vendas.quantity is
  'Quantas cabeças saíram. Em sale_mode = unidade é também o que multiplica o preço; em peso NÃO entra na conta do dinheiro (o total é kg x preço do kg) e serve só para baixar o saldo do tanque.';

comment on column public.animal_vendas.lote_id is
  'De qual ciclo saiu. Em branco, a venda vale para a espécie e entra só no geral.';

comment on column public.animal_despesas.lote_id is
  'De qual ciclo é o gasto. Em branco, vale para a espécie e entra só no geral — a bomba do viveiro não é de tanque nenhum.';

-- ============================================================================
-- VIEW: v_animal_lotes (a conta pronta, uma linha por ciclo)
-- ============================================================================
drop view if exists public.v_animal_lotes;
create view public.v_animal_lotes
with (security_invoker = on) as
select
  l.id,
  l.tanque_id,
  t.name        as tanque_name,
  t.active      as tanque_active,
  l.species,
  l.name,
  l.start_date,
  l.status,
  l.closed_at,
  l.notes,
  l.created_at,

  -- quantidade
  m.entradas,
  m.mortes,
  m.ajustes,
  v.vendidos,
  (m.entradas - m.mortes + m.ajustes - v.vendidos) as saldo,
  case
    when m.entradas > 0 then round(m.mortes * 100.0 / m.entradas, 2)
    else 0
  end as mortalidade_pct,

  -- dinheiro
  v.kg_vendidos,
  v.bruto,
  g.custo,
  (v.bruto - g.custo) as liquido,
  case when m.entradas   > 0 then round(g.custo / m.entradas, 4)   else 0 end as custo_por_cabeca,
  case when v.kg_vendidos > 0 then round(g.custo / v.kg_vendidos, 4) else 0 end as custo_por_kg

from public.animal_lotes l
join public.animal_tanques t on t.id = l.tanque_id

left join lateral (
  select
    coalesce(sum(x.quantity) filter (where x.kind = 'entrada'), 0) as entradas,
    coalesce(sum(x.quantity) filter (where x.kind = 'morte'),   0) as mortes,
    coalesce(sum(x.quantity) filter (where x.kind = 'ajuste'),  0) as ajustes
  from public.animal_lote_movimentos x
  where x.lote_id = l.id
) m on true

left join lateral (
  select
    coalesce(sum(s.quantity),  0) as vendidos,
    coalesce(sum(s.weight_kg), 0) as kg_vendidos,
    coalesce(sum(s.amount),    0) as bruto
  from public.animal_vendas s
  where s.lote_id = l.id
) v on true

left join lateral (
  select coalesce(sum(d.amount), 0) as custo
  from public.animal_despesas d
  where d.lote_id = l.id
) g on true;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Mesma regra do resto do módulo: qualquer logado lê; mexer é de quem manda em
-- Animais (helper user_can_write_module, migration 039).
-- ============================================================================
alter table public.animal_tanques          enable row level security;
alter table public.animal_lotes            enable row level security;
alter table public.animal_lote_movimentos  enable row level security;

drop policy if exists "animal_tanques_read"          on public.animal_tanques;
drop policy if exists "animal_tanques_write"         on public.animal_tanques;
drop policy if exists "animal_lotes_read"            on public.animal_lotes;
drop policy if exists "animal_lotes_write"           on public.animal_lotes;
drop policy if exists "animal_lote_movimentos_read"  on public.animal_lote_movimentos;
drop policy if exists "animal_lote_movimentos_write" on public.animal_lote_movimentos;

create policy "animal_tanques_read" on public.animal_tanques
  for select using (auth.uid() is not null);
create policy "animal_tanques_write" on public.animal_tanques
  for all
  using (public.user_can_write_module('animais'))
  with check (public.user_can_write_module('animais'));

create policy "animal_lotes_read" on public.animal_lotes
  for select using (auth.uid() is not null);
create policy "animal_lotes_write" on public.animal_lotes
  for all
  using (public.user_can_write_module('animais'))
  with check (public.user_can_write_module('animais'));

create policy "animal_lote_movimentos_read" on public.animal_lote_movimentos
  for select using (auth.uid() is not null);
create policy "animal_lote_movimentos_write" on public.animal_lote_movimentos
  for all
  using (public.user_can_write_module('animais'))
  with check (public.user_can_write_module('animais'));
