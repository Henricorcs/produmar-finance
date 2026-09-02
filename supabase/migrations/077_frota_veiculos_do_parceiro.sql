-- ============================================================================
-- PRODUMAR — FROTA: os veículos do parceiro e a meia diária na troca
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS da migration 076.
-- ============================================================================
-- Por que:
--
--   1) QUAL VEÍCULO FOI. Saber que "vieram duas caçambas dele" não basta: no
--      fim do mês a conversa é sobre a caçamba de placa tal, que trabalhou ou
--      que parou naquele dia. Então o parceiro passa a ter os veículos dele
--      cadastrados — placa, apelido e tipo —, e o dia guarda QUAIS foram, dos
--      dois lados.
--
--      O dia guarda as placas como TEXTO, do jeito que estavam no momento do
--      lançamento. É de propósito: se o parceiro vender a caçamba ou trocar a
--      placa amanhã, o que já passou continua contando a história certa —
--      mesma ideia do valor da diária copiado no dia do colaborador.
--
--   2) MEIA DIÁRIA. Às vezes a máquina só trabalha meio dia, tanto a dele
--      quanto a nossa. A coluna já aceitava 0,5 desde a 076; o que faltava era
--      a tela contar de meia em meia — e isso é mudança de tela, não de banco.
--
-- Nada é apagado: entram uma tabela e duas colunas. Rodar de novo não quebra.
-- ============================================================================

-- ============================================================================
-- TABELA: machine_parceiro_veiculos (a frota do parceiro)
-- ============================================================================
-- Apagar o parceiro leva os veículos dele junto: eles não existem fora da
-- parceria. O histórico dos dias NÃO se perde com isso — o dia guarda a placa
-- como texto.
create table if not exists public.machine_parceiro_veiculos (
  id uuid primary key default uuid_generate_v4(),

  parceiro_id uuid not null references public.machine_parceiros(id) on delete cascade,

  -- a placa é o que identifica o veículo na conversa
  plate text,
  -- apelido, para quem chama de "caçamba vermelha" em vez da placa
  name text,

  -- cacamba, caminhao, trator... as mesmas categorias do cadastro de veículos
  category text not null default 'cacamba',

  notes  text,
  active boolean not null default true,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- veículo sem placa E sem apelido não dá para reconhecer no dia
alter table public.machine_parceiro_veiculos
  drop constraint if exists machine_parceiro_veiculos_identificacao_check;
alter table public.machine_parceiro_veiculos
  add constraint machine_parceiro_veiculos_identificacao_check
  check (coalesce(btrim(plate), '') <> '' or coalesce(btrim(name), '') <> '');

create index if not exists idx_machine_parceiro_veiculos_parceiro
  on public.machine_parceiro_veiculos(parceiro_id);

comment on table public.machine_parceiro_veiculos is
  'Os veículos do parceiro de troca: placa, apelido e tipo.';

-- ============================================================================
-- O DIA DIZ QUAIS VEÍCULOS FORAM
-- ============================================================================
-- Texto separado por vírgula, com a placa (ou o apelido) de cada um. É a foto
-- do dia: não muda se o cadastro mudar depois.
alter table public.machine_trocas
  add column if not exists veiculos_dele text,
  add column if not exists veiculos_meus text;

comment on column public.machine_trocas.veiculos_dele is
  'Placas das máquinas DELE que trabalharam para nós no dia (texto do momento)';
comment on column public.machine_trocas.veiculos_meus is
  'Placas/nomes das máquinas NOSSAS que foram para ele no dia (texto do momento)';

-- ============================================================================
-- ROW LEVEL SECURITY — igual ao resto da Frota
-- ============================================================================
alter table public.machine_parceiro_veiculos enable row level security;

drop policy if exists "machine_parceiro_veiculos_read"  on public.machine_parceiro_veiculos;
drop policy if exists "machine_parceiro_veiculos_write" on public.machine_parceiro_veiculos;

create policy "machine_parceiro_veiculos_read" on public.machine_parceiro_veiculos
  for select using (auth.uid() is not null);

create policy "machine_parceiro_veiculos_write" on public.machine_parceiro_veiculos
  for all
  using (
    public.user_can_write_module('frota')
    or public.user_can_write_module('materiais-servicos')
  )
  with check (
    public.user_can_write_module('frota')
    or public.user_can_write_module('materiais-servicos')
  );
