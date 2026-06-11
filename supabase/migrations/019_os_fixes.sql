-- ============================================================================
-- ILNET Finance — Correções da OS (estoque/RLS/contagem de viagens)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- O que esta migration resolve:
--   1) Técnico (operador) não conseguia finalizar OS de ENTREGA DE MATERIAL:
--      o trigger de baixa de estoque rodava com o papel do operador e a RLS
--      de stock_movements (só admin/financeiro) bloqueava o INSERT, derrubando
--      a finalização inteira. Solução: a função de baixa passa a ser
--      SECURITY DEFINER (roda com o dono, ignorando a RLS do chamador).
--   2) Operador tinha permissão TOTAL em service_orders (criar/editar/excluir).
--      A regra do negócio é que o técnico só EXECUTA (inicia/finaliza). Passa a
--      ter apenas UPDATE; criar/excluir fica com admin/financeiro.
--   3) Marcar viagem (+1 / −1) fazia read-then-write do contador — dois toques
--      rápidos podiam perder uma viagem. Passa a ser um UPDATE atômico via RPC.

-- ── 1) Baixa de estoque como SECURITY DEFINER ───────────────────────────────
create or replace function public.sync_os_stock_movements(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
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
      'Baixa automática — '
        || coalesce(nullif(trim(so.client_name), ''), 'OS #' || so.order_number)
    from public.service_order_items i
    join public.service_orders so on so.id = i.service_order_id
    where i.service_order_id = p_order_id
      and i.product_id is not null;
  end if;
end;
$$;

-- ── 2) RLS de service_orders: operador só UPDATE ────────────────────────────
-- Remove a policy ampla criada na migration 003 e separa as permissões.
drop policy if exists "service_orders_write"           on public.service_orders;
drop policy if exists "service_orders_admin_write"     on public.service_orders;
drop policy if exists "service_orders_operador_update" on public.service_orders;

-- admin/financeiro: tudo (criar, editar, excluir)
create policy "service_orders_admin_write" on public.service_orders
  for all
  using (public.current_user_role() in ('admin', 'financeiro'))
  with check (public.current_user_role() in ('admin', 'financeiro'));

-- operador: apenas atualizar (iniciar/finalizar) — não cria nem exclui OS
create policy "service_orders_operador_update" on public.service_orders
  for update
  using (public.current_user_role() = 'operador')
  with check (public.current_user_role() = 'operador');

-- service_order_items continua liberado para o operador (a finalização recria
-- a linha de frete / o item de serviço calculado) — mantém a policy da 003.

-- ── 3) Contagem de viagens atômica ──────────────────────────────────────────
create or replace function public.register_os_trip(p_order_id uuid, p_delta int)
returns integer
language plpgsql
as $$
declare
  v_trips integer;
begin
  update public.service_orders
  set trips_count = greatest(0, coalesce(trips_count, 0) + p_delta)
  where id = p_order_id
  returning trips_count into v_trips;
  return v_trips;
end;
$$;

grant execute on function public.register_os_trip(uuid, int) to authenticated;
