-- ============================================================================
-- PRODUMAR — DEVEDORES: COMO A DÍVIDA VAI SER PAGA (boleto, pix, cartão, dinheiro)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE UMA VEZ SÓ, e pode rodar de novo.
--
-- Rodar depois da 006 (a tabela das dívidas).
-- ============================================================================
-- Por que:
--
--   A dívida dizia QUANTO e QUANDO, mas não COMO. Na hora de cobrar isso é a
--   primeira pergunta: se é boleto, manda o boleto; se é pix, manda a chave;
--   se é dinheiro, alguém tem de passar lá. Sem o campo, isso morava na
--   cabeça de quem cobrava — ou numa observação solta que ninguém filtra.
--
--   Não confundir com o `repayment_type`, que já existia e é outra coisa: ele
--   diz se a dívida é PARCELADA ou de pagamentos avulsos. Este aqui é o meio
--   do pagamento.
--
--   Fica NULO no que já está lançado — dívida antiga não tem essa informação e
--   inventar uma seria pior que deixar em branco. A tela simplesmente não
--   mostra nada quando não foi informado.
-- ============================================================================

do $$ begin
  create type loan_payment_method as enum ('boleto', 'pix', 'cartao', 'dinheiro');
exception
  when duplicate_object then null;
end $$;

alter table public.loans
  add column if not exists payment_method loan_payment_method;

comment on column public.loans.payment_method is
  'Como esta dívida é paga: boleto, pix, cartão ou dinheiro (migration 093). Nulo = não informado. Não confundir com repayment_type, que diz se é parcelada ou avulsa.';
