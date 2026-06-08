-- ============================================================================
-- ILNET Finance — Módulo Estoque (Jazidas, Compras de material e Movimentações)
-- ============================================================================
-- Execute este arquivo no SQL Editor do Supabase
-- (Dashboard → SQL Editor → New Query → cole tudo → Run)
-- ============================================================================
-- Conceito:
--   • Jazida  = local de retirada (pickup_locations) de onde compramos material.
--               Ganha CNPJ/telefone para funcionar como fornecedor.
--   • Compra  = lançamento do que compramos (itens material × qtd × preço).
--               O saldo devedor vira uma "conta a pagar" no módulo Contas.
--   • Estoque = saldo por material: COMPRA entra (+), ENTREGA na OS sai (−).
--               A baixa por OS é feita por trigger (cobre admin e operador).
-- ============================================================================

-- ── Jazida = pickup_locations + campos de fornecedor ────────────────────────
alter table public.pickup_locations
  add column if not exists document text,
  add column if not exists phone    text;

-- ── ENUM de movimentação de estoque ─────────────────────────────────────────
do $$ begin
  create type stock_movement_type as enum ('entrada', 'saida', 'ajuste');
exception
  when duplicate_object then null;
end $$;

-- ── Categoria dedicada para compras de material (conta a pagar) ──────────────
insert into public.categories (name, type, color, icon)
select 'Compra de material', 'saida', '#B45309', 'package'
where not exists (
  select 1 from public.categories where name = 'Compra de material' and type = 'saida'
);

-- ============================================================================
-- TABELA: material_purchases (compra de material de uma jazida)
-- ============================================================================
create table if not exists public.material_purchases (
  id uuid primary key default uuid_generate_v4(),
  purchase_number serial not null unique,

  location_id   uuid references public.pickup_locations(id) on delete set null,
  purchase_date date not null default current_date,

  total_amount  numeric(12, 2) not null default 0,  -- soma dos itens
  amount_paid   numeric(12, 2) not null default 0,   -- pago no ato

  -- conta a pagar gerada para o saldo devedor (total − pago)
  transaction_id uuid references public.transactions(id) on delete set null,

  notes      text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_material_purchases_location on public.material_purchases(location_id);
create index if not exists idx_material_purchases_date     on public.material_purchases(purchase_date desc);

-- ============================================================================
-- TABELA: material_purchase_items (itens da compra)
-- ============================================================================
create table if not exists public.material_purchase_items (
  id uuid primary key default uuid_generate_v4(),
  purchase_id uuid not null references public.material_purchases(id) on delete cascade,
  product_id  uuid references public.products(id) on delete set null,
  quantity    numeric(12, 3) not null default 1,
  unit        text,
  unit_price  numeric(12, 2) not null default 0,
  total       numeric(12, 2) generated always as (quantity * unit_price) stored,
  created_at  timestamptz not null default now()
);

create index if not exists idx_material_purchase_items_purchase on public.material_purchase_items(purchase_id);

-- ============================================================================
-- TABELA: stock_movements (livro-razão do estoque)
-- ============================================================================
create table if not exists public.stock_movements (
  id uuid primary key default uuid_generate_v4(),
  product_id  uuid not null references public.products(id) on delete cascade,
  location_id uuid references public.pickup_locations(id) on delete set null,

  type     stock_movement_type not null,
  -- entrada/saida: sempre positivo. ajuste: assinado (negativo reduz o saldo).
  quantity numeric(12, 3) not null,
  unit     text,
  unit_cost numeric(12, 2),               -- custo unitário (entradas)

  movement_date date not null default current_date,

  -- origens (uma das duas, ou nenhuma para ajuste manual)
  purchase_id      uuid references public.material_purchases(id) on delete cascade,
  service_order_id uuid references public.service_orders(id)     on delete cascade,

  notes      text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_movements_product on public.stock_movements(product_id);
create index if not exists idx_stock_movements_so       on public.stock_movements(service_order_id);
create index if not exists idx_stock_movements_purchase on public.stock_movements(purchase_id);
create index if not exists idx_stock_movements_date     on public.stock_movements(movement_date desc);

-- ============================================================================
-- VIEW: product_stock_balance (saldo atual por material)
-- ============================================================================
create or replace view public.product_stock_balance
with (security_invoker = on) as
select
  p.id   as product_id,
  p.name,
  p.unit,
  coalesce(sum(
    case m.type
      when 'entrada' then  m.quantity
      when 'saida'   then -m.quantity
      when 'ajuste'  then  m.quantity
    end
  ), 0) as current_quantity,
  coalesce(sum(case when m.type = 'entrada' then m.quantity else 0 end), 0) as total_in,
  coalesce(sum(case when m.type = 'saida'   then m.quantity else 0 end), 0) as total_out,
  coalesce(sum(case when m.type = 'entrada' then m.quantity * coalesce(m.unit_cost, 0) else 0 end), 0) as total_purchased_value,
  case
    when sum(case when m.type = 'entrada' then m.quantity else 0 end) > 0
    then sum(case when m.type = 'entrada' then m.quantity * coalesce(m.unit_cost, 0) else 0 end)
         / sum(case when m.type = 'entrada' then m.quantity else 0 end)
    else null
  end as avg_unit_cost
from public.products p
left join public.stock_movements m on m.product_id = p.id
group by p.id, p.name, p.unit;

-- ============================================================================
-- BAIXA DE ESTOQUE POR OS — sincroniza movimentos de saída de uma OS
-- ============================================================================
-- Regra: quando uma OS de ENTREGA DE MATERIAL está com status 'entregue',
-- cada item com produto vira uma saída de estoque. Em qualquer outro status
-- (ou ao cancelar) as saídas daquela OS são removidas. Idempotente.
create or replace function public.sync_os_stock_movements(p_order_id uuid)
returns void
language plpgsql
as $$
declare
  v_status text;
  v_type   text;
  v_date   date;
begin
  select status::text, type::text, coalesce(delivery_date, current_date)
    into v_status, v_type, v_date
  from public.service_orders
  where id = p_order_id;

  -- limpa as saídas previamente geradas por esta OS
  delete from public.stock_movements
  where service_order_id = p_order_id and type = 'saida';

  -- recria apenas se a OS de material foi entregue
  if v_status = 'entregue' and v_type = 'entrega_material' then
    insert into public.stock_movements
      (product_id, location_id, type, quantity, unit, movement_date, service_order_id, notes)
    select
      i.product_id,
      so.pickup_location_id,
      'saida',
      i.quantity,
      i.unit,
      v_date,
      p_order_id,
      'Baixa automática — entrega da OS #' || so.order_number
    from public.service_order_items i
    join public.service_orders so on so.id = i.service_order_id
    where i.service_order_id = p_order_id
      and i.product_id is not null;
  end if;
end;
$$;

-- trigger no cabeçalho da OS (mudança de status/data)
create or replace function public.trg_os_stock_header()
returns trigger
language plpgsql
as $$
begin
  perform public.sync_os_stock_movements(coalesce(new.id, old.id));
  return null;
end;
$$;

drop trigger if exists trg_os_stock_header_aiu on public.service_orders;
create trigger trg_os_stock_header_aiu
  after insert or update on public.service_orders
  for each row execute function public.trg_os_stock_header();

-- trigger nos itens (cobre edição/criação de itens de uma OS já entregue)
create or replace function public.trg_os_stock_items()
returns trigger
language plpgsql
as $$
begin
  perform public.sync_os_stock_movements(coalesce(new.service_order_id, old.service_order_id));
  return null;
end;
$$;

drop trigger if exists trg_os_stock_items_aiud on public.service_order_items;
create trigger trg_os_stock_items_aiud
  after insert or update or delete on public.service_order_items
  for each row execute function public.trg_os_stock_items();

-- ============================================================================
-- updated_at em material_purchases
-- ============================================================================
drop trigger if exists set_material_purchases_updated_at on public.material_purchases;
create trigger set_material_purchases_updated_at before update on public.material_purchases
  for each row execute function public.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.material_purchases      enable row level security;
alter table public.material_purchase_items enable row level security;
alter table public.stock_movements         enable row level security;

-- Leitura: todo usuário logado. Escrita: admin/financeiro.
drop policy if exists "material_purchases_read"  on public.material_purchases;
drop policy if exists "material_purchases_write" on public.material_purchases;
create policy "material_purchases_read"  on public.material_purchases for select using (auth.uid() is not null);
create policy "material_purchases_write" on public.material_purchases for all
  using (public.current_user_role() in ('admin', 'financeiro'));

drop policy if exists "material_purchase_items_read"  on public.material_purchase_items;
drop policy if exists "material_purchase_items_write" on public.material_purchase_items;
create policy "material_purchase_items_read"  on public.material_purchase_items for select using (auth.uid() is not null);
create policy "material_purchase_items_write" on public.material_purchase_items for all
  using (public.current_user_role() in ('admin', 'financeiro'));

drop policy if exists "stock_movements_read"  on public.stock_movements;
drop policy if exists "stock_movements_write" on public.stock_movements;
create policy "stock_movements_read"  on public.stock_movements for select using (auth.uid() is not null);
create policy "stock_movements_write" on public.stock_movements for all
  using (public.current_user_role() in ('admin', 'financeiro'));

-- ============================================================================
-- BACKFILL — gera saídas para OS de material já entregues
-- ============================================================================
do $$
declare r record;
begin
  for r in
    select id from public.service_orders
    where status = 'entregue' and type = 'entrega_material'
  loop
    perform public.sync_os_stock_movements(r.id);
  end loop;
end $$;
