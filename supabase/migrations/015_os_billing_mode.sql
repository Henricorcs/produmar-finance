-- ============================================================================
-- ILNET Finance — Modo de cobrança do frete na OS de entrega de material
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Conceito:
--   • billing_mode  = como o frete é cobrado: 'viagem' (valor fixo),
--                     'km' (R$/km × km rodado) ou 'diaria' (valor × nº viagens).
--                     NULL = OS antiga ou prestação de serviço (fluxo atual).
--   • freight_value = valor unitário definido por quem abre a OS:
--                     viagem → valor da viagem; km → valor do km;
--                     diária → valor por viagem dentro da diária.
--   • O frete entra como ITEM da OS (is_freight = true, product_id null) —
--     o trigger recalc_service_order_total soma no total e a baixa de
--     estoque ignora (filtra product_id is not null).

-- Cabeçalho da OS
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS billing_mode  text,
  ADD COLUMN IF NOT EXISTS freight_value numeric,
  ADD COLUMN IF NOT EXISTS trips_count   integer,
  ADD COLUMN IF NOT EXISTS start_time    time,
  ADD COLUMN IF NOT EXISTS end_time      time;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'service_orders_billing_mode_check'
  ) THEN
    ALTER TABLE public.service_orders
      ADD CONSTRAINT service_orders_billing_mode_check
      CHECK (billing_mode IS NULL OR billing_mode IN ('viagem', 'km', 'diaria'));
  END IF;
END $$;

-- Itens: marca a linha de frete (não é material, não mexe no estoque)
ALTER TABLE public.service_order_items
  ADD COLUMN IF NOT EXISTS is_freight boolean NOT NULL DEFAULT false;
