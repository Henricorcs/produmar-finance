-- ============================================================================
-- Baixa automática de estoque: usar o NOME DO CLIENTE da OS na descrição
-- ============================================================================
-- Antes a nota era "Baixa automática — entrega da OS #5". Agora mostra o nome
-- do cliente da OS; quando não houver cliente (entrega interna), cai no número
-- da OS como antes. Idempotente — apenas substitui a função existente.

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
      'Baixa automática — '
        || coalesce(nullif(trim(so.client_name), ''), 'OS #' || so.order_number)
    from public.service_order_items i
    join public.service_orders so on so.id = i.service_order_id
    where i.service_order_id = p_order_id
      and i.product_id is not null;
  end if;
end;
$$;

-- Reaplica a função nas OSs de material já entregues para atualizar as notas
-- das movimentações existentes.
do $$
declare
  r record;
begin
  for r in
    select id from public.service_orders
    where status = 'entregue' and type = 'entrega_material'
  loop
    perform public.sync_os_stock_movements(r.id);
  end loop;
end $$;
