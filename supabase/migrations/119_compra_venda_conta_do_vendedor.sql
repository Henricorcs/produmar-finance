-- ============================================================================
-- PRODUMAR — ALUGUÉIS: CHAVE PIX / CONTA DO VENDEDOR NO CONTRATO
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE NOVO sem estragar nada.
--
-- Rodar depois da 117 (entrada e parcelas).
-- ============================================================================
-- Por que:
--
--   O contrato dizia COMO o preço seria pago (PIX, transferência), mas não
--   PARA ONDE. Agora a tela pergunta a chave PIX ou a conta do vendedor, e o
--   contrato sai com "pagas por PIX, para a chave ..., de titularidade do
--   VENDEDOR" — é o que comprova, depois, que pagar ali é pagar a ele.
--
-- Nada é apagado: entra uma coluna.
-- ============================================================================

alter table public.property_sale_contracts
  add column if not exists seller_bank_info text;  -- chave PIX ou banco/agência/conta

notify pgrst, 'reload schema';
