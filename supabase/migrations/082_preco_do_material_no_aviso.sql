-- ============================================================================
-- PRODUMAR — QUEM LEVA O MATERIAL MANDA O PREÇO JUNTO
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE UMA VEZ SÓ, e pode rodar de novo.
--
-- Rodar depois da 052 (a fila de material do técnico).
-- ============================================================================
-- Por que:
--
--   Quem compra na rua é quem está na rua. O técnico para na loja, paga a
--   serra, leva pra obra — e o preço ficava na nota amassada no bolso dele. No
--   escritório ninguém sabia quanto tinha custado, e perguntar depois é pedir
--   pra ouvir "ah, foi uns cento e pouco".
--
--   Pior no material que nem estava cadastrado: o chefe cadastrava na hora da
--   baixa, com custo zero, e o item nascia no estoque valendo nada. Todo
--   relatório de valor de estoque saía torto por causa disso.
--
--   Agora o preço de UMA unidade viaja junto com o aviso. É opcional de
--   propósito: quem pegou material que já era da casa, ou não sabe quanto
--   custou, deixa em branco como sempre deixou — obrigar o preço faria o
--   pessoal parar de avisar, que é o que essa fila toda existe pra evitar.
--
-- ============================================================================
-- CONTINUA SENDO SÓ UM RECADO
-- ============================================================================
--   Nada de dinheiro entra em conta nenhuma aqui, e nenhum saldo se mexe. O
--   preço é informação que chega junto para o chefe aproveitar na baixa — e,
--   quando o material é novo, virar o custo da primeira entrada no estoque.
--
--   Nada é apagado e nada muda de forma: só entra uma coluna, que fica nula em
--   tudo que já existe.
-- ============================================================================

alter table public.supply_requests
  add column if not exists unit_cost numeric(14, 2);

comment on column public.supply_requests.unit_cost is
  'Preço de UMA unidade, do jeito que quem levou informou. Opcional e só informativo: não mexe em saldo nem em conta (migration 082).';
