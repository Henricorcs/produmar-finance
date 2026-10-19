-- ============================================================================
-- PRODUMAR — ALUGUÉIS: COMPRA E VENDA COM MEDIDAS E DIVISAS EM PARTES
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE NOVO sem estragar nada.
--
-- Rodar depois da 110 (contrato de compra e venda).
-- ============================================================================
-- Por que:
--
--   "Medidas, divisas e benfeitorias" era um texto só, e no celular ninguém
--   lembrava de escrever tudo. Agora a tela pergunta uma coisa de cada vez:
--   quantos metros de frente, de fundos e de cada lado; com quem o terreno faz
--   divisa em cada um desses lados; e o que tem construído. O contrato monta a
--   frase sozinho, com a linha para a caneta só no pedaço em branco.
--
--   A coluna antiga (property_description) fica, agora para "mais alguma
--   característica" — e o contrato salvo antes continua saindo como estava.
--
-- Nada é apagado: entram colunas novas.
-- ============================================================================

alter table public.property_sale_contracts
  -- medidas, em metros (texto: "12,50")
  add column if not exists property_front text,
  add column if not exists property_back  text,
  add column if not exists property_right text,
  add column if not exists property_left  text,
  -- com quem faz divisa em cada lado (a rua, o vizinho...)
  add column if not exists property_front_with text,
  add column if not exists property_back_with  text,
  add column if not exists property_right_with text,
  add column if not exists property_left_with  text,
  -- o que tem construído
  add column if not exists property_improvements text;

notify pgrst, 'reload schema';
