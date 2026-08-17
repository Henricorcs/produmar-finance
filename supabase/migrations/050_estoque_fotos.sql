-- ============================================================================
-- ILNET Finance — Estoque: FOTOS do item e do lançamento
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS da migration 049.
-- ============================================================================
-- O que muda:
--   • O item pode ter uma foto — ajuda a reconhecer na prateleira o que o nome
--     sozinho não diz (qual cano? qual emenda?).
--   • O lançamento também: na entrada serve de comprovante (nota, material que
--     chegou); na saída, de quem levou.
--   Ambas vão para o bucket 'attachments', o mesmo de Contas e Patrimônio —
--   as policies de storage já liberam leitura/upload para usuário logado.
-- ============================================================================

alter table public.supply_items
  add column if not exists photo_path text;

alter table public.supply_movements
  add column if not exists photo_path text;

-- ============================================================================
-- VIEW: v_supply_stock — recriada por causa da coluna nova
-- ============================================================================
-- Precisa ser DROP + CREATE (não OR REPLACE): o `i.*` "congela" a lista de
-- colunas no momento da criação, e ela mudou (entrou photo_path).
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
