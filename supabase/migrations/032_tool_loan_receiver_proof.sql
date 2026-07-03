-- ============================================================================
-- PRODUMAR — Comprovante de retirada (assinatura + foto de quem recebeu)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Assinatura vai direto como data-URL (PNG base64), igual à OS. A foto vai
-- para o bucket "attachments" — aqui guardamos só o caminho.

alter table public.tool_loans
  add column if not exists receiver_signature text,
  add column if not exists receiver_photo_path text;
