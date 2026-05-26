-- Migration 003: Tipo de medição da máquina + precificação de serviço
-- Execute no Supabase SQL Editor

-- 1) Tipo de medição da máquina (horímetro = horas, km = quilômetros)
ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS tracking_type text NOT NULL DEFAULT 'hourmeter';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'machines_tracking_type_check'
  ) THEN
    ALTER TABLE machines
      ADD CONSTRAINT machines_tracking_type_check
      CHECK (tracking_type IN ('hourmeter', 'km'));
  END IF;
END $$;

-- 2) Hodômetro (KM) — quando a máquina é tracking_type = 'km'
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS km_start numeric,
  ADD COLUMN IF NOT EXISTS km_end   numeric;

-- 3) Valor por hora (para serviços com horímetro)
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS hourly_rate numeric;

-- 4) Custos internos (não somam no total cobrado do cliente)
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS service_cost numeric;  -- quanto foi gasto no serviço
ALTER TABLE service_orders
  ADD COLUMN IF NOT EXISTS fuel_cost    numeric;  -- abastecimento da máquina
