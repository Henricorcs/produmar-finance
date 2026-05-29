-- ============================================================================
-- Produmar Finance — Módulo Empréstimos (dinheiro emprestado a terceiros)
-- ============================================================================
-- Execute este arquivo no SQL Editor do Supabase
-- (Dashboard → SQL Editor → New Query → cole tudo → Run)
-- ============================================================================

-- ENUMs
create type loan_repayment_type as enum ('avulso', 'parcelado');
create type loan_status         as enum ('em_aberto', 'quitado', 'cancelado');

-- ============================================================================
-- CATEGORIAS dedicadas (para identificar os lançamentos no fluxo de caixa)
-- ============================================================================
insert into public.categories (name, type, color, icon) values
  ('Empréstimo concedido',      'saida',   '#7C3AED', 'hand-coins'),
  ('Recebimento de empréstimo', 'entrada', '#7C3AED', 'hand-coins')
on conflict (name, type) do nothing;

-- ============================================================================
-- TABELA: loans (empréstimo concedido a uma pessoa)
-- ============================================================================
create table public.loans (
  id uuid primary key default uuid_generate_v4(),
  loan_number serial not null unique,

  -- Devedor
  borrower_name     text not null,
  borrower_document text,
  borrower_phone    text,

  -- Valores
  principal      numeric(14, 2) not null check (principal > 0),
  interest_rate  numeric(6, 3),   -- % ao mês (juros simples). null = sem juros
  term_months    integer,         -- prazo em meses (usado p/ calcular juros e gerar parcelas)

  -- Forma de pagamento
  repayment_type     loan_repayment_type not null default 'avulso',
  installments_count integer,      -- nº de parcelas (quando parcelado)

  -- Datas
  loan_date date not null default current_date,
  due_date  date,                  -- vencimento final (pagamento único / avulso)

  status loan_status not null default 'em_aberto',

  -- Vínculo com o lançamento de SAÍDA (dinheiro que saiu do caixa)
  transaction_id uuid references public.transactions(id) on delete set null,

  notes      text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_loans_status      on public.loans(status);
create index idx_loans_loan_date   on public.loans(loan_date desc);
create index idx_loans_transaction on public.loans(transaction_id);

-- ============================================================================
-- TABELA: loan_installments (cronograma de parcelas — só quando parcelado)
-- ============================================================================
create table public.loan_installments (
  id uuid primary key default uuid_generate_v4(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  number  integer not null,
  due_date date not null,
  amount   numeric(14, 2) not null check (amount >= 0),
  paid     boolean not null default false,
  created_at timestamptz not null default now(),
  unique (loan_id, number)
);

create index idx_loan_installments_loan on public.loan_installments(loan_id);

-- ============================================================================
-- TABELA: loan_payments (pagamentos recebidos do devedor)
-- ============================================================================
create table public.loan_payments (
  id uuid primary key default uuid_generate_v4(),
  loan_id uuid not null references public.loans(id) on delete cascade,
  installment_id uuid references public.loan_installments(id) on delete set null,
  amount       numeric(14, 2) not null check (amount > 0),
  payment_date date not null default current_date,

  -- Vínculo com o lançamento de ENTRADA (dinheiro que voltou ao caixa)
  transaction_id uuid references public.transactions(id) on delete set null,

  notes      text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_loan_payments_loan        on public.loan_payments(loan_id);
create index idx_loan_payments_installment on public.loan_payments(installment_id);

-- ============================================================================
-- TRIGGER updated_at
-- ============================================================================
create trigger set_loans_updated_at before update on public.loans
  for each row execute function public.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
--   Leitura: todo usuário logado
--   Escrita: admin ou financeiro
-- ============================================================================
alter table public.loans              enable row level security;
alter table public.loan_installments  enable row level security;
alter table public.loan_payments      enable row level security;

create policy "loans_read"  on public.loans  for select using (auth.uid() is not null);
create policy "loans_write" on public.loans  for all
  using (public.current_user_role() in ('admin', 'financeiro'));

create policy "loan_installments_read"  on public.loan_installments for select using (auth.uid() is not null);
create policy "loan_installments_write" on public.loan_installments for all
  using (public.current_user_role() in ('admin', 'financeiro'));

create policy "loan_payments_read"  on public.loan_payments for select using (auth.uid() is not null);
create policy "loan_payments_write" on public.loan_payments for all
  using (public.current_user_role() in ('admin', 'financeiro'));
