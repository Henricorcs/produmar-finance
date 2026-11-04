-- ============================================================================
-- PRODUMAR — ALUGUÉIS: o boleto nasce só no sistema
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Por que:
--
--   Fechado o contrato, os boletos de cada mês são criados SÓ NO SISTEMA
--   (cora_status = 'SISTEMA', sem nada no banco) — saem no carnê para pagar
--   direto à PRODUMAR. Só quando precisar, o botão "Gerar no banco" registra
--   o boleto na Cora, e aí a linha ganha o id da Cora, o código de barras e o
--   Pix.
--
--   Por isso o id da Cora deixa de ser obrigatório. Continua único (vários
--   nulos são permitidos), e a regra de um boleto valendo por mês não muda.
--
-- Nada é apagado. Rodar de novo não quebra.
-- ============================================================================

alter table public.rental_boletos alter column cora_invoice_id drop not null;
alter table public.rental_boletos alter column cora_status set default 'SISTEMA';

comment on column public.rental_boletos.cora_status is
  'SISTEMA = só no sistema (ainda não foi para o banco); os outros são o status da Cora.';
