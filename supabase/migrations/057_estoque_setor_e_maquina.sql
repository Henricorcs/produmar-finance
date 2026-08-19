-- ============================================================================
-- ILNET Finance — Estoque: SETOR DA OBRA + MÁQUINA no envio do técnico
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 049, 051 e 052 (módulo Estoque + envio do técnico).
-- ============================================================================
-- Por que:
--   1) "Onde você aplicou" era texto livre — cada técnico escrevia de um jeito
--      e não dava para somar nada. Agora é o SETOR, um subcadastro da obra:
--      o chefe cadastra os setores de cada obra (no detalhe da obra) e o
--      técnico só escolhe. O texto livre continua existindo como saída de
--      emergência, para o técnico não travar no meio do serviço.
--
--   2) O serviço nem sempre é só material: o técnico pode ter usado uma
--      MÁQUINA e ter ABASTECIDO. Isso vai no mesmo envio — máquina do cadastro
--      da frota (public.machines), a leitura do horímetro ou do km (as duas
--      OPCIONAIS: quase sempre ninguém anota) e o combustível, quando houve
--      abastecimento. `fuel_type` nulo = não abasteceu.
-- ============================================================================

-- ============================================================================
-- TABELA: supply_obra_sectors (o setor é filho da obra)
-- ============================================================================
create table if not exists public.supply_obra_sectors (
  id uuid primary key default uuid_generate_v4(),

  obra_id uuid not null references public.supply_obras(id) on delete cascade,
  name    text not null,

  notes  text,
  active boolean not null default true,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- o nome do setor só precisa ser único DENTRO da obra ("entrada" existe em
-- várias obras); lower() para não entrar "Entrada" e "ENTRADA" na mesma obra
create unique index if not exists uq_supply_obra_sectors_nome
  on public.supply_obra_sectors(obra_id, lower(name));
create index if not exists idx_supply_obra_sectors_obra
  on public.supply_obra_sectors(obra_id);

alter table public.supply_obra_sectors enable row level security;

drop policy if exists "supply_obra_sectors_read"  on public.supply_obra_sectors;
drop policy if exists "supply_obra_sectors_write" on public.supply_obra_sectors;

-- leitura: qualquer logado (o técnico precisa ver para escolher)
create policy "supply_obra_sectors_read" on public.supply_obra_sectors
  for select using (auth.uid() is not null);

-- cadastro: só quem manda no Estoque — o setor é do chefe, como a obra
create policy "supply_obra_sectors_write" on public.supply_obra_sectors
  for all
  using (public.user_can_write_module('estoque'))
  with check (public.user_can_write_module('estoque'));

-- ============================================================================
-- supply_requests: setor, máquina e abastecimento
-- ============================================================================
-- Tudo opcional. O envio sem máquina e sem setor continua funcionando igual —
-- e a checagem supply_requests_tem_lugar segue valendo (obra ou texto livre).
alter table public.supply_requests
  add column if not exists sector_id uuid
    references public.supply_obra_sectors(id) on delete set null,
  add column if not exists machine_id uuid
    references public.machines(id) on delete set null,
  -- leitura do painel na hora do serviço; nula = o técnico não anotou
  add column if not exists machine_hourmeter numeric(12, 1),
  add column if not exists machine_km        numeric(12, 1),
  -- combustível abastecido; nulo = não abasteceu
  add column if not exists fuel_type text;

create index if not exists idx_supply_requests_sector  on public.supply_requests(sector_id);
create index if not exists idx_supply_requests_machine on public.supply_requests(machine_id);
