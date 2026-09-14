-- ============================================================================
-- PRODUMAR — IMPRESSORAS: o operador lança a leitura, e o relatório sai assinado
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE UMA VEZ SÓ, e pode rodar de novo.
--
-- Rodar depois da 096 (aluguel de impressoras).
-- ============================================================================
-- Por que:
--
--   1) QUEM LÊ O CONTADOR É O OPERADOR, na rua, de impressora em impressora —
--      não o escritório. Então a leitura do mês passa a poder ser lançada pelo
--      painel dele. Não é o perfil "operador" inteiro: é uma permissão marcada
--      no cadastro de cada um, "Leitura das impressoras" (slug
--      'leitura-impressoras'), como já é o "Avisar material da obra" (080).
--      O helper user_can_write_module já sabe conferir o slug no
--      allowed_modules da pessoa.
--
--      Ele só LANÇA LEITURA: grava a fatura do mês e as leituras. Contrato,
--      impressora, baixa e exclusão continuam com quem manda em Aluguéis.
--
--   2) O RELATÓRIO QUE VAI PARA O CLIENTE termina com a cidade, a data e a
--      assinatura de quem responde pelo contrato (nome, documento, telefone).
--      Isso passa a ficar no contrato, para o PDF sair pronto.
--
--   3) A DATA DA LEITURA DE PARTIDA. O primeiro mês não tem fatura anterior de
--      onde tirar a data da leitura anterior — ela fica no contrato, junto com
--      o contador de instalação de cada impressora.
--
-- Nada é apagado: entram cinco colunas e três policies.
-- ============================================================================

-- ── 1) O contrato ganha a assinatura do relatório e a data de partida ───────
alter table public.printer_contracts
  add column if not exists initial_reading_date date,
  add column if not exists issuer_city     text,
  add column if not exists signer_name     text,
  add column if not exists signer_document text,
  add column if not exists signer_phone    text;

comment on column public.printer_contracts.initial_reading_date is
  'Data da leitura de onde os contadores de instalação foram tirados — a "leitura anterior" do primeiro mês (migration 097).';
comment on column public.printer_contracts.issuer_city is
  'Cidade que abre a linha de data do relatório ("São Mateus do Maranhão, 25 de agosto de 2026").';
comment on column public.printer_contracts.signer_name is
  'Quem assina o relatório de impressões enviado ao cliente.';

-- ── 2) O operador com a permissão grava a fatura e as leituras do mês ───────
-- Policies permissivas se somam: quem já manda em Aluguéis continua mandando.
drop policy if exists "printer_billings_leitura_insert" on public.printer_billings;
drop policy if exists "printer_billings_leitura_update" on public.printer_billings;
drop policy if exists "printer_readings_leitura"        on public.printer_readings;

create policy "printer_billings_leitura_insert" on public.printer_billings
  for insert with check (public.user_can_write_module('leitura-impressoras'));

-- corrigir a leitura de um mês refaz a fatura dele (upsert)
create policy "printer_billings_leitura_update" on public.printer_billings
  for update
  using (public.user_can_write_module('leitura-impressoras'))
  with check (public.user_can_write_module('leitura-impressoras'));

-- as leituras são regravadas inteiras a cada lançamento do mês
create policy "printer_readings_leitura" on public.printer_readings
  for all
  using (public.user_can_write_module('leitura-impressoras'))
  with check (public.user_can_write_module('leitura-impressoras'));

-- ============================================================================
-- DEPOIS DE RODAR
-- ============================================================================
--   Configurações → Usuários → o operador → marque "Leitura das impressoras".
--   Só quem tiver a marca vê a aba Impressoras no painel — e só ela deixa a
--   leitura entrar no banco.
-- ============================================================================
