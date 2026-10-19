-- ============================================================================
-- PRODUMAR — ALUGUÉIS: QUAL PARCELA TEM VALOR DIFERENTE
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE NOVO sem estragar nada.
--
-- Rodar depois da 117 (entrada e parcelas).
-- ============================================================================
-- Por que:
--
--   Na 117 só a 1ª parcela podia ter valor próprio. Agora a tela pergunta "o
--   saldo será pago em parcelas iguais?" e, se não, QUAL parcela é diferente
--   (a 2ª, a 6ª...) e o valor dela; as outras dividem o resto igualmente.
--
--   O valor continua em first_installment_amount (o nome ficou da 117); aqui
--   entra o número da parcela. Vazio = a 1ª, como era.
--
-- Nada é apagado: entra uma coluna.
-- ============================================================================

alter table public.property_sale_contracts
  add column if not exists different_installment_number integer
    check (different_installment_number is null or different_installment_number >= 1);

notify pgrst, 'reload schema';
