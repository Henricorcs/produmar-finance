-- ============================================================================
-- PRODUMAR — ALUGUÉIS: HOMEM OU MULHER NO CONTRATO DE COMPRA E VENDA
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE NOVO sem estragar nada.
--
-- Rodar depois da 115 (compradores).
-- ============================================================================
-- Por que:
--
--   Sem saber se a pessoa é homem ou mulher, o contrato escrevia as duas
--   formas: "portador(a)", "inscrito(a)", "COMPRADOR(A)". Agora a tela pergunta
--   — do vendedor, do cônjuge e do comprador pessoa física — e o contrato sai
--   com a palavra certa: "portador" / "portadora", "VENDEDOR" / "VENDEDORA".
--   Em branco, continua como era.
--
--   'm' = masculino, 'f' = feminino, vazio = não informado.
--
-- Nada é apagado: entram colunas novas.
-- ============================================================================

begin;

alter table public.property_sale_contracts
  add column if not exists seller_gender text check (seller_gender in ('m', 'f')),
  add column if not exists spouse_gender text check (spouse_gender in ('m', 'f'));

alter table public.property_buyers
  add column if not exists gender text check (gender in ('m', 'f'));

commit;

notify pgrst, 'reload schema';
