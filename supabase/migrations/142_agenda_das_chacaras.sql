-- ============================================================================
-- PRODUMAR — AGENDA DAS CHÁCARAS: os dias reservados e pagos de cada chácara
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Por que:
--
--   A empresa aluga duas chácaras — o Sítio Castro e a Chácara Thalles — para
--   festa e fim de semana. O controle era de cabeça e de caderno, e o medo é
--   alugar o mesmo dia para duas pessoas.
--
--   Cada reserva guarda a chácara, o primeiro e o último dia (pode ser um dia
--   só ou um fim de semana inteiro), o cliente, o valor do aluguel, a forma de
--   pagamento e QUANTO JÁ FOI PAGO. A situação sai dessa conta:
--     nada pago        → reservado
--     pagou uma parte  → sinal pago (falta o resto)
--     pagou tudo       → pago
--
--   A TRAVA CONTRA ALUGAR DUAS VEZES fica no banco: uma constraint de exclusão
--   não deixa duas reservas da mesma chácara com dias que se cruzam, nem se
--   duas pessoas salvarem ao mesmo tempo. A tela avisa antes, com o nome de
--   quem já reservou; o banco é a garantia.
--
-- Nada é apagado: entram duas tabelas. Rodar de novo não quebra.
-- ============================================================================

-- o "=" do uuid dentro do índice GiST da trava
create extension if not exists btree_gist;

-- ----------------------------------------------------------------------------
-- As chácaras
-- ----------------------------------------------------------------------------
create table if not exists public.chacaras (
  id uuid primary key default uuid_generate_v4(),
  nome  text not null unique check (length(trim(nome)) > 0),
  ordem int  not null default 0,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.chacaras (nome, ordem) values
  ('Sítio Castro', 1),
  ('Chácara Thalles', 2)
on conflict (nome) do nothing;

comment on table public.chacaras is
  'As chácaras que a empresa aluga — Sítio Castro e Chácara Thalles (migration 142).';

-- ----------------------------------------------------------------------------
-- As reservas
-- ----------------------------------------------------------------------------
create table if not exists public.chacara_reservas (
  id uuid primary key default uuid_generate_v4(),

  chacara_id uuid not null references public.chacaras(id) on delete restrict,

  -- o primeiro e o último dia da reserva, os dois contam (sáb + dom = 2 dias)
  data_inicio date not null,
  data_fim    date not null,

  cliente_nome     text not null check (length(trim(cliente_nome)) > 0),
  cliente_telefone text,

  valor      numeric(12, 2) not null check (valor >= 0),
  -- o que o cliente já pagou: o sinal ou o total
  valor_pago numeric(12, 2) not null default 0 check (valor_pago >= 0),

  forma_pagamento text not null default 'pix'
    check (forma_pagamento in ('pix', 'dinheiro', 'cartao', 'boleto', 'transferencia', 'outro')),

  -- sai da conta do que já foi pago — ninguém precisa lembrar de mudar
  situacao text generated always as (
    case
      when valor_pago <= 0 then 'reservado'
      when valor_pago < valor then 'sinal'
      else 'pago'
    end
  ) stored,

  observacao text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chacara_reservas_datas check (data_fim >= data_inicio),

  -- A TRAVA: a mesma chácara não tem dois aluguéis com dias que se cruzam
  constraint chacara_reservas_sem_dia_duplicado exclude using gist (
    chacara_id with =,
    daterange(data_inicio, data_fim, '[]') with &&
  )
);

create index if not exists idx_chacara_reservas_datas
  on public.chacara_reservas (data_inicio, data_fim);

comment on table public.chacara_reservas is
  'Reservas das chácaras: dias, cliente, valor, forma e quanto já foi pago. A constraint chacara_reservas_sem_dia_duplicado impede alugar o mesmo dia duas vezes (migration 142).';

-- ============================================================================
-- ROW LEVEL SECURITY — lê quem está logado; grava quem tem o módulo Chácaras
-- ============================================================================
alter table public.chacaras enable row level security;
alter table public.chacara_reservas enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'chacaras' and policyname = 'chacaras_read') then
    create policy "chacaras_read" on public.chacaras
      for select using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'chacaras' and policyname = 'chacaras_write') then
    create policy "chacaras_write" on public.chacaras
      for all
      using (public.user_can_write_module('chacaras'))
      with check (public.user_can_write_module('chacaras'));
  end if;

  if not exists (select 1 from pg_policies where tablename = 'chacara_reservas' and policyname = 'chacara_reservas_read') then
    create policy "chacara_reservas_read" on public.chacara_reservas
      for select using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'chacara_reservas' and policyname = 'chacara_reservas_write') then
    create policy "chacara_reservas_write" on public.chacara_reservas
      for all
      using (public.user_can_write_module('chacaras'))
      with check (public.user_can_write_module('chacaras'));
  end if;
end $$;

-- ============================================================================
-- DEPOIS DE RODAR
-- ============================================================================
--   Admin e financeiro já gravam. Operador e encarregado precisam do módulo
--   "Chácaras" marcado em Configurações → Usuários; o visualizador só olha.
-- ============================================================================
