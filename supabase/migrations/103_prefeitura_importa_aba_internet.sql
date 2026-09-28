-- ============================================================================
-- PRODUMAR — PREFEITURA: IMPORTA A ABA "INTERNET" DA PLANILHA
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE UMA VEZ SÓ, e pode rodar de novo:
-- nota que já existe (mesma secretaria, mesmo número, mesma data) é pulada.
--
-- Rodar DEPOIS da 102.
-- ============================================================================
-- De onde veio:
--
--   \\192.168.11.160\financeiro\CONTROLE DE NOTAS PREFEITURA 2026.xlsx,
--   aba INTERNET — 12 secretarias, 291 notas.
--
--   A DATA DA BAIXA saiu dos COMENTÁRIOS das células ("Pago em: 02/02/24"):
--   na planilha o OK dizia que foi pago, e o comentário dizia quando.
--
--   Nota com OK → paga, com a data do comentário. Sem OK → pendente.
--
-- Erros de digitação da planilha que foram corrigidos na importação:
--   • nota 20413: emissão 20/05/2005 → 20/05/2025 (as irmãs 20410..20412)
--   • nota 852:   emissão 03/03/2023 → 03/03/2026 (as outras de 845..851)
--   • nota 6036:  emissão 31/11/2020 (não existe) → 03/11/2020 (6033..6035)
--   • nota 21057: emissão "25/0725" → 25/07/2025
--   • nota 17494: baixa "03/09" sem ano → 03/09/2024
-- ============================================================================

-- ── Grupo: cada ABA da planilha é um grupo (INTERNET, e depois a de NF) ─────
alter table public.prefeitura_secretarias
  add column if not exists grupo text not null default 'INTERNET';

comment on column public.prefeitura_secretarias.grupo is
  'A aba da planilha de onde a secretaria veio (INTERNET, NF...). A tela separa por grupo (migration 103).';

-- ── A 102 antiga cadastrava estas secretarias com o "TOTAL" da planilha como
--    valor de contrato — mas o TOTAL era a SOMA das notas, não o contrato.
--    Se ela chegou a rodar, os nomes voltam a ser os da planilha e o valor de
--    contrato some. (Se não rodou, nada disto encontra linha nenhuma.)
update public.prefeitura_secretarias s
set nome = v.novo
from (values
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL',          'FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS'),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS',  'FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS'),
  ('CONTR DE NOTAS INTERNET - ASSISTÊNCIA SOCIAL',   'CONTR DE NOTAS INTERNET ASSISTÊNCIA SOCIAL')
) as v(antigo, novo)
where s.nome = v.antigo;

update public.prefeitura_secretarias
set valor_contrato = null
where grupo = 'INTERNET'
  and valor_contrato in (330000, 30000, 60000, 75000);

-- ── As 12 secretarias da aba, com o valor de cada nota ─────────────────────
insert into public.prefeitura_secretarias (grupo, nome, valor_padrao, ordem)
select 'INTERNET', v.nome, v.valor_padrao, v.ordem
from (values
  ('SECRETARIA DE ADMINISTRAÇÃO',                                13200.00,  1),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS',                         1200.00,  2),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS',                              2400.00,  3),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL',                  1200.00,  4),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS',                2400.00,  5),
  ('SEC DE EDUCAÇÃO - QSE',                                       3000.00,  6),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND',                            6000.00,  7),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS',  5991.67,  8),
  ('CONTR DE NOTAS INTERNET ASSISTÊNCIA SOCIAL',                  3400.00,  9),
  ('CONTR DE NOTAS INTERNET - EDUCAÇÃO',                          3400.00, 10),
  ('CONTR DE NOTAS INTERNET - SAÚDE',                             3400.00, 11),
  ('CONTR DE NOTAS INTERNET - ADM',                               6800.00, 12)
) as v(nome, valor_padrao, ordem)
where not exists (
  select 1 from public.prefeitura_secretarias s
  where s.grupo = 'INTERNET' and s.nome = v.nome
);

-- o valor de cada nota corrigido também nas que já existiam
update public.prefeitura_secretarias s
set valor_padrao = v.valor_padrao, ordem = v.ordem
from (values
  ('SECRETARIA DE ADMINISTRAÇÃO',                                13200.00,  1),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS',                         1200.00,  2),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS',                              2400.00,  3),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL',                  1200.00,  4),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS',                2400.00,  5),
  ('SEC DE EDUCAÇÃO - QSE',                                       3000.00,  6),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND',                            6000.00,  7),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS',  5991.67,  8),
  ('CONTR DE NOTAS INTERNET ASSISTÊNCIA SOCIAL',                  3400.00,  9),
  ('CONTR DE NOTAS INTERNET - EDUCAÇÃO',                          3400.00, 10),
  ('CONTR DE NOTAS INTERNET - SAÚDE',                             3400.00, 11),
  ('CONTR DE NOTAS INTERNET - ADM',                               6800.00, 12)
) as v(nome, valor_padrao, ordem)
where s.grupo = 'INTERNET' and s.nome = v.nome;

-- ── As notas ───────────────────────────────────────────────────────────────
insert into public.prefeitura_notas
  (secretaria_id, numero, data_emissao, valor, situacao, data_baixa, observacao)
select s.id, v.numero, v.data_emissao::date, v.valor, v.situacao, v.data_baixa::date, v.observacao
from (values
  ('SECRETARIA DE ADMINISTRAÇÃO', '17811', '2024-09-11', 13200.00, 'pago', '2024-09-30', null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '18141', '2024-10-01', 13200.00, 'pago', '2024-12-03', null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '18480', '2024-11-01', 13200.00, 'pago', '2024-12-30', null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '18820', '2024-12-12', 13200.00, 'pago', '2025-02-24', null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '18837', '2024-12-24', 13200.00, 'pago', '2025-04-15', null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '20358', '2025-05-02', 13200.00, 'pago', '2025-05-15', null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '20359', '2025-05-02', 13200.00, 'pago', '2025-07-31', null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '20360', '2025-05-02', 13200.00, 'pago', '2025-08-14', null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '20404', '2025-05-15', 13200.00, 'pago', '2025-08-14', null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '20732', '2025-06-17', 13200.00, 'pago', '2025-09-11', null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '21055', '2025-07-25', 13200.00, 'pago', '2025-11-12', null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '21363', '2025-08-12', 13200.00, 'pago', '2025-11-21', null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '21679', '2025-09-03', 13200.00, 'pago', '2025-12-04', null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '21993', '2025-10-02', 13200.00, 'pago', '2025-12-04', null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '36', '2025-12-02', 13200.00, 'pago', '2025-12-31', null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '56', '2025-12-04', 13200.00, 'pago', '2026-01-07', null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '121', '2025-12-22', 13200.00, 'pago', '2026-03-02', null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '493', '2026-02-10', 13200.00, 'pago', '2026-04-01', null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '845', '2026-03-03', 13200.00, 'pago', '2026-04-24', null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '1379', '2026-04-07', 13200.00, 'pago', '2026-06-17', null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '3261', '2026-05-27', 13200.00, 'pago', '2026-08-20', null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '3343', '2026-06-16', 13200.00, 'pago', '2026-09-15', null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '4708', '2026-07-01', 13200.00, 'pendente', null, null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '5822', '2026-08-03', 13200.00, 'pendente', null, null),
  ('SECRETARIA DE ADMINISTRAÇÃO', '7373', '2026-09-02', 13200.00, 'pendente', null, null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '17810', '2024-09-11', 1200.00, 'pago', '2024-09-30', null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '18142', '2024-10-01', 1200.00, 'pago', '2024-12-02', null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '18481', '2024-11-01', 1200.00, 'pago', '2025-02-24', null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '18825', '2024-12-12', 1200.00, 'pago', '2025-02-24', null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '18833', '2024-12-24', 1200.00, 'pago', '2025-04-15', null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '20361', '2025-05-02', 1200.00, 'pago', '2025-05-15', null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '20362', '2025-05-02', 1200.00, 'pago', '2025-07-31', null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '20363', '2025-05-02', 1200.00, 'pago', '2025-08-14', null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '20408', '2025-05-15', 1200.00, 'pago', '2025-08-14', null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '20733', '2025-06-17', 1200.00, 'pago', '2025-09-11', null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '21058', '2025-07-28', 1200.00, 'pago', '2025-11-12', null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '21364', '2025-08-12', 1200.00, 'pago', '2025-11-21', null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '21678', '2025-09-03', 1200.00, 'pago', '2025-12-04', null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '21994', '2025-10-02', 1200.00, 'pago', '2025-12-04', null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '37', '2025-12-02', 1200.00, 'pago', '2026-01-07', null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '59', '2025-12-04', 1200.00, 'pago', '2026-01-07', null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '122', '2025-12-22', 1200.00, 'pago', '2026-03-02', null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '494', '2026-02-10', 1200.00, 'pago', '2026-04-01', null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '846', '2026-03-03', 1200.00, 'pago', '2026-04-24', null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '1380', '2026-04-07', 1200.00, 'pago', '2026-06-17', null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '3262', '2026-05-27', 1200.00, 'pago', '2026-08-20', null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '4703', '2026-06-23', 1200.00, 'pago', '2026-09-15', null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '4736', '2026-07-01', 1200.00, 'pendente', null, null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '5823', '2026-08-03', 1200.00, 'pendente', null, null),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS', '7374', '2026-09-02', 1200.00, 'pendente', null, null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '17814', '2024-09-11', 2400.00, 'pago', '2024-09-30', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '18143', '2024-10-01', 2400.00, 'pago', '2024-12-03', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '18482', '2024-11-01', 2400.00, 'pago', '2024-12-30', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '18824', '2024-12-12', 2400.00, 'pago', '2025-02-24', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '18834', '2024-12-24', 2400.00, 'pago', '2025-04-16', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '20364', '2025-05-02', 2400.00, 'pendente', null, null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '20365', '2025-05-02', 2400.00, 'pago', '2025-06-24', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '20366', '2025-05-02', 2400.00, 'pago', '2025-06-24', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '20409', '2025-05-15', 2400.00, 'pago', '2025-06-24', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '20735', '2025-06-18', 2400.00, 'pago', '2025-09-11', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '21057', '2025-07-25', 2400.00, 'pago', '2025-11-05', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '21366', '2025-08-12', 2400.00, 'pago', '2025-11-21', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '21676', '2025-09-03', 2400.00, 'pago', '2025-12-04', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '21998', '2025-10-02', 2400.00, 'pago', '2025-12-04', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '38', '2025-12-02', 2400.00, 'pago', '2025-12-31', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '58', '2025-12-04', 2400.00, 'pago', '2026-01-07', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '123', '2025-12-22', 2400.00, 'pago', '2026-03-02', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '502', '2026-02-10', 2400.00, 'pago', '2026-03-02', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '847', '2026-03-03', 2400.00, 'pago', '2026-03-31', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '1381', '2026-04-07', 2400.00, 'pago', '2026-06-18', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '3263', '2026-05-27', 2400.00, 'pago', '2026-08-20', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '3353', '2026-06-18', 2400.00, 'pago', '2026-09-15', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '4737', '2026-07-01', 2400.00, 'pendente', null, null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '5824', '2026-08-03', 2400.00, 'pendente', null, null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS', '7375', '2026-09-02', 2400.00, 'pendente', null, null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '17812', '2024-09-11', 1200.00, 'pago', '2024-09-30', null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '18140', '2024-10-01', 1200.00, 'pago', '2024-12-02', null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '18477', '2024-11-01', 1200.00, 'pago', '2025-02-24', null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '18822', '2024-12-12', 1200.00, 'pago', '2025-02-24', null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '18832', '2024-12-12', 1200.00, 'pago', '2025-04-15', null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '20367', '2025-05-02', 1200.00, 'pago', '2025-05-15', null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '20368', '2025-05-02', 1200.00, 'pago', '2025-05-31', null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '20369', '2025-05-02', 1200.00, 'pago', '2025-08-14', null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '20405', '2025-05-15', 1200.00, 'pago', '2025-08-14', null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '20731', '2025-06-18', 1200.00, 'pago', '2025-09-11', null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '21052', '2025-07-27', 1200.00, 'pago', '2025-11-12', null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '21360', '2025-08-12', 1200.00, 'pago', '2025-11-21', null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '21674', '2025-09-03', 1200.00, 'pago', '2025-12-04', null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '21995', '2025-10-02', 1200.00, 'pago', '2025-12-04', null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '39', '2025-12-02', 1200.00, 'pago', '2025-12-31', null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '57', '2025-12-04', 1200.00, 'pago', '2026-01-07', null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '124', '2025-12-22', 1200.00, 'pago', '2026-03-02', null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '496', '2026-02-10', 1200.00, 'pago', '2026-04-01', null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '848', '2026-03-03', 1200.00, 'pago', '2026-04-24', null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '1382', '2026-04-07', 1200.00, 'pago', '2026-06-17', null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '3264', '2026-05-27', 1200.00, 'pago', '2026-08-20', null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '3354', '2026-06-18', 1200.00, 'pago', '2026-09-15', null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '4738', '2026-07-01', 1200.00, 'pendente', null, null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '5825', '2026-08-03', 1200.00, 'pendente', null, null),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL', '7376', '2026-09-02', 1200.00, 'pendente', null, null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '17813', '2024-09-11', 2400.00, 'pago', '2024-09-30', null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '18139', '2024-10-01', 2400.00, 'pago', '2024-12-02', null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '18475', '2024-11-01', 2400.00, 'pago', '2024-12-03', null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '18821', '2024-12-12', 2400.00, 'pago', '2025-02-24', null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '18831', '2024-12-12', 2400.00, 'pago', '2025-04-15', null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '20370', '2025-05-02', 2400.00, 'pago', '2025-05-15', null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '20371', '2025-05-02', 2400.00, 'pago', '2025-06-17', null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '20372', '2025-05-02', 2400.00, 'pago', '2025-07-31', null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '20406', '2025-05-15', 2400.00, 'pago', '2025-08-14', null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '20724', '2025-06-17', 2400.00, 'pago', '2025-08-14', null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '21051', '2025-07-25', 2400.00, 'pago', '2025-09-11', null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '21361', '2025-08-12', 2400.00, 'pago', '2025-11-12', null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '21675', '2025-09-03', 2400.00, 'pago', '2025-11-21', null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '21992', '2025-10-02', 2400.00, 'pago', '2025-12-05', null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '43', '2025-12-03', 2400.00, 'pago', '2025-12-04', null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '60', '2025-12-04', 2400.00, 'pago', '2026-01-07', null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '126', '2025-12-22', 2400.00, 'pago', '2026-03-02', null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '497', '2026-02-10', 2400.00, 'pago', '2026-03-31', null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '849', '2026-03-03', 2400.00, 'pago', '2026-04-24', null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '1383', '2026-04-07', 2400.00, 'pago', '2026-06-17', null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '3265', '2026-05-27', 2400.00, 'pago', '2026-08-20', null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '3355', '2026-06-18', 2400.00, 'pago', '2026-09-15', null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '4739', '2026-07-01', 2400.00, 'pendente', null, null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '5826', '2026-08-03', 2400.00, 'pendente', null, null),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL - FMAS', '7377', '2026-09-02', 2400.00, 'pendente', null, null),
  ('SEC DE EDUCAÇÃO - QSE', '17816', '2024-09-11', 3000.00, 'pago', '2024-09-30', null),
  ('SEC DE EDUCAÇÃO - QSE', '18145', '2024-10-01', 3000.00, 'pago', '2024-12-02', null),
  ('SEC DE EDUCAÇÃO - QSE', '18479', '2024-11-01', 3000.00, 'pago', '2025-02-24', null),
  ('SEC DE EDUCAÇÃO - QSE', '18819', '2024-12-12', 3000.00, 'pago', '2025-02-24', null),
  ('SEC DE EDUCAÇÃO - QSE', '18836', '2024-12-24', 3000.00, 'pago', '2025-04-15', null),
  ('SEC DE EDUCAÇÃO - QSE', '20373', '2025-05-02', 3000.00, 'pago', '2025-05-15', null),
  ('SEC DE EDUCAÇÃO - QSE', '20374', '2025-05-02', 3000.00, 'pago', '2025-06-24', null),
  ('SEC DE EDUCAÇÃO - QSE', '20375', '2025-05-02', 3000.00, 'pago', '2025-06-24', null),
  ('SEC DE EDUCAÇÃO - QSE', '20407', '2025-05-15', 3000.00, 'pago', '2025-06-24', null),
  ('SEC DE EDUCAÇÃO - QSE', '20729', '2025-06-17', 3000.00, 'pago', '2025-09-11', null),
  ('SEC DE EDUCAÇÃO - QSE', '21053', '2025-07-25', 3000.00, 'pago', '2025-11-05', null),
  ('SEC DE EDUCAÇÃO - QSE', '21359', '2025-08-12', 3000.00, 'pago', '2025-11-21', null),
  ('SEC DE EDUCAÇÃO - QSE', '21680', '2025-09-03', 3000.00, 'pago', '2025-12-04', null),
  ('SEC DE EDUCAÇÃO - QSE', '21997', '2025-10-02', 3000.00, 'pago', '2025-12-04', null),
  ('SEC DE EDUCAÇÃO - QSE', '44', '2025-12-03', 3000.00, 'pago', '2025-12-31', null),
  ('SEC DE EDUCAÇÃO - QSE', '61', '2025-12-04', 3000.00, 'pago', '2026-01-07', null),
  ('SEC DE EDUCAÇÃO - QSE', '127', '2025-12-22', 3000.00, 'pago', '2026-03-02', null),
  ('SEC DE EDUCAÇÃO - QSE', '498', '2026-02-10', 3000.00, 'pago', '2026-03-31', null),
  ('SEC DE EDUCAÇÃO - QSE', '850', '2026-03-03', 3000.00, 'pago', '2026-04-24', null),
  ('SEC DE EDUCAÇÃO - QSE', '1384', '2026-04-07', 3000.00, 'pago', '2026-06-17', null),
  ('SEC DE EDUCAÇÃO - QSE', '3266', '2026-05-27', 3000.00, 'pago', '2026-08-20', null),
  ('SEC DE EDUCAÇÃO - QSE', '3357', '2026-06-18', 3000.00, 'pago', '2026-09-18', null),
  ('SEC DE EDUCAÇÃO - QSE', '4740', '2026-07-01', 3000.00, 'pendente', null, null),
  ('SEC DE EDUCAÇÃO - QSE', '5827', '2026-08-03', 3000.00, 'pendente', null, null),
  ('SEC DE EDUCAÇÃO - QSE', '7378', '2026-09-02', 3000.00, 'pendente', null, null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '17815', '2024-09-11', 6000.00, 'pago', '2024-09-30', null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '18144', '2024-10-01', 6000.00, 'pago', '2024-12-02', null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '18478', '2024-11-01', 6000.00, 'pago', '2024-12-30', null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '18823', '2024-12-12', 6000.00, 'pago', '2025-02-24', null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '18835', '2024-12-24', 6000.00, 'pago', '2025-04-15', null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '20399', '2025-05-06', 6000.00, 'pago', '2025-06-17', null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '20400', '2025-05-06', 6000.00, 'pago', '2025-06-24', null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '20401', '2025-05-06', 6000.00, 'pago', '2025-06-24', null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '20403', '2025-05-15', 6000.00, 'pago', '2025-06-24', null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '20726', '2025-06-17', 6000.00, 'pago', '2025-09-11', null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '21054', '2025-07-25', 6000.00, 'pago', '2025-11-05', null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '21362', '2025-08-12', 6000.00, 'pago', '2025-11-21', null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '21681', '2025-09-03', 6000.00, 'pago', '2025-12-04', null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '21996', '2025-10-02', 6000.00, 'pago', '2025-12-04', null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '45', '2025-12-03', 6000.00, 'pago', '2026-01-07', null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '62', '2025-12-04', 6000.00, 'pago', '2026-01-07', null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '128', '2025-12-22', 6000.00, 'pago', '2026-03-02', null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '499', '2026-02-10', 6000.00, 'pago', '2026-03-31', null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '851', '2026-03-03', 6000.00, 'pago', '2026-04-24', null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '1385', '2026-04-07', 6000.00, 'pago', '2026-06-17', null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '3267', '2026-05-27', 6000.00, 'pago', '2026-08-20', null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '3358', '2026-06-18', 6000.00, 'pago', '2026-09-15', null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '4741', '2026-07-01', 6000.00, 'pendente', null, null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '5828', '2026-08-03', 6000.00, 'pendente', null, null),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND', '7379', '2026-09-02', 6000.00, 'pendente', null, null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '11628', '2023-03-07', 5991.67, 'pago', '2023-03-30', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '11629', '2023-03-07', 5991.67, 'pago', '2023-07-18', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '11994', '2023-03-31', 5991.67, 'pago', '2023-07-18', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '12375', '2023-05-09', 5991.67, 'pago', '2023-10-25', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '12744', '2023-06-02', 5991.67, 'pago', '2023-10-25', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '13100', '2023-07-06', 5991.67, 'pago', '2023-11-24', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '13454', '2023-08-10', 5991.67, 'pago', '2023-11-24', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '13804', '2023-09-12', 5991.67, 'pago', '2023-11-24', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '14134', '2023-10-02', 5991.67, 'pago', '2023-11-24', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '14801', '2023-12-01', 5991.67, 'pago', '2024-01-05', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '14802', '2023-12-01', 5991.67, 'pago', '2024-01-05', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '15520', '2024-02-06', 5991.67, 'pago', '2024-03-12', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '15521', '2024-02-06', 5991.67, 'pago', '2024-03-12', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '15527', '2024-02-21', 5991.67, 'pago', '2024-03-12', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '15849', '2024-03-20', 5991.67, 'pago', '2024-04-11', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '16183', '2024-04-18', 5991.67, 'pago', '2024-06-12', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '16512', '2024-05-16', 5991.67, 'pago', '2024-06-12', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '16836', '2024-06-17', 5991.67, 'pago', '2024-06-28', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '17171', '2024-07-22', 5991.67, 'pago', '2024-08-01', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '17494', '2024-08-27', 5991.67, 'pago', '2024-09-03', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '17817', '2024-09-16', 5991.67, 'pago', '2024-09-25', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '18511', '2024-11-26', 5991.67, 'pago', '2024-12-11', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '18512', '2024-11-26', 5991.67, 'pago', '2024-12-11', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '18830', '2024-12-24', 5991.67, 'pago', '2025-02-24', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '18838', '2024-12-24', 5991.67, 'pago', '2025-02-24', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '20410', '2025-05-20', 5991.67, 'pago', '2025-06-05', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '20411', '2025-05-20', 5991.67, 'pago', '2025-06-05', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '20412', '2025-05-20', 5991.67, 'pago', '2025-06-05', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '20413', '2025-05-20', 5991.67, 'pago', '2025-06-05', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '20730', '2025-06-18', 5991.67, 'pago', '2025-08-08', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '21056', '2025-07-25', 5991.67, 'pago', '2025-11-05', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '21365', '2025-08-12', 5991.67, 'pago', '2025-11-19', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '21683', '2025-09-03', 5991.67, 'pago', '2025-12-04', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '21999', '2025-10-02', 5991.67, 'pago', '2025-12-04', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '46', '2025-12-03', 5991.66, 'pago', '2025-12-31', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '55', '2025-12-04', 5991.67, 'pago', '2026-01-07', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '120', '2025-12-22', 5991.67, 'pago', '2026-03-02', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '500', '2026-02-10', 5991.67, 'pago', '2026-03-31', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '852', '2026-03-03', 5991.67, 'pago', '2026-03-31', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '1386', '2026-04-07', 5991.67, 'pago', '2026-04-24', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '3268', '2026-05-27', 5991.67, 'pago', '2026-06-08', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '3359', '2026-06-18', 5991.67, 'pago', '2026-07-09', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '4742', '2026-07-01', 5991.67, 'pago', '2026-09-17', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '5829', '2026-08-03', 5991.67, 'pago', '2026-08-20', null),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS', '7380', '2026-09-02', 5991.67, 'pago', '2026-09-15', null),
  ('CONTR DE NOTAS INTERNET ASSISTÊNCIA SOCIAL', '13691', '2023-02-02', 3400.00, 'pago', '2023-05-15', null),
  ('CONTR DE NOTAS INTERNET ASSISTÊNCIA SOCIAL', '14554', '2023-03-01', 3400.00, 'pago', '2023-07-19', null),
  ('CONTR DE NOTAS INTERNET ASSISTÊNCIA SOCIAL', '15414', '2023-04-01', 3400.00, 'pago', '2023-08-15', null),
  ('CONTR DE NOTAS INTERNET ASSISTÊNCIA SOCIAL', '16252', '2023-05-02', 3400.00, 'pago', '2023-09-14', null),
  ('CONTR DE NOTAS INTERNET ASSISTÊNCIA SOCIAL', '17099', '2023-06-01', 3400.00, 'pago', '2023-10-06', null),
  ('CONTR DE NOTAS INTERNET ASSISTÊNCIA SOCIAL', '18026', '2023-07-06', 3400.00, 'pago', '2023-12-14', null),
  ('CONTR DE NOTAS INTERNET ASSISTÊNCIA SOCIAL', '18826', '2023-08-01', 3400.00, 'pago', '2024-01-02', null),
  ('CONTR DE NOTAS INTERNET ASSISTÊNCIA SOCIAL', '19685', '2023-09-02', 3400.00, 'pago', '2024-03-06', null),
  ('CONTR DE NOTAS INTERNET ASSISTÊNCIA SOCIAL', '20538', '2023-10-02', 3400.00, 'pago', '2024-03-22', null),
  ('CONTR DE NOTAS INTERNET ASSISTÊNCIA SOCIAL', '21288', '2023-11-03', 3400.00, 'pago', '2024-05-06', null),
  ('CONTR DE NOTAS INTERNET ASSISTÊNCIA SOCIAL', '22135', '2023-12-01', 3400.00, 'pago', '2024-06-03', null),
  ('CONTR DE NOTAS INTERNET ASSISTÊNCIA SOCIAL', '22172', '2023-12-21', 3400.00, 'pago', '2024-07-11', null),
  ('CONTR DE NOTAS INTERNET ASSISTÊNCIA SOCIAL', '24529', '2024-03-20', 3400.00, 'pago', '2024-09-06', null),
  ('CONTR DE NOTAS INTERNET ASSISTÊNCIA SOCIAL', '24530', '2024-03-20', 3400.00, 'pago', '2024-09-17', null),
  ('CONTR DE NOTAS INTERNET ASSISTÊNCIA SOCIAL', '26268', '2024-05-02', 3400.00, 'pago', '2024-11-08', null),
  ('CONTR DE NOTAS INTERNET ASSISTÊNCIA SOCIAL', '6033', '2020-11-03', 3400.00, 'pendente', null, 'Sem OK na planilha (nota de 2020)'),
  ('CONTR DE NOTAS INTERNET ASSISTÊNCIA SOCIAL', '6187', '2020-12-02', 3400.00, 'pendente', null, 'Sem OK na planilha (nota de 2020)'),
  ('CONTR DE NOTAS INTERNET ASSISTÊNCIA SOCIAL', '6208', '2020-12-08', 3400.00, 'pendente', null, 'Sem OK na planilha (nota de 2020)'),
  ('CONTR DE NOTAS INTERNET - EDUCAÇÃO', '13694', '2023-02-02', 3400.00, 'pago', '2023-05-15', null),
  ('CONTR DE NOTAS INTERNET - EDUCAÇÃO', '14557', '2023-03-01', 3400.00, 'pago', '2023-07-19', null),
  ('CONTR DE NOTAS INTERNET - EDUCAÇÃO', '15417', '2023-04-01', 3400.00, 'pago', '2023-08-15', null),
  ('CONTR DE NOTAS INTERNET - EDUCAÇÃO', '16253', '2023-05-02', 3400.00, 'pago', '2023-09-14', null),
  ('CONTR DE NOTAS INTERNET - EDUCAÇÃO', '17102', '2023-06-01', 3400.00, 'pago', '2023-10-06', null),
  ('CONTR DE NOTAS INTERNET - EDUCAÇÃO', '18029', '2023-07-06', 3400.00, 'pago', '2023-12-14', null),
  ('CONTR DE NOTAS INTERNET - EDUCAÇÃO', '18829', '2023-08-01', 3400.00, 'pago', '2024-01-02', null),
  ('CONTR DE NOTAS INTERNET - EDUCAÇÃO', '19688', '2023-09-02', 3400.00, 'pago', '2024-03-06', null),
  ('CONTR DE NOTAS INTERNET - EDUCAÇÃO', '20541', '2023-10-02', 3400.00, 'pago', '2024-03-22', null),
  ('CONTR DE NOTAS INTERNET - EDUCAÇÃO', '21291', '2023-11-03', 3400.00, 'pago', '2024-05-06', null),
  ('CONTR DE NOTAS INTERNET - EDUCAÇÃO', '22138', '2023-12-01', 3400.00, 'pago', '2024-06-03', null),
  ('CONTR DE NOTAS INTERNET - EDUCAÇÃO', '22175', '2023-12-21', 3400.00, 'pago', '2024-07-11', null),
  ('CONTR DE NOTAS INTERNET - EDUCAÇÃO', '24535', '2024-03-20', 3400.00, 'pago', '2024-09-06', null),
  ('CONTR DE NOTAS INTERNET - EDUCAÇÃO', '24536', '2024-03-20', 3400.00, 'pago', '2024-09-17', null),
  ('CONTR DE NOTAS INTERNET - EDUCAÇÃO', '26271', '2024-05-02', 3400.00, 'pago', '2024-11-08', null),
  ('CONTR DE NOTAS INTERNET - EDUCAÇÃO', '6036', '2020-11-03', 3400.00, 'pendente', null, 'Sem OK na planilha (nota de 2020)'),
  ('CONTR DE NOTAS INTERNET - EDUCAÇÃO', '6211', '2020-12-08', 3400.00, 'pendente', null, 'Sem OK na planilha (nota de 2020)'),
  ('CONTR DE NOTAS INTERNET - SAÚDE', '13691', '2023-02-02', 3400.00, 'pago', '2023-05-15', null),
  ('CONTR DE NOTAS INTERNET - SAÚDE', '14554', '2023-03-01', 3400.00, 'pago', '2023-07-19', null),
  ('CONTR DE NOTAS INTERNET - SAÚDE', '15414', '2023-04-01', 3400.00, 'pago', '2023-08-15', null),
  ('CONTR DE NOTAS INTERNET - SAÚDE', '16252', '2023-05-02', 3400.00, 'pago', '2023-09-14', null),
  ('CONTR DE NOTAS INTERNET - SAÚDE', '17099', '2023-06-01', 3400.00, 'pago', '2023-10-06', null),
  ('CONTR DE NOTAS INTERNET - SAÚDE', '18026', '2023-07-06', 3400.00, 'pago', '2023-12-14', null),
  ('CONTR DE NOTAS INTERNET - SAÚDE', '18828', '2023-08-01', 3400.00, 'pago', '2024-01-02', null),
  ('CONTR DE NOTAS INTERNET - SAÚDE', '19687', '2023-09-02', 3400.00, 'pago', '2024-03-06', null),
  ('CONTR DE NOTAS INTERNET - SAÚDE', '20540', '2023-10-02', 3400.00, 'pago', '2024-03-22', null),
  ('CONTR DE NOTAS INTERNET - SAÚDE', '21290', '2023-11-03', 3400.00, 'pago', '2024-05-06', null),
  ('CONTR DE NOTAS INTERNET - SAÚDE', '22137', '2023-12-01', 3400.00, 'pago', '2024-06-03', null),
  ('CONTR DE NOTAS INTERNET - SAÚDE', '22174', '2023-12-21', 3400.00, 'pago', '2024-07-11', null),
  ('CONTR DE NOTAS INTERNET - SAÚDE', '24533', '2024-03-20', 3400.00, 'pago', '2024-09-06', null),
  ('CONTR DE NOTAS INTERNET - SAÚDE', '24534', '2024-03-20', 3400.00, 'pago', '2024-09-17', null),
  ('CONTR DE NOTAS INTERNET - SAÚDE', '26270', '2024-05-02', 3400.00, 'pago', '2024-11-08', null),
  ('CONTR DE NOTAS INTERNET - SAÚDE', '6035', '2020-11-03', 3400.00, 'pendente', null, 'Sem OK na planilha (nota de 2020)'),
  ('CONTR DE NOTAS INTERNET - SAÚDE', '6189', '2020-12-02', 3400.00, 'pendente', null, 'Sem OK na planilha (nota de 2020)'),
  ('CONTR DE NOTAS INTERNET - SAÚDE', '6210', '2020-12-08', 3400.00, 'pendente', null, 'Sem OK na planilha (nota de 2020)'),
  ('CONTR DE NOTAS INTERNET - ADM', '13692', '2023-02-02', 6800.00, 'pago', '2023-05-15', null),
  ('CONTR DE NOTAS INTERNET - ADM', '14555', '2023-03-01', 6800.00, 'pago', '2023-07-19', null),
  ('CONTR DE NOTAS INTERNET - ADM', '15415', '2023-04-01', 6800.00, 'pago', '2023-08-15', null),
  ('CONTR DE NOTAS INTERNET - ADM', '16256', '2023-05-02', 6800.00, 'pago', '2023-09-14', null),
  ('CONTR DE NOTAS INTERNET - ADM', '17100', '2023-06-01', 6800.00, 'pago', '2023-10-06', null),
  ('CONTR DE NOTAS INTERNET - ADM', '18027', '2023-07-06', 6800.00, 'pago', '2023-12-14', null),
  ('CONTR DE NOTAS INTERNET - ADM', '18827', '2023-08-01', 6800.00, 'pago', '2024-01-02', null),
  ('CONTR DE NOTAS INTERNET - ADM', '19686', '2023-09-02', 6800.00, 'pago', '2024-03-06', null),
  ('CONTR DE NOTAS INTERNET - ADM', '20539', '2023-10-02', 6800.00, 'pago', '2024-03-22', null),
  ('CONTR DE NOTAS INTERNET - ADM', '21291', '2023-11-03', 6800.00, 'pago', '2024-05-06', null),
  ('CONTR DE NOTAS INTERNET - ADM', '22136', '2023-12-01', 6800.00, 'pago', '2024-06-03', null),
  ('CONTR DE NOTAS INTERNET - ADM', '22173', '2023-12-21', 6800.00, 'pago', '2024-07-11', null),
  ('CONTR DE NOTAS INTERNET - ADM', '24531', '2024-03-20', 6800.00, 'pago', '2024-09-06', null),
  ('CONTR DE NOTAS INTERNET - ADM', '24532', '2024-03-20', 6800.00, 'pago', '2024-09-17', null),
  ('CONTR DE NOTAS INTERNET - ADM', '26269', '2024-05-02', 6800.00, 'pago', '2024-11-08', null),
  ('CONTR DE NOTAS INTERNET - ADM', '6034', '2020-11-03', 6800.00, 'pendente', null, 'Sem OK na planilha (nota de 2020)'),
  ('CONTR DE NOTAS INTERNET - ADM', '6188', '2020-12-02', 6800.00, 'pendente', null, 'Sem OK na planilha (nota de 2020)'),
  ('CONTR DE NOTAS INTERNET - ADM', '6209', '2020-12-08', 6800.00, 'pendente', null, 'Sem OK na planilha (nota de 2020)')
) as v(secretaria, numero, data_emissao, valor, situacao, data_baixa, observacao)
join public.prefeitura_secretarias s
  on s.grupo = 'INTERNET' and s.nome = v.secretaria
where not exists (
  select 1 from public.prefeitura_notas n
  where n.secretaria_id = s.id
    and n.numero = v.numero
    and n.data_emissao = v.data_emissao::date
);

-- ============================================================================
-- CONFERÊNCIA — deve dar 291 notas: 258 pagas e 33 pendentes (R$ 138.200,00)
-- ============================================================================
--   select situacao, count(*), sum(valor)
--   from public.prefeitura_notas n
--   join public.prefeitura_secretarias s on s.id = n.secretaria_id
--   where s.grupo = 'INTERNET'
--   group by situacao;
-- ============================================================================
