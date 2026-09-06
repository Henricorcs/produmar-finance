-- ============================================================================
-- PRODUMAR — ANIMAIS: venda de LOTE (peixe, ave — o que não tem brinco)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 072 (a ficha) e 086/087 (piscicultura e aves).
-- ============================================================================
-- Por que:
--   A receita do módulo só sabia nascer de UM BICHO CADASTRADO: o dinheiro
--   entrava na ficha quando alguém dava baixa num animal com brinco. Isso
--   serve boi e cavalo. Não serve peixe nem galinha — ninguém cadastra tilápia
--   uma a uma para depois vender uma a uma.
--
--   Quem cria peixe vende assim: "saíram 320 kg de tilápia a R$ 18,00 o quilo".
--   Ou por cabeça: "200 frangos a R$ 22,00". As duas contas cabem numa linha
--   só, sem bicho cadastrado no meio.
--
--   Esta tabela é essa linha. A espécie continua sendo o que separa a ficha,
--   igual à despesa (migration 072).
--
--   Como a venda do animal, ela TAMBÉM vira lançamento no módulo Contas — é
--   dinheiro que entrou de verdade. Quem cuida disso é a action no app, que
--   guarda aqui o id do lançamento para poder desfazer junto.
--
-- Nada é apagado. Rodar de novo não quebra nada.
-- ============================================================================

-- ============================================================================
-- TABELA: animal_vendas
-- ============================================================================
create table if not exists public.animal_vendas (
  id uuid primary key default uuid_generate_v4(),

  -- é ela que separa a ficha: quanto a piscicultura rendeu, quanto as aves
  species text not null,

  sale_date date not null default current_date,

  -- COMO foi vendido, e é isso que decide quais campos valem:
  --   unidade → quantity x price_per_unit
  --   peso    → weight_kg x price_per_kg
  sale_mode text not null default 'peso',

  quantity       numeric(12, 3) not null default 0 check (quantity >= 0),
  price_per_unit numeric(12, 2) not null default 0 check (price_per_unit >= 0),
  weight_kg      numeric(12, 3) not null default 0 check (weight_kg >= 0),
  price_per_kg   numeric(12, 2) not null default 0 check (price_per_kg >= 0),

  -- O TOTAL fica gravado, e não só calculado na hora de ler: é o número que o
  -- dono conferiu no dia. Preço muda, arredondamento muda — o que ele recebeu
  -- naquela venda não muda.
  amount numeric(12, 2) not null check (amount >= 0),

  -- o que saiu ("TILÁPIA", "FRANGO CAIPIRA") e para quem
  description text not null,
  buyer       text,
  notes       text,

  -- o lançamento gerado no módulo Contas — some junto se a venda for apagada
  transaction_id uuid references public.transactions(id) on delete set null,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.animal_vendas drop constraint if exists animal_vendas_species_check;
alter table public.animal_vendas add constraint animal_vendas_species_check
  check (
    species in ('bovino', 'equino', 'caprino', 'ovino', 'suino', 'piscicultura', 'aves')
  );

alter table public.animal_vendas drop constraint if exists animal_vendas_mode_check;
alter table public.animal_vendas add constraint animal_vendas_mode_check
  check (sale_mode in ('unidade', 'peso'));

create index if not exists idx_animal_vendas_species on public.animal_vendas(species);
create index if not exists idx_animal_vendas_data    on public.animal_vendas(sale_date desc);

alter table public.animal_vendas enable row level security;

drop policy if exists "animal_vendas_read"  on public.animal_vendas;
drop policy if exists "animal_vendas_write" on public.animal_vendas;

-- leitura: qualquer um logado, como o resto do módulo
create policy "animal_vendas_read" on public.animal_vendas
  for select using (auth.uid() is not null);

-- lançar/corrigir/apagar: é dinheiro, é de quem manda em Animais
create policy "animal_vendas_write" on public.animal_vendas
  for all
  using (public.user_can_write_module('animais'))
  with check (public.user_can_write_module('animais'));

-- ============================================================================
-- VIEW: v_animal_financeiro — agora com a venda de lote junto
-- ============================================================================
-- Mesma ficha da migration 072, com duas novidades:
--   • uma quarta origem: a venda de lote (sem bicho cadastrado);
--   • duas colunas novas, `quantity` e `price_per_unit`, para a venda por
--     cabeça mostrar a conta por extenso do mesmo jeito que a venda no peso
--     já mostrava ("200 un × R$ 22,00 = R$ 4.400,00").
-- ============================================================================
drop view if exists public.v_animal_financeiro;
create view public.v_animal_financeiro
with (security_invoker = on) as

-- RECEITA: o animal vendido (com brinco, um a um)
select
  a.id,
  'venda'::text        as kind,
  a.species::text      as species,
  a.id                 as animal_id,
  a.tag                as animal_tag,
  a.exit_date          as entry_date,
  ('Venda do animal nº ' || a.tag)::text as description,
  a.exit_amount        as value,
  'Venda de animais'::text as category,
  a.exit_buyer         as person,
  coalesce(a.sale_mode, 'unidade')::text as sale_mode,
  a.sale_weight_kg     as weight_kg,
  a.sale_price_per_kg  as price_per_kg,
  0::numeric           as quantity,
  0::numeric           as price_per_unit,
  a.exit_notes         as notes,
  a.created_at
from public.animals a
where a.exit_reason = 'venda' and a.exit_date is not null

union all

-- RECEITA: a venda de lote — o peixe e a ave, que não têm brinco
select
  v.id,
  'venda'::text,
  v.species,
  null::uuid,
  null::text,
  v.sale_date,
  v.description,
  v.amount,
  'Venda de animais'::text,
  v.buyer,
  v.sale_mode,
  v.weight_kg,
  v.price_per_kg,
  v.quantity,
  v.price_per_unit,
  v.notes,
  v.created_at
from public.animal_vendas v

union all

-- DESPESA: o gasto lançado na ficha, já com a espécie
select
  g.id,
  'despesa'::text,
  g.species,
  g.animal_id,
  an.tag,
  g.expense_date,
  g.description,
  g.amount,
  g.category,
  g.supplier,
  null::text,
  0::numeric,
  0::numeric,
  0::numeric,
  0::numeric,
  g.notes,
  g.created_at
from public.animal_despesas g
left join public.animals an on an.id = g.animal_id

union all

-- DESPESA: o tratamento que já era lançado na ficha do animal (migration 041).
-- Só entra o que teve custo — tratamento sem custo é histórico de saúde, não
-- de dinheiro, e entraria aqui como uma linha de R$ 0,00 poluindo a ficha.
select
  t.id,
  'tratamento'::text,
  an.species::text,
  t.animal_id,
  an.tag,
  t.applied_at,
  t.description,
  t.cost,
  'Tratamento'::text,
  t.medicine,
  null::text,
  0::numeric,
  0::numeric,
  0::numeric,
  0::numeric,
  t.notes,
  t.created_at
from public.animal_treatments t
join public.animals an on an.id = t.animal_id
where t.cost > 0;
