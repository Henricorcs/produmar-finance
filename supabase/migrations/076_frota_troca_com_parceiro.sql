-- ============================================================================
-- PRODUMAR — FROTA: a troca de diárias com o parceiro
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 073, 074 e 075.
-- ============================================================================
-- Por que:
--
--   Existe um acerto que não é dinheiro: as máquinas se revezam. Quando tem
--   serviço aqui, a caçamba do parceiro vem trabalhar para nós; quando não tem,
--   a nossa vai trabalhar para ele. O pagamento é EM DIÁRIA — um dia de máquina
--   dele se paga com um dia de máquina nossa.
--
--   Isso não passava por lugar nenhum do sistema: ficava na cabeça, e no fim do
--   mês ninguém sabia quem estava devendo quantas diárias. Se ele bota duas
--   caçambas num dia e nós botamos só uma, ficamos devendo uma — e é essa conta
--   que precisa estar escrita.
--
--   Então cada DIA guarda dois números, por tipo de máquina:
--     recebidas → quantas máquinas DELE trabalharam para nós naquele dia
--     cedidas   → quantas máquinas NOSSAS trabalharam para ele
--
--   O saldo é a subtração: cedidas − recebidas.
--     saldo negativo → nós devemos diárias a ele
--     saldo positivo → ele deve diárias a nós
--
--   O tipo (caçamba, caminhão, trator...) separa a conta porque uma diária de
--   caçamba se paga com caçamba: somar tudo junto esconderia a dívida real.
--   Meia diária cabe — o número aceita 0,5.
--
--   IMPORTANTE: aqui não entra dinheiro. É troca de dia de máquina, e por isso
--   não mexe na receita nem na despesa da ficha do veículo.
--
-- Nada é apagado: entram duas tabelas e uma view. Rodar de novo não quebra.
-- ============================================================================

-- ============================================================================
-- TABELA: machine_parceiros (com quem a gente troca máquina)
-- ============================================================================
create table if not exists public.machine_parceiros (
  id uuid primary key default uuid_generate_v4(),

  name  text not null,
  phone text,
  notes text,

  active boolean not null default true,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- o nome é único sem diferenciar maiúscula de minúscula: o app grava em CAIXA
-- ALTA, mas ninguém precisa saber disso para o cadastro repetido ser barrado
create unique index if not exists uq_machine_parceiros_nome
  on public.machine_parceiros(lower(name));

comment on table public.machine_parceiros is
  'Parceiro com quem a frota troca diárias de máquina (escambo, sem dinheiro).';

-- ============================================================================
-- TABELA: machine_trocas (o dia no calendário do confronto)
-- ============================================================================
-- Uma linha por PARCEIRO + DIA + TIPO de máquina. Apagar o parceiro apaga o
-- histórico dele: a troca não existe fora da parceria.
create table if not exists public.machine_trocas (
  id uuid primary key default uuid_generate_v4(),

  parceiro_id uuid not null references public.machine_parceiros(id) on delete cascade,

  entry_date date not null default current_date,

  -- cacamba, caminhao, trator, carregadeira, maquina, outro — as mesmas
  -- categorias do cadastro de veículos (texto livre, controlado pela tela)
  category text not null default 'cacamba',

  -- quantas máquinas DELE trabalharam para nós neste dia (aceita 0,5 = meio dia)
  recebidas numeric(6, 2) not null default 0 check (recebidas >= 0),
  -- quantas máquinas NOSSAS trabalharam para ele neste dia
  cedidas   numeric(6, 2) not null default 0 check (cedidas   >= 0),

  notes text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Um dia, um tipo, uma linha: lançar de novo o mesmo dia CORRIGE o que estava
-- lá em vez de somar escondido. É o que o upsert da tela usa.
create unique index if not exists uq_machine_trocas_dia
  on public.machine_trocas(parceiro_id, entry_date, category);

create index if not exists idx_machine_trocas_parceiro_data
  on public.machine_trocas(parceiro_id, entry_date desc);

comment on table public.machine_trocas is
  'Dia de troca de máquina com o parceiro: quantas dele vieram e quantas nossas foram.';

-- ============================================================================
-- ROW LEVEL SECURITY — igual ao resto da Frota
-- ============================================================================
alter table public.machine_parceiros enable row level security;
alter table public.machine_trocas    enable row level security;

drop policy if exists "machine_parceiros_read"  on public.machine_parceiros;
drop policy if exists "machine_parceiros_write" on public.machine_parceiros;

create policy "machine_parceiros_read" on public.machine_parceiros
  for select using (auth.uid() is not null);

create policy "machine_parceiros_write" on public.machine_parceiros
  for all
  using (
    public.user_can_write_module('frota')
    or public.user_can_write_module('materiais-servicos')
  )
  with check (
    public.user_can_write_module('frota')
    or public.user_can_write_module('materiais-servicos')
  );

drop policy if exists "machine_trocas_read"  on public.machine_trocas;
drop policy if exists "machine_trocas_write" on public.machine_trocas;

create policy "machine_trocas_read" on public.machine_trocas
  for select using (auth.uid() is not null);

create policy "machine_trocas_write" on public.machine_trocas
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
-- VIEW: v_machine_parceiro_saldo — o confronto, por parceiro e por tipo
-- ============================================================================
-- Uma linha por parceiro e tipo de máquina, com a conta fechada desde sempre:
--
--   recebidas → o que ele emprestou para nós
--   cedidas   → o que nós emprestamos para ele
--   saldo     → cedidas − recebidas
--                 negativo = NÓS devemos diárias
--                 positivo = ELE deve diárias
--
-- A tela soma os tipos para dar o número grande, mas guarda a separação: a
-- diária de caçamba se paga com caçamba.
-- ============================================================================
drop view if exists public.v_machine_parceiro_saldo;

create view public.v_machine_parceiro_saldo
with (security_invoker = on) as
select
  t.parceiro_id,
  t.category,
  sum(t.recebidas)                    as recebidas,
  sum(t.cedidas)                      as cedidas,
  sum(t.cedidas) - sum(t.recebidas)   as saldo,
  count(*)::int                       as dias,
  max(t.entry_date)                   as ultimo_dia
from public.machine_trocas t
group by t.parceiro_id, t.category;
