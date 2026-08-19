-- ============================================================================
-- ILNET Finance — Estoque: HORÍMETRO/KM INICIAL E FINAL no envio do técnico
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS da migration 057 (é ela que cria as colunas da máquina).
-- ============================================================================
-- Por que:
--   Uma leitura só não diz nada: o que interessa é quanto a máquina trabalhou
--   naquele serviço. Então a leitura virou par — a do começo e a do fim — e a
--   diferença é a hora trabalhada (ou o km rodado).
--
--   As colunas que a 057 criou passam a ser a leitura INICIAL:
--     machine_hourmeter → horímetro no começo   machine_hourmeter_end → no fim
--     machine_km        → km no começo          machine_km_end        → no fim
--
--   Continuam TODAS opcionais: o técnico tem o botão "Não anotei" e ninguém
--   fica travado por causa de um número que não foi anotado na hora.
-- ============================================================================

alter table public.supply_requests
  add column if not exists machine_hourmeter_end numeric(12, 1),
  add column if not exists machine_km_end        numeric(12, 1);
