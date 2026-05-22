-- Migration 002: Horímetro e recebimento de OS
-- Execute no Supabase SQL Editor

-- Campos de horímetro (usados apenas quando type = 'prestacao_servico')
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS hourmeter_start numeric,
  ADD COLUMN IF NOT EXISTS hourmeter_end   numeric;

-- Quem recebeu a entrega (preenchido ao finalizar a OS)
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS received_by text;
