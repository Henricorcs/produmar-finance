-- ============================================================================
-- PRODUMAR — ALUGUEL DE IMPRESSORAS: leitura do contador e fatura do mês
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE UMA VEZ SÓ, e pode rodar de novo.
--
-- Rodar depois da 078 (módulo Aluguéis) — as regras de acesso são as dele.
-- ============================================================================
-- Por que:
--
--   O aluguel de impressora era controlado numa planilha: o "Relatório mensal
--   de impressões". Todo mês alguém lê o contador de cada máquina, subtrai a
--   leitura do mês anterior, multiplica pelo preço da página, soma a
--   mensalidade de cada uma e desconta a franquia do contrato. Um erro de
--   digitação na leitura anterior e a fatura inteira sai errada — e não há
--   onde ver como cada impressora vem evoluindo.
--
--   Aqui entram quatro coisas:
--
--   1) O CONTRATO — de quem é (o cliente), o número, a FRANQUIA de páginas que
--      já está paga e o preço da página.
--   2) A IMPRESSORA — a unidade, o número de série, o modelo, a mensalidade e
--      o contador de quando foi instalada.
--   3) A FATURA DO MÊS — a data da leitura anterior e da atual, os totais e a
--      baixa (quando o cliente pagou).
--   4) A LEITURA — o contador de cada impressora naquele mês. A leitura
--      anterior vem da fatura do mês passado; ninguém digita de novo.
--
--   A CONTA, igual à planilha:
--     páginas            = leitura atual − leitura anterior
--     valor da impressão = páginas × preço da página
--     franquia           = páginas da franquia × preço (DESCONTADA)
--     total da fatura    = mensalidades + impressões − franquia
--
--   Mensalidade e preço são COPIADOS para a leitura no fechamento do mês: um
--   reajuste amanhã não reescreve a fatura que já foi cobrada.
--
--   Como o resto de Aluguéis, nada daqui vira lançamento no módulo Contas.
--
-- Nada é apagado: entram quatro tabelas.
-- ============================================================================

-- ── 1) O contrato ───────────────────────────────────────────────────────────
create table if not exists public.printer_contracts (
  id uuid primary key default uuid_generate_v4(),

  client_name     text not null,        -- ACQUA
  client_document text,                 -- CNPJ
  contract_number text,                 -- 1895/2022
  issuer_name     text,                 -- quem cobra, no cabeçalho do relatório

  -- as páginas que o contrato já cobre: saem do total da fatura
  franchise_pages integer not null default 0 check (franchise_pages >= 0),
  -- o preço da página que vale para todas, quando a impressora não tem o seu
  page_price numeric(10, 4) not null default 0.05 check (page_price >= 0),

  due_day    integer not null default 10 check (due_day between 1 and 31),
  start_date date not null default current_date,
  status     text not null default 'ativo',

  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.printer_contracts drop constraint if exists printer_contracts_status_check;
alter table public.printer_contracts add constraint printer_contracts_status_check
  check (status in ('ativo', 'encerrado'));

comment on table public.printer_contracts is
  'Contrato de aluguel de impressoras: cliente, franquia de páginas e preço da página (migration 096).';

-- ── 2) A impressora ─────────────────────────────────────────────────────────
create table if not exists public.printers (
  id uuid primary key default uuid_generate_v4(),

  contract_id uuid not null references public.printer_contracts(id) on delete cascade,

  unit          integer not null,        -- UNID: 1, 2, 3...
  serial_number text not null,           -- U63883D2N864009
  model         text,                    -- HL - L2360DW
  location      text,                    -- onde ela está (setor, sala)

  monthly_fee numeric(12, 2) not null default 0 check (monthly_fee >= 0),
  -- vazio = usa o preço da página do contrato
  page_price  numeric(10, 4) check (page_price >= 0),
  -- o contador no dia em que foi instalada: é a "leitura anterior" do 1º mês
  initial_reading bigint not null default 0 check (initial_reading >= 0),

  active boolean not null default true,
  notes  text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_printers_contract on public.printers(contract_id, unit);

comment on table public.printers is
  'Impressora alugada: unidade, série, modelo, mensalidade e contador inicial (migration 096).';

-- ── 3) A fatura do mês ──────────────────────────────────────────────────────
create table if not exists public.printer_billings (
  id uuid primary key default uuid_generate_v4(),

  contract_id uuid not null references public.printer_contracts(id) on delete cascade,

  competencia   date not null,           -- o mês de referência, no dia 1
  previous_date date,                    -- DATA DA LEITURA anterior
  reading_date  date not null,           -- DATA DA LEITURA atual
  due_date      date,                    -- vencimento da fatura

  -- a franquia como estava no fechamento (reajuste não reescreve o passado)
  franchise_pages integer not null default 0,
  franchise_price numeric(10, 4) not null default 0,

  -- os totais, gravados no fechamento — é o que o relatório e a evolução leem
  total_pages      bigint         not null default 0,
  total_fees       numeric(12, 2) not null default 0,
  total_prints     numeric(12, 2) not null default 0,
  franchise_amount numeric(12, 2) not null default 0,
  total_amount     numeric(12, 2) not null default 0,

  -- a baixa
  paid_at     date,
  paid_amount numeric(12, 2) not null default 0 check (paid_amount >= 0),
  method      text,

  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Um contrato, um mês, uma fatura: lançar de novo CORRIGE, não duplica.
create unique index if not exists uq_printer_billings_mes
  on public.printer_billings(contract_id, competencia);

comment on table public.printer_billings is
  'A fatura do mês de um contrato de impressoras, com os totais e a baixa (migration 096).';

-- ── 4) A leitura de cada impressora no mês ──────────────────────────────────
create table if not exists public.printer_readings (
  id uuid primary key default uuid_generate_v4(),

  billing_id uuid not null references public.printer_billings(id) on delete cascade,
  printer_id uuid not null references public.printers(id) on delete cascade,

  previous_reading bigint not null check (previous_reading >= 0),
  current_reading  bigint not null check (current_reading >= 0),

  -- copiados no fechamento
  monthly_fee numeric(12, 2) not null default 0,
  page_price  numeric(10, 4) not null default 0,

  created_at timestamptz not null default now(),

  constraint printer_readings_contador_anda_para_frente
    check (current_reading >= previous_reading)
);

create unique index if not exists uq_printer_readings_impressora
  on public.printer_readings(billing_id, printer_id);
create index if not exists idx_printer_readings_printer
  on public.printer_readings(printer_id);

comment on table public.printer_readings is
  'O contador de uma impressora num mês: leitura anterior, atual, mensalidade e preço (migration 096).';

-- ── Quem mexe ───────────────────────────────────────────────────────────────
-- Leitura: qualquer logado. Escrita: quem manda no módulo Aluguéis.
alter table public.printer_contracts enable row level security;
alter table public.printers          enable row level security;
alter table public.printer_billings  enable row level security;
alter table public.printer_readings  enable row level security;

drop policy if exists "printer_contracts_read"  on public.printer_contracts;
drop policy if exists "printer_contracts_write" on public.printer_contracts;
create policy "printer_contracts_read" on public.printer_contracts
  for select using (auth.uid() is not null);
create policy "printer_contracts_write" on public.printer_contracts
  for all using (public.user_can_write_module('alugueis'))
  with check (public.user_can_write_module('alugueis'));

drop policy if exists "printers_read"  on public.printers;
drop policy if exists "printers_write" on public.printers;
create policy "printers_read" on public.printers
  for select using (auth.uid() is not null);
create policy "printers_write" on public.printers
  for all using (public.user_can_write_module('alugueis'))
  with check (public.user_can_write_module('alugueis'));

drop policy if exists "printer_billings_read"  on public.printer_billings;
drop policy if exists "printer_billings_write" on public.printer_billings;
create policy "printer_billings_read" on public.printer_billings
  for select using (auth.uid() is not null);
create policy "printer_billings_write" on public.printer_billings
  for all using (public.user_can_write_module('alugueis'))
  with check (public.user_can_write_module('alugueis'));

drop policy if exists "printer_readings_read"  on public.printer_readings;
drop policy if exists "printer_readings_write" on public.printer_readings;
create policy "printer_readings_read" on public.printer_readings
  for select using (auth.uid() is not null);
create policy "printer_readings_write" on public.printer_readings
  for all using (public.user_can_write_module('alugueis'))
  with check (public.user_can_write_module('alugueis'));
