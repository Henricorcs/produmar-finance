-- ============================================================================
-- ILNET Finance — Localização (GPS) capturada em CADA viagem do frete
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Conceito:
--   • A cada entrega no modo "por viagem", além do horário e da assinatura,
--     o app captura a localização do celular do técnico (navigator.geolocation)
--     — prova de onde aquela viagem foi entregue.
--   • Best-effort: GPS desligado/permissão negada não impedem a entrega; os
--     campos ficam null.
--   • location_accuracy = precisão em metros informada pelo aparelho.

ALTER TABLE public.service_order_trips
  ADD COLUMN IF NOT EXISTS latitude          numeric,
  ADD COLUMN IF NOT EXISTS longitude         numeric,
  ADD COLUMN IF NOT EXISTS location_accuracy numeric;
