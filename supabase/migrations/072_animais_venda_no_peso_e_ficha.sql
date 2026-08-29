-- ============================================================================
-- PRODUMAR — ANIMAIS: venda no peso e a ficha de receitas e despesas
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS da migration 056 (é ela que criou a saída do rebanho).
-- ============================================================================
-- Por que:
--
--   1) BOI NÃO SE VENDE SÓ POR CABEÇA. A baixa só sabia guardar um valor
--      fechado, mas a maior parte da venda de gado é NO PESO: tantos quilos a
--      tanto o quilo. Quem lançava tinha que fazer a conta no papel e digitar
--      só o resultado — e no mês seguinte ninguém sabia mais quantos quilos
--      saíram nem por quanto o quilo foi vendido.
--
--      Agora a venda diz COMO foi feita:
--        • 'unidade' → o valor fechado do animal, como sempre foi;
--        • 'peso'    → o peso × o preço do quilo, e o total sai da conta.
--
--      `exit_amount` continua sendo O TOTAL nos dois casos: nada que já soma
--      venda precisa aprender a dividir.
--
--   2) FALTAVA SABER QUANTO CADA ESPÉCIE CUSTA. A venda ia para o financeiro e
--      sumia no meio de tudo; o gasto com os bichos não tinha onde ser lançado.
--      Sem os dois lados juntos não dá para responder a pergunta que importa:
--      "o caprino se paga?".
--
--      Entra a tabela de DESPESA COM ANIMAIS, que nasce grudada na ESPÉCIE —
--      ração, sal, medicamento, frete, compra de animal. A espécie é
--      obrigatória de propósito: despesa sem espécie não entra em conta nenhuma
--      e é exatamente ela que a ficha precisa separar.
--
--      IMPORTANTE: a despesa daqui NÃO cria lançamento no módulo Contas — é
--      registro e relatório dentro de Animais, do mesmo jeito que a despesa da
--      obra (migration 067). A VENDA continua indo para Contas como sempre foi.
--
-- Nada é apagado: entram três colunas, uma tabela e a v_animals recriada.
-- Rodar de novo não quebra nada.
-- ============================================================================

-- ============================================================================
-- 1) COMO O ANIMAL FOI VENDIDO
-- ============================================================================
-- Nulo = não foi vendido (ou é venda antiga, lançada antes desta migration:
-- aquelas valem como 'unidade', que era a única forma que existia).
alter table public.animals
  add column if not exists sale_mode         text,
  add column if not exists sale_weight_kg    numeric(12, 2) not null default 0,
  add column if not exists sale_price_per_kg numeric(12, 2) not null default 0;

alter table public.animals drop constraint if exists animals_sale_mode_check;
alter table public.animals add constraint animals_sale_mode_check
  check (sale_mode is null or sale_mode in ('unidade', 'peso'));

alter table public.animals drop constraint if exists animals_sale_weight_check;
alter table public.animals add constraint animals_sale_weight_check
  check (sale_weight_kg >= 0 and sale_price_per_kg >= 0);

comment on column public.animals.sale_mode is
  'unidade = valor fechado do animal; peso = sale_weight_kg x sale_price_per_kg';

-- ============================================================================
-- 2) TABELA: animal_despesas (o lado do gasto, por espécie)
-- ============================================================================
create table if not exists public.animal_despesas (
  id uuid primary key default uuid_generate_v4(),

  -- A ESPÉCIE é o que a ficha separa: bovino, caprino, ovino... Obrigatória.
  species text not null,

  -- Quando o gasto foi de UM animal só (o remédio daquele boi), ele fica
  -- amarrado aqui. Apagar o animal não apaga a despesa: ela continua no custo
  -- da espécie, que é onde ela pesa.
  animal_id uuid references public.animals(id) on delete set null,

  -- a data do gasto, não a da digitação
  expense_date date not null default current_date,

  -- RAÇÃO, SAL MINERAL, MEDICAMENTO, FRETE... texto livre com sugestões na
  -- tela: é o que agrupa o relatório
  category text,

  description text not null,
  amount      numeric(12, 2) not null check (amount >= 0),

  -- de quem se comprou / quem prestou o serviço
  supplier text,

  notes text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.animal_despesas drop constraint if exists animal_despesas_species_check;
alter table public.animal_despesas add constraint animal_despesas_species_check
  check (species in ('bovino', 'equino', 'caprino', 'ovino', 'suino'));

create index if not exists idx_animal_despesas_species
  on public.animal_despesas(species);
create index if not exists idx_animal_despesas_animal
  on public.animal_despesas(animal_id);
create index if not exists idx_animal_despesas_data
  on public.animal_despesas(expense_date desc);

alter table public.animal_despesas enable row level security;

drop policy if exists "animal_despesas_read"  on public.animal_despesas;
drop policy if exists "animal_despesas_write" on public.animal_despesas;

-- leitura: qualquer um logado, como o resto do módulo
create policy "animal_despesas_read" on public.animal_despesas
  for select using (auth.uid() is not null);

-- lançar/corrigir/apagar: é dinheiro, é de quem manda em Animais
create policy "animal_despesas_write" on public.animal_despesas
  for all
  using (public.user_can_write_module('animais'))
  with check (public.user_can_write_module('animais'));

-- ============================================================================
-- 3) VIEW: v_animals — recriada para enxergar as colunas novas
-- ============================================================================
-- O `a.*` de uma view é resolvido na CRIAÇÃO dela: coluna acrescentada depois
-- NÃO aparece sozinha. Mesma lógica da 056, sem nenhuma mudança de regra.
-- ============================================================================
drop view if exists public.v_animals;

create view public.v_animals
with (security_invoker = on) as
select
  a.*,
  br.name as breed_name,
  ag.age_months,
  case
    when ag.age_months is not null and ag.age_months < 12 then 'bezerro'
    when a.sex = 'macho'                                  then 'boi'
    else                                                       'vaca'
  end as category,
  vs.vaccines_total,
  vs.vaccines_ok,
  (vs.vaccines_total - vs.vaccines_ok) as vaccines_due
from public.animals a
left join public.animal_breeds br on br.id = a.breed_id
-- idade em meses cheios
left join lateral (
  select case
    when a.birth_date is null then null
    else (extract(year  from age(current_date, a.birth_date)) * 12
        + extract(month from age(current_date, a.birth_date)))::int
  end as age_months
) ag on true
-- vacinação: para cada vacina cadastrada, o animal está em dia?
--   em dia = já aplicada e (dose única ou o reforço ainda não venceu)
left join lateral (
  select
    count(*)::int as vaccines_total,
    (count(*) filter (
      where z.last_app is not null
        and (
          coalesce(z.rec, 0) = 0
          or z.last_app + make_interval(months => z.rec) > current_date
        )
    ))::int as vaccines_ok
  from (
    select
      av.recurrence_months as rec,
      (
        select max(x.applied_at)
        from public.animal_vaccinations x
        where x.animal_id = a.id and x.vaccine_id = av.id
      ) as last_app
    from public.animal_vaccines av
  ) z
) vs on true;

-- ============================================================================
-- 4) VIEW: v_animal_financeiro (a ficha, linha a linha)
-- ============================================================================
-- Uma linha por movimento, das três origens, todas com as mesmas colunas e
-- SEMPRE com a espécie — que é o que a ficha separa:
--
--   kind        → 'venda' (receita) | 'despesa' | 'tratamento' (as duas saem)
--   species     → bovino, caprino... é por aqui que o custo é separado
--   entry_date  → a data do fato
--   description → o que foi
--   value       → quanto foi (sempre positivo; o sinal está no `kind`)
--
-- A venda traz também COMO foi vendida e, no peso, quantos quilos e por quanto
-- o quilo — é o que responde "por quanto eu vendi a arroba no ano passado".
-- ============================================================================
drop view if exists public.v_animal_financeiro;
create view public.v_animal_financeiro
with (security_invoker = on) as
-- RECEITA: o animal vendido
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
  a.exit_notes         as notes,
  a.created_at
from public.animals a
where a.exit_reason = 'venda' and a.exit_date is not null

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
  t.notes,
  t.created_at
from public.animal_treatments t
join public.animals an on an.id = t.animal_id
where t.cost > 0;
