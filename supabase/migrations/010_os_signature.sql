-- ============================================================================
-- ILNET Finance — Assinatura digital na finalização da OS
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Guarda a assinatura desenhada na finalização como data-URL (PNG base64).
-- É opcional; o código grava de forma "best-effort" e não quebra se a coluna
-- ainda não existir.

alter table public.service_orders
  add column if not exists signature text;
