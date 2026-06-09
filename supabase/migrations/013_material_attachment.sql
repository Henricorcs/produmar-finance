-- ============================================================================
-- ILNET Finance — Anexo (nota fiscal) na compra de material
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Guarda a foto/arquivo da nota fiscal de cada compra. Reaproveita o bucket
-- de storage 'attachments' (o mesmo usado por Contas e Empréstimos).
-- ============================================================================

alter table public.material_purchases
  add column if not exists attachment_path text,
  add column if not exists attachment_name text;
