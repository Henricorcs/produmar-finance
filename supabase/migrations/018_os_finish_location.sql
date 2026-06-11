-- ============================================================================
-- ILNET Finance — Localização (GPS) capturada ao finalizar a OS
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Conceito:
--   • Ao finalizar a OS, o app captura a localização do celular do técnico
--     automaticamente (navigator.geolocation) e grava aqui — prova de onde
--     a entrega/serviço foi concluído.
--   • Best-effort: GPS desligado ou permissão negada não impedem a
--     finalização; os campos ficam null.
--   • accuracy = precisão em metros informada pelo aparelho.

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS end_latitude          numeric,
  ADD COLUMN IF NOT EXISTS end_longitude         numeric,
  ADD COLUMN IF NOT EXISTS end_location_accuracy numeric;
