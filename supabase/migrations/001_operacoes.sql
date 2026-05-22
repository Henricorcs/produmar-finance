-- ============================================================================
-- ILNET Finance — Módulo Operações (Ordens de Serviço)
-- ============================================================================
-- Execute este arquivo no SQL Editor do Supabase
-- (Dashboard → SQL Editor → New Query → cole tudo → Run)
-- ============================================================================

-- ENUMs
create type service_order_type   as enum ('entrega_material', 'prestacao_servico');
create type service_freight_type as enum ('cliente', 'interno');
create type service_order_status as enum ('pendente', 'em_andamento', 'entregue', 'cancelado');

-- ============================================================================
-- TABELA: machines (cadastro de máquinas/veículos da frota)
-- ============================================================================
create table public.machines (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  plate text,
  type text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_machines_active on public.machines(active);

-- ============================================================================
-- TABELA: products (catálogo de materiais: areia, brita, etc.)
-- ============================================================================
create table public.products (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  unit text not null default 'm³',
  default_price numeric(10, 2),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_products_active on public.products(active);

-- Seed inicial de produtos comuns
insert into public.products (name, unit) values
  ('Areia',          'm³'),
  ('Brita 0',        'm³'),
  ('Brita 1',        'm³'),
  ('Brita 2',        'm³'),
  ('Pó de pedra',    'm³'),
  ('Seixo',          'm³'),
  ('Aterro',         'm³');

-- ============================================================================
-- TABELA: pickup_locations (locais de retirada/carga)
-- ============================================================================
create table public.pickup_locations (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  address text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_pickup_locations_active on public.pickup_locations(active);

-- ============================================================================
-- TABELA: service_orders (Ordem de Serviço — OS)
-- ============================================================================
create table public.service_orders (
  id uuid primary key default uuid_generate_v4(),
  order_number serial not null unique,

  type         service_order_type   not null,
  freight_type service_freight_type not null,
  status       service_order_status not null default 'pendente',

  -- Cliente (quando freight_type = 'cliente')
  client_name     text,
  client_document text,
  client_phone    text,

  -- Operação
  machine_id            uuid references public.machines(id) on delete set null,
  pickup_location_id    uuid references public.pickup_locations(id) on delete set null,
  delivery_address      text,
  service_description   text,

  -- Datas
  issue_date    date not null default current_date,
  delivery_date date,

  -- Financeiro
  total_amount    numeric(10, 2) not null default 0,
  transaction_id  uuid references public.transactions(id) on delete set null,

  notes      text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_service_orders_status        on public.service_orders(status);
create index idx_service_orders_delivery_date on public.service_orders(delivery_date desc);
create index idx_service_orders_machine       on public.service_orders(machine_id);
create index idx_service_orders_transaction   on public.service_orders(transaction_id);

-- ============================================================================
-- TABELA: service_order_items (itens da OS)
-- ============================================================================
create table public.service_order_items (
  id uuid primary key default uuid_generate_v4(),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  product_id  uuid references public.products(id) on delete set null,
  description text,
  quantity    numeric(10, 3) not null default 1,
  unit        text,
  unit_price  numeric(10, 2) not null default 0,
  total       numeric(10, 2) generated always as (quantity * unit_price) stored,
  created_at  timestamptz not null default now()
);

create index idx_service_order_items_order on public.service_order_items(service_order_id);

-- ============================================================================
-- TRIGGER: atualiza total_amount da OS quando itens mudam
-- ============================================================================
create or replace function public.recalc_service_order_total()
returns trigger
language plpgsql
as $$
declare
  v_order_id uuid;
begin
  v_order_id := coalesce(new.service_order_id, old.service_order_id);
  update public.service_orders
  set total_amount = coalesce((
    select sum(total) from public.service_order_items where service_order_id = v_order_id
  ), 0)
  where id = v_order_id;
  return null;
end;
$$;

create trigger trg_recalc_so_total_aiu
  after insert or update on public.service_order_items
  for each row execute function public.recalc_service_order_total();

create trigger trg_recalc_so_total_ad
  after delete on public.service_order_items
  for each row execute function public.recalc_service_order_total();

-- ============================================================================
-- TRIGGERS updated_at
-- ============================================================================
create trigger set_machines_updated_at before update on public.machines
  for each row execute function public.set_updated_at();
create trigger set_products_updated_at before update on public.products
  for each row execute function public.set_updated_at();
create trigger set_pickup_locations_updated_at before update on public.pickup_locations
  for each row execute function public.set_updated_at();
create trigger set_service_orders_updated_at before update on public.service_orders
  for each row execute function public.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.machines            enable row level security;
alter table public.products            enable row level security;
alter table public.pickup_locations    enable row level security;
alter table public.service_orders      enable row level security;
alter table public.service_order_items enable row level security;

-- Leitura: todo usuário logado
-- Escrita: admin ou financeiro
create policy "machines_read"  on public.machines  for select using (auth.uid() is not null);
create policy "machines_write" on public.machines  for all
  using (public.current_user_role() in ('admin', 'financeiro'));

create policy "products_read"  on public.products  for select using (auth.uid() is not null);
create policy "products_write" on public.products  for all
  using (public.current_user_role() in ('admin', 'financeiro'));

create policy "pickup_locations_read"  on public.pickup_locations  for select using (auth.uid() is not null);
create policy "pickup_locations_write" on public.pickup_locations  for all
  using (public.current_user_role() in ('admin', 'financeiro'));

create policy "service_orders_read"  on public.service_orders  for select using (auth.uid() is not null);
create policy "service_orders_write" on public.service_orders  for all
  using (public.current_user_role() in ('admin', 'financeiro'));

create policy "service_order_items_read"  on public.service_order_items for select using (auth.uid() is not null);
create policy "service_order_items_write" on public.service_order_items for all
  using (public.current_user_role() in ('admin', 'financeiro'));
