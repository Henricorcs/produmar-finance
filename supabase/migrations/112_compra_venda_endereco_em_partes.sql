-- ============================================================================
-- PRODUMAR — ALUGUÉIS: COMPRA E VENDA COM O ENDEREÇO EM PARTES
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE NOVO sem estragar nada.
--
-- Rodar depois da 110 (contrato de compra e venda).
-- ============================================================================
-- Por que:
--
--   O endereço do vendedor e o do imóvel eram um campo só, de texto corrido
--   ("rua, nº, bairro, cidade/uf, cep"), e no celular sempre faltava um
--   pedaço. Agora cada parte é um campo — rua, número, complemento, bairro,
--   cidade/UF e CEP — e o contrato monta a frase sozinho, com a linha para a
--   caneta só no pedaço que ficou em branco.
--
--   As colunas antigas (seller_address, property_address) ficam: os contratos
--   já salvos continuam saindo com o endereço que tinham.
--
-- Nada é apagado: entram colunas novas.
-- ============================================================================

alter table public.property_sale_contracts
  add column if not exists seller_street     text,
  add column if not exists seller_number     text,
  add column if not exists seller_complement text,
  add column if not exists seller_district   text,
  add column if not exists seller_city       text,
  add column if not exists seller_zip        text,

  add column if not exists property_street     text,
  add column if not exists property_number     text,
  add column if not exists property_complement text,
  add column if not exists property_district   text,
  add column if not exists property_city       text,
  add column if not exists property_zip        text;

notify pgrst, 'reload schema';
