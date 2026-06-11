-- ============================================================================
-- ILNET Finance — Assinatura em CADA viagem do frete por viagem
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Conceito:
--   • No frete por viagem, cada entrega é assinada na hora: o caçambeiro
--     entrega, quem recebeu escreve o nome e assina no celular ("Entregar
--     viagem" no painel do operador). Fica tudo no log service_order_trips.
--   • Cliente externo: nome + assinatura obrigatórios (há um "Entregar sem
--     assinatura" com confirmação para quando não tem ninguém no local — a
--     viagem fica marcada como NÃO ASSINADA no comprovante).
--   • Frete interno: opcionais.
--   • Com as viagens assinadas, o FECHAMENTO da OS por viagem pede só o KM
--     final — sem nome/assinatura final.
--   • RLS já cobre o operador (policies da migration 016).

ALTER TABLE public.service_order_trips
  ADD COLUMN IF NOT EXISTS received_by text,
  ADD COLUMN IF NOT EXISTS signature   text;
