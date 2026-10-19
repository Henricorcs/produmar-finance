-- ============================================================================
-- PRODUMAR — ALUGUÉIS: TITULAR DA CONTA QUANDO NÃO É O VENDEDOR
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE NOVO sem estragar nada.
--
-- Rodar depois da 119 (chave PIX / conta do vendedor).
-- ============================================================================
-- Por que:
--
--   Às vezes o vendedor pede para pagar na conta de outra pessoa (filho,
--   cônjuge, empresa). O contrato passa a dizer de quem é a conta, que ela foi
--   indicada pelo vendedor e que o depósito nela vale como pagamento feito a
--   ele — senão o comprador corre o risco de pagar duas vezes.
--
-- Nada é apagado: entram duas colunas.
-- ============================================================================

alter table public.property_sale_contracts
  add column if not exists seller_bank_holder_name text,      -- nome do titular
  add column if not exists seller_bank_holder_document text;  -- CPF ou CNPJ do titular

notify pgrst, 'reload schema';
