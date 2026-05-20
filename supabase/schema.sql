-- ============================================================================
-- ILNET Finance — Schema Supabase (PostgreSQL)
-- ============================================================================
-- Execute este arquivo no SQL Editor do Supabase
-- (Dashboard → SQL Editor → New Query → cole tudo → Run)
-- ============================================================================

-- Extensões
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================================
-- ENUMs
-- ============================================================================

create type user_role as enum ('admin', 'financeiro', 'visualizador');
create type transaction_type as enum ('entrada', 'saida');
create type transaction_status as enum ('pendente', 'pago', 'recebido', 'vencido', 'cancelado');
create type invoice_source as enum ('xml', 'pdf', 'manual');
create type alert_type as enum ('vencimento_proximo', 'vencido', 'resumo_diario', 'resumo_semanal');

-- ============================================================================
-- TABELA: profiles (extensão de auth.users)
-- ============================================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role user_role not null default 'financeiro',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger pra criar profile automaticamente quando user é criado no auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'financeiro')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- TABELA: categories (categorias de receita/despesa)
-- ============================================================================
create table public.categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type transaction_type not null,
  color text not null default '#0F62D8',
  icon text,
  parent_id uuid references public.categories(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(name, type)
);

-- Seed inicial de categorias
insert into public.categories (name, type, color, icon) values
  ('Mensalidades clientes', 'entrada', '#0F62D8', 'wifi'),
  ('Instalações', 'entrada', '#1976E8', 'tools'),
  ('Venda de equipamentos', 'entrada', '#4A9EFF', 'router'),
  ('Outras receitas', 'entrada', '#6BB6FF', 'cash'),
  ('Infraestrutura de rede', 'saida', '#A32D2D', 'server'),
  ('Folha de pagamento', 'saida', '#E24B4A', 'users'),
  ('Frota e combustível', 'saida', '#BA7517', 'truck'),
  ('Aluguel e energia', 'saida', '#854F0B', 'building'),
  ('Marketing', 'saida', '#5F5E5A', 'megaphone'),
  ('Impostos', 'saida', '#444441', 'file-text'),
  ('Outras despesas', 'saida', '#888780', 'dots');

-- ============================================================================
-- TABELA: cost_centers (centros de custo)
-- ============================================================================
create table public.cost_centers (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.cost_centers (name, description) values
  ('Operacional', 'Custos operacionais gerais'),
  ('Comercial', 'Vendas e marketing'),
  ('Administrativo', 'Estrutura administrativa'),
  ('Técnico', 'Infra e suporte técnico');

-- ============================================================================
-- TABELA: contacts (clientes/fornecedores)
-- ============================================================================
create table public.contacts (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  document text, -- CPF/CNPJ
  email text,
  phone text,
  is_supplier boolean default false,
  is_customer boolean default false,
  notes text,
  created_at timestamptz not null default now(),
  unique(document)
);

-- ============================================================================
-- TABELA: transactions (lançamentos financeiros)
-- ============================================================================
create table public.transactions (
  id uuid primary key default uuid_generate_v4(),
  type transaction_type not null,
  description text not null,
  amount numeric(14,2) not null check (amount >= 0),
  due_date date not null,
  paid_date date,
  status transaction_status not null default 'pendente',
  category_id uuid references public.categories(id) on delete set null,
  cost_center_id uuid references public.cost_centers(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  invoice_id uuid, -- FK criada depois (referência circular)
  notes text,
  attachment_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_transactions_due_date on public.transactions(due_date);
create index idx_transactions_status on public.transactions(status);
create index idx_transactions_type on public.transactions(type);

-- ============================================================================
-- TABELA: invoices (notas fiscais)
-- ============================================================================
create table public.invoices (
  id uuid primary key default uuid_generate_v4(),
  source invoice_source not null,
  access_key text, -- chave de acesso da NFe (44 dígitos)
  number text,
  series text,
  issue_date date,
  emitter_document text, -- CNPJ do emissor
  emitter_name text,
  receiver_document text, -- CNPJ do destinatário
  receiver_name text,
  total_amount numeric(14,2),
  direction transaction_type, -- 'entrada' se ILNET é destinatário, 'saida' se emissor
  file_url text, -- URL do XML/PDF no Storage
  raw_data jsonb, -- payload completo do parser
  processed boolean default false,
  transaction_id uuid references public.transactions(id) on delete set null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(access_key)
);

-- Agora cria a FK reversa em transactions
alter table public.transactions
  add constraint fk_transactions_invoice
  foreign key (invoice_id) references public.invoices(id) on delete set null;

create index idx_invoices_emitter on public.invoices(emitter_document);
create index idx_invoices_processed on public.invoices(processed);

-- ============================================================================
-- TABELA: bank_imports (importações OFX/CSV)
-- ============================================================================
create table public.bank_imports (
  id uuid primary key default uuid_generate_v4(),
  filename text not null,
  bank_name text,
  account text,
  period_start date,
  period_end date,
  total_entries integer default 0,
  imported_entries integer default 0,
  status text default 'pendente', -- pendente | processado | erro
  raw_data jsonb,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- TABELA: alert_configs (configuração de alertas por usuário)
-- ============================================================================
create table public.alert_configs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  alert_type alert_type not null,
  enabled boolean not null default true,
  days_before integer, -- pra vencimento_proximo: 3, 7, 15
  created_at timestamptz not null default now(),
  unique(user_id, alert_type, days_before)
);

-- ============================================================================
-- TABELA: alerts_log (log de alertas enviados)
-- ============================================================================
create table public.alerts_log (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  alert_type alert_type not null,
  subject text,
  body text,
  transaction_ids uuid[],
  sent_at timestamptz not null default now(),
  status text default 'enviado' -- enviado | erro
);

-- ============================================================================
-- VIEWS auxiliares
-- ============================================================================

-- KPIs do mês corrente
create or replace view public.v_dashboard_kpis as
select
  coalesce(sum(case when type = 'entrada' and status = 'recebido' and date_trunc('month', paid_date) = date_trunc('month', current_date) then amount end), 0) as receitas_mes,
  coalesce(sum(case when type = 'saida' and status = 'pago' and date_trunc('month', paid_date) = date_trunc('month', current_date) then amount end), 0) as despesas_mes,
  coalesce(sum(case when type = 'saida' and status in ('pendente', 'vencido') and due_date between current_date and current_date + interval '7 days' then amount end), 0) as a_pagar_7dias,
  coalesce(sum(case when type = 'entrada' and status = 'recebido' then amount end) -
           sum(case when type = 'saida' and status = 'pago' then amount end), 0) as saldo_atual,
  count(*) filter (where type = 'entrada' and date_trunc('month', due_date) = date_trunc('month', current_date)) as count_receitas_mes,
  count(*) filter (where type = 'saida' and date_trunc('month', due_date) = date_trunc('month', current_date)) as count_despesas_mes,
  count(*) filter (where type = 'saida' and status in ('pendente', 'vencido') and due_date between current_date and current_date + interval '7 days') as count_a_pagar_7dias
from public.transactions;

-- Despesas por categoria no mês
create or replace view public.v_expenses_by_category as
select
  c.id as category_id,
  c.name as category_name,
  c.color as category_color,
  coalesce(sum(t.amount), 0) as total,
  count(t.id) as count
from public.categories c
left join public.transactions t on t.category_id = c.id
  and t.type = 'saida'
  and date_trunc('month', t.due_date) = date_trunc('month', current_date)
where c.type = 'saida'
group by c.id, c.name, c.color
order by total desc;

-- Fluxo de caixa dos últimos 6 meses
create or replace view public.v_cashflow_6m as
select
  to_char(date_trunc('month', d), 'YYYY-MM') as month,
  to_char(date_trunc('month', d), 'TMMon') as month_label,
  coalesce(sum(case when t.type = 'entrada' then t.amount end), 0) as receitas,
  coalesce(sum(case when t.type = 'saida' then t.amount end), 0) as despesas
from generate_series(
  date_trunc('month', current_date - interval '5 months'),
  date_trunc('month', current_date),
  interval '1 month'
) d
left join public.transactions t on date_trunc('month', t.due_date) = d
group by d
order by d;

-- ============================================================================
-- TRIGGERS de updated_at
-- ============================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger set_transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

-- Auto-marca vencidos
create or replace function public.mark_overdue()
returns void language sql as $$
  update public.transactions
  set status = 'vencido'
  where status = 'pendente' and due_date < current_date;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.cost_centers enable row level security;
alter table public.contacts enable row level security;
alter table public.transactions enable row level security;
alter table public.invoices enable row level security;
alter table public.bank_imports enable row level security;
alter table public.alert_configs enable row level security;
alter table public.alerts_log enable row level security;

-- Helper: pega role do usuário logado
create or replace function public.current_user_role()
returns user_role
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- PROFILES: cada user vê seu próprio + admin vê todos
create policy "profiles_select" on public.profiles for select
  using (auth.uid() = id or public.current_user_role() = 'admin');
create policy "profiles_update_own" on public.profiles for update
  using (auth.uid() = id);
create policy "profiles_admin_all" on public.profiles for all
  using (public.current_user_role() = 'admin');

-- CATEGORIES, COST_CENTERS, CONTACTS: todos logados leem; só admin/financeiro escreve
create policy "categories_read" on public.categories for select using (auth.uid() is not null);
create policy "categories_write" on public.categories for all
  using (public.current_user_role() in ('admin', 'financeiro'));

create policy "cost_centers_read" on public.cost_centers for select using (auth.uid() is not null);
create policy "cost_centers_write" on public.cost_centers for all
  using (public.current_user_role() in ('admin', 'financeiro'));

create policy "contacts_read" on public.contacts for select using (auth.uid() is not null);
create policy "contacts_write" on public.contacts for all
  using (public.current_user_role() in ('admin', 'financeiro'));

-- TRANSACTIONS: todos logados leem; admin/financeiro escrevem
create policy "transactions_read" on public.transactions for select using (auth.uid() is not null);
create policy "transactions_write" on public.transactions for all
  using (public.current_user_role() in ('admin', 'financeiro'));

-- INVOICES: todos logados leem; admin/financeiro escrevem
create policy "invoices_read" on public.invoices for select using (auth.uid() is not null);
create policy "invoices_write" on public.invoices for all
  using (public.current_user_role() in ('admin', 'financeiro'));

-- BANK_IMPORTS: todos logados leem; admin/financeiro escrevem
create policy "bank_imports_read" on public.bank_imports for select using (auth.uid() is not null);
create policy "bank_imports_write" on public.bank_imports for all
  using (public.current_user_role() in ('admin', 'financeiro'));

-- ALERT_CONFIGS e ALERTS_LOG: cada user vê os seus
create policy "alert_configs_own" on public.alert_configs for all
  using (user_id = auth.uid());
create policy "alerts_log_own" on public.alerts_log for select
  using (user_id = auth.uid() or public.current_user_role() = 'admin');

-- ============================================================================
-- STORAGE: bucket pra notas fiscais e extratos
-- ============================================================================
insert into storage.buckets (id, name, public) values ('invoices', 'invoices', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('bank-statements', 'bank-statements', false)
  on conflict (id) do nothing;

create policy "Authenticated read invoices" on storage.objects for select
  using (bucket_id = 'invoices' and auth.uid() is not null);
create policy "Authenticated upload invoices" on storage.objects for insert
  with check (bucket_id = 'invoices' and auth.uid() is not null);
create policy "Authenticated read bank" on storage.objects for select
  using (bucket_id = 'bank-statements' and auth.uid() is not null);
create policy "Authenticated upload bank" on storage.objects for insert
  with check (bucket_id = 'bank-statements' and auth.uid() is not null);
