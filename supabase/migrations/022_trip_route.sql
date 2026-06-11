-- ============================================================================
-- ILNET Finance — Rota do frete preenchida pelo operador (de onde / onde)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Conceito:
--   • No frete quem conhece a rota é o operador (caçambeiro), não o escritório.
--   • POR VIAGEM: cada viagem agora tem início e fim.
--       - "Iniciar viagem": grava origin (de onde) e start_time (saída).
--       - "Finalizar viagem": grava destination (onde foi entregue), trip_time
--         (chegada), recebido por + assinatura + GPS. Só então conta como +1.
--       - viagem EM ANDAMENTO = linha com trip_time NULL (no máximo uma por OS).
--   • DIÁRIA / KM: a rota é da OS inteira —
--       - origin_address (de onde) gravado ao INICIAR a OS.
--       - delivery_address (onde foi entregue) gravado ao FINALIZAR a OS.
--   • Texto livre digitado pelo operador.

ALTER TABLE public.service_order_trips
  ADD COLUMN IF NOT EXISTS origin      text,
  ADD COLUMN IF NOT EXISTS destination text,
  ADD COLUMN IF NOT EXISTS start_time  text;

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS origin_address text;
