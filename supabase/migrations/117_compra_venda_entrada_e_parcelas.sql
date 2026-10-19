-- ============================================================================
-- PRODUMAR — ALUGUÉIS: COMPRA E VENDA COM ENTRADA, PARCELAS E VENCIMENTOS
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE NOVO sem estragar nada.
--
-- Rodar depois da 110 (contrato de compra e venda).
-- ============================================================================
-- Por que:
--
--   A forma de pagamento era um texto livre ("como vai ser pago?"). Agora a
--   tela pergunta em partes — à vista, entrada + parcelas ou parcelado — com o
--   valor da entrada, quantas parcelas, o valor de cada uma, o primeiro
--   vencimento e o meio de pagamento. O contrato monta a frase por extenso e
--   lista o vencimento de cada parcela.
--
--   payment_terms (o texto livre) fica: vira a "outra forma" de pagar, ou uma
--   observação. Contrato salvo antes continua saindo com o texto que tinha.
--
-- Nada é apagado: entram colunas novas.
-- ============================================================================

begin;

alter table public.property_sale_contracts
  -- 'avista', 'entrada_parcelas', 'parcelado', 'outro' (vazio = contrato antigo)
  add column if not exists payment_mode text
    check (payment_mode in ('avista', 'entrada_parcelas', 'parcelado', 'outro')),
  add column if not exists down_payment       numeric(14, 2),  -- valor da entrada
  add column if not exists down_payment_date  date,            -- à vista: data do pagamento; com entrada: data da entrada
  add column if not exists installments       integer,         -- quantas parcelas
  add column if not exists installment_amount numeric(14, 2),  -- valor de cada parcela (as "demais")
  -- 1ª parcela com valor diferente (ex.: entrada 20 mil, 1ª parcela 20 mil e
  -- o resto em parcelas iguais). Vazio = todas as parcelas iguais.
  add column if not exists first_installment_amount numeric(14, 2),
  add column if not exists first_due_date     date,            -- vencimento da 1ª parcela
  add column if not exists payment_method     text;            -- PIX, transferência, boleto...

commit;

notify pgrst, 'reload schema';
