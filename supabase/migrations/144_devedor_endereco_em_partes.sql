-- ============================================================================
-- PRODUMAR — DEVEDORES: ENDEREÇO DO DEVEDOR EM PARTES
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE NOVO sem estragar nada.
--
-- Rodar depois da 141 (dados do devedor para a confissão).
-- ============================================================================
-- Por que:
--
--   O endereço do devedor era um campo corrido. Agora a dívida pergunta em
--   partes — rua, número, complemento, bairro, cidade, UF e CEP — como no
--   contrato de aluguel (113), e a confissão monta a frase sozinha.
--
--   A coluna antiga (borrower_address) fica: dívida já salva continua saindo
--   com o endereço que tinha até alguém preencher as partes.
--
-- Nada é apagado: só entram colunas novas, todas opcionais.
-- ============================================================================

alter table public.loans
  add column if not exists borrower_street     text,
  add column if not exists borrower_number     text,
  add column if not exists borrower_complement text,
  add column if not exists borrower_district   text,
  add column if not exists borrower_city       text,
  add column if not exists borrower_state      text,
  add column if not exists borrower_zip        text;

-- o PostgREST passa a enxergar as colunas novas na hora
notify pgrst, 'reload schema';
