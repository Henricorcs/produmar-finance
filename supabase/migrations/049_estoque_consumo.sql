-- ============================================================================
-- ILNET Finance — Módulo ESTOQUE (material de consumo)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Conceito:
--   • Diferente do Patrimônio, aqui o material é CONSUMÍVEL: cano, emenda,
--     cola, fita. Sai e não volta — por isso não existe empréstimo/devolução.
--   • Item     = o que fica guardado (nome, unidade, estoque mínimo).
--   • Movimento= entrada (chegou), saída (foi usado) ou ajuste (contagem).
--                O saldo NUNCA é gravado: sempre nasce da soma dos movimentos.
--   • Categoria= agrupamento opcional (hidráulica, elétrica...) — vira o
--                filtro do topo da tela.
--
--   Nada aqui encosta no /estoque antigo (jazidas e compra de areia/brita),
--   que continua com suas tabelas material_purchases / stock_movements.
-- ============================================================================

-- ── ENUM de movimentação ────────────────────────────────────────────────────
do $$ begin
  create type supply_movement_type as enum ('entrada', 'saida', 'ajuste');
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- TABELA: supply_categories (agrupamento dos itens)
-- ============================================================================
create table if not exists public.supply_categories (
  id   uuid primary key default uuid_generate_v4(),
  name text not null unique,                  -- HIDRÁULICA, ELÉTRICA, COLAS...

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- TABELA: supply_items (o que fica guardado)
-- ============================================================================
create table if not exists public.supply_items (
  id uuid primary key default uuid_generate_v4(),
  item_number serial not null unique,

  name text not null,
  code text,                                  -- código interno (opcional)

  category_id uuid references public.supply_categories(id) on delete set null,

  unit text not null default 'un',            -- un, m, kg, L, pç, rolo, barra...

  -- avisa quando o saldo chega nesse ponto (0 = sem aviso)
  min_quantity numeric(12, 3) not null default 0,

  location text,                              -- prateleira / onde fica
  notes    text,
  active   boolean not null default true,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_supply_items_name     on public.supply_items(name);
create index if not exists idx_supply_items_category on public.supply_items(category_id);

-- ============================================================================
-- TABELA: supply_movements (livro-razão do estoque)
-- ============================================================================
create table if not exists public.supply_movements (
  id uuid primary key default uuid_generate_v4(),
  item_id uuid not null references public.supply_items(id) on delete cascade,

  type supply_movement_type not null,
  -- entrada/saida: sempre positivo. ajuste: assinado (negativo reduz o saldo).
  quantity  numeric(12, 3) not null,
  unit_cost numeric(12, 2),                   -- quanto custou a unidade (entradas)

  person      text,                           -- quem pegou (saída) / de quem veio (entrada)
  destination text,                           -- pra onde foi

  movement_date date not null default current_date,

  notes      text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_supply_movements_item on public.supply_movements(item_id);
create index if not exists idx_supply_movements_date on public.supply_movements(movement_date desc);

-- ============================================================================
-- VIEW: v_supply_stock (item + saldo, custo médio, valor e status)
-- ============================================================================
-- O saldo é derivado — não existe coluna de saldo em lugar nenhum. Assim
-- apagar/editar um movimento acerta o estoque sozinho, sem rotina de correção.
-- ============================================================================
drop view if exists public.v_supply_stock;
create view public.v_supply_stock
with (security_invoker = on) as
select
  i.*,
  c.name as category_name,

  s.current_quantity,
  s.total_in,
  s.total_out,
  s.avg_unit_cost,
  round(s.current_quantity * coalesce(s.avg_unit_cost, 0), 2) as stock_value,
  s.last_movement_at,

  case
    when s.current_quantity <= 0                                        then 'zerado'
    when i.min_quantity > 0 and s.current_quantity <= i.min_quantity    then 'baixo'
    else 'ok'
  end as status
from public.supply_items i
left join public.supply_categories c on c.id = i.category_id
left join lateral (
  select
    coalesce(sum(
      case m.type
        when 'entrada' then  m.quantity
        when 'saida'   then -m.quantity
        when 'ajuste'  then  m.quantity
      end
    ), 0) as current_quantity,
    coalesce(sum(case when m.type = 'entrada' then m.quantity else 0 end), 0) as total_in,
    coalesce(sum(case when m.type = 'saida'   then m.quantity else 0 end), 0) as total_out,
    -- custo médio das entradas (ignora entradas sem custo informado)
    case
      when sum(case when m.type = 'entrada' and m.unit_cost is not null then m.quantity else 0 end) > 0
      then sum(case when m.type = 'entrada' and m.unit_cost is not null then m.quantity * m.unit_cost else 0 end)
         / sum(case when m.type = 'entrada' and m.unit_cost is not null then m.quantity else 0 end)
      else null
    end as avg_unit_cost,
    max(m.created_at) as last_movement_at
  from public.supply_movements m
  where m.item_id = i.id
) s on true;

-- ============================================================================
-- updated_at em supply_items
-- ============================================================================
drop trigger if exists set_supply_items_updated_at on public.supply_items;
create trigger set_supply_items_updated_at before update on public.supply_items
  for each row execute function public.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Leitura: todo usuário logado. Escrita: quem tem o módulo 'estoque' liberado
-- (admin e financeiro sempre podem — ver user_can_write_module na migration 039).
-- ============================================================================
alter table public.supply_categories enable row level security;
alter table public.supply_items      enable row level security;
alter table public.supply_movements  enable row level security;

drop policy if exists "supply_categories_read"  on public.supply_categories;
drop policy if exists "supply_categories_write" on public.supply_categories;
create policy "supply_categories_read" on public.supply_categories
  for select using (auth.uid() is not null);
create policy "supply_categories_write" on public.supply_categories
  for all
  using (public.user_can_write_module('estoque'))
  with check (public.user_can_write_module('estoque'));

drop policy if exists "supply_items_read"  on public.supply_items;
drop policy if exists "supply_items_write" on public.supply_items;
create policy "supply_items_read" on public.supply_items
  for select using (auth.uid() is not null);
create policy "supply_items_write" on public.supply_items
  for all
  using (public.user_can_write_module('estoque'))
  with check (public.user_can_write_module('estoque'));

drop policy if exists "supply_movements_read"  on public.supply_movements;
drop policy if exists "supply_movements_write" on public.supply_movements;
create policy "supply_movements_read" on public.supply_movements
  for select using (auth.uid() is not null);
create policy "supply_movements_write" on public.supply_movements
  for all
  using (public.user_can_write_module('estoque'))
  with check (public.user_can_write_module('estoque'));
