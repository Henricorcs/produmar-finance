-- ============================================================================
-- PRODUMAR — PREFEITURA: IMPORTA A ABA "NF" (CONTRATOS DE MONITORAMENTO)
-- ============================================================================
-- Execute no SQL Editor do Supabase. PODE RODAR DE UMA VEZ SÓ, e pode rodar
-- de novo: nota que já existe (mesma secretaria, número e data) é pulada.
--
-- Rodar DEPOIS da 103 (que criou a coluna `grupo`).
-- ============================================================================
-- De onde veio:
--
--   \\192.168.11.160\financeiro\CONTROLE DE NOTAS PREFEITURA 2026.xlsx,
--   aba NF — as 5 colunas de monitoramento, 164 notas. Ficam no grupo "NF".
--
--   A coluna "FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS INTERNET UBS" da
--   mesma aba NÃO entra: ela repete as notas que já vieram da aba INTERNET.
--
--   Como na 103: OK → paga, com a data do comentário da célula; sem OK →
--   pendente.
--
-- Erros de digitação da planilha corrigidos na importação:
--   • CSF/FUNDO nota 37:        emissão "24//04/24" → 24/04/2024
--   • MONITORAMENTO nota 11633: baixa "15/05/203" → 15/05/2023
--   • CSF/FUNDO nota 139:       baixa 10/03/2025, antes da emissão (22/12/2025)
--                               → 10/03/2026, o dia das notas irmãs
-- ============================================================================

insert into public.prefeitura_secretarias (grupo, nome, valor_padrao, ordem)
select 'NF', v.nome, v.valor_padrao, v.ordem
from (values
  ('CONTR DE NOTAS MONITORAMENTO', 14491.66, 1),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', 2995.67, 2),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', 1767.67, 3),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', 1900.67, 4),
  ('CONTR DE NOTA CENTRO ADM', 3990.33, 5)
) as v(nome, valor_padrao, ordem)
where not exists (
  select 1 from public.prefeitura_secretarias s
  where s.grupo = 'NF' and s.nome = v.nome
);

insert into public.prefeitura_notas
  (secretaria_id, numero, data_emissao, valor, situacao, data_baixa, observacao)
select s.id, v.numero, v.data_emissao::date, v.valor, v.situacao, v.data_baixa::date, v.observacao
from (values
  ('CONTR DE NOTAS MONITORAMENTO', '9342', '2022-09-06', 14491.66, 'pago', '2022-09-16', null),
  ('CONTR DE NOTAS MONITORAMENTO', '9724', '2022-10-07', 14491.66, 'pago', '2022-10-25', null),
  ('CONTR DE NOTAS MONITORAMENTO', '10110', '2022-11-11', 14491.66, 'pago', '2022-12-05', null),
  ('CONTR DE NOTAS MONITORAMENTO', '10506', '2022-12-14', 14491.66, 'pago', '2023-02-17', null),
  ('CONTR DE NOTAS MONITORAMENTO', '10518', '2022-12-24', 14491.66, 'pago', '2023-03-30', null),
  ('CONTR DE NOTAS MONITORAMENTO', '11633', '2023-03-13', 14491.66, 'pago', '2023-05-15', null),
  ('CONTR DE NOTAS MONITORAMENTO', '11634', '2023-03-13', 14491.66, 'pago', '2023-06-14', null),
  ('CONTR DE NOTAS MONITORAMENTO', '11992', '2023-03-31', 14491.66, 'pago', '2023-07-18', null),
  ('CONTR DE NOTAS MONITORAMENTO', '12374', '2023-05-02', 14491.66, 'pago', '2023-12-12', null),
  ('CONTR DE NOTAS MONITORAMENTO', '13099', '2023-07-06', 14491.66, 'pago', '2024-02-02', null),
  ('CONTR DE NOTAS MONITORAMENTO', '6', '2023-08-10', 14491.66, 'pago', '2024-04-09', null),
  ('CONTR DE NOTAS MONITORAMENTO', '8', '2023-09-19', 14491.66, 'pago', '2024-04-09', null),
  ('CONTR DE NOTAS MONITORAMENTO', '12', '2023-10-09', 14491.67, 'pago', '2024-07-11', null),
  ('CONTR DE NOTAS MONITORAMENTO', '14', '2023-11-08', 14491.67, 'pago', '2024-07-19', null),
  ('CONTR DE NOTAS MONITORAMENTO', '19', '2023-12-01', 14491.67, 'pago', '2025-05-15', null),
  ('CONTR DE NOTAS MONITORAMENTO', '25', '2024-02-06', 14491.67, 'pago', '2025-09-17', null),
  ('CONTR DE NOTAS MONITORAMENTO', '27', '2024-02-16', 14491.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO', '31', '2024-03-14', 14491.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO', '36', '2024-04-18', 14491.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO', '47', '2024-05-16', 14491.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO', '52', '2024-06-17', 14491.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO', '57', '2024-07-10', 14491.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO', '60', '2024-08-13', 14491.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO', '68', '2024-09-16', 14491.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO', '76', '2024-10-15', 14491.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO', '80', '2024-11-13', 14491.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO', '84', '2024-12-24', 14491.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO', '96', '2025-05-20', 14491.66, 'pago', '2026-07-29', null),
  ('CONTR DE NOTAS MONITORAMENTO', '97', '2025-05-20', 14491.66, 'pago', '2026-07-29', null),
  ('CONTR DE NOTAS MONITORAMENTO', '98', '2025-05-20', 14491.66, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO', '99', '2025-05-20', 14491.66, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO', '103', '2025-06-12', 14491.66, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO', '111', '2025-07-28', 14491.66, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO', '114', '2025-08-12', 14491.66, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO', '117', '2025-09-03', 14491.66, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO', '123', '2025-10-02', 14491.66, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO', '125', '2025-12-03', 14491.66, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO', '132', '2025-12-04', 14491.66, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO', '138', '2025-12-22', 14491.66, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO', '1', '2026-02-19', 14491.66, 'pago', '2026-08-20', null),
  ('CONTR DE NOTAS MONITORAMENTO', '4', '2026-03-03', 14491.66, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO', '7', '2026-04-07', 14491.66, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '11630', '2023-03-07', 2995.67, 'pago', '2023-03-30', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '11631', '2023-03-07', 2995.67, 'pago', '2023-03-30', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '11993', '2023-03-31', 2995.67, 'pago', '2023-06-14', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '12376', '2023-05-02', 2995.67, 'pago', '2024-02-02', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '12743', '2023-06-02', 2995.67, 'pago', '2024-02-02', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '13098', '2023-07-06', 2995.67, 'pago', '2024-02-02', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '4', '2023-08-10', 2995.67, 'pago', '2024-02-02', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '9', '2023-09-12', 2995.67, 'pago', '2024-02-02', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '10', '2023-10-02', 2995.67, 'pago', '2024-04-09', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '13', '2023-11-08', 2995.67, 'pago', '2024-04-10', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '20', '2023-12-04', 2995.67, 'pago', '2024-04-26', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '37', '2024-04-24', 2995.67, 'pago', '2024-04-26', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '38', '2024-04-24', 2995.67, 'pago', '2024-05-13', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '39', '2024-04-24', 2995.67, 'pago', '2024-05-13', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '40', '2024-04-24', 2995.67, 'pago', '2024-06-11', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '46', '2024-05-16', 2995.67, 'pago', '2024-06-11', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '51', '2024-06-10', 2995.67, 'pago', '2024-07-15', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '55', '2024-07-09', 2995.67, 'pago', '2025-01-22', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '59', '2024-08-13', 2995.67, 'pago', '2025-06-24', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '69', '2024-09-16', 2995.67, 'pago', '2025-06-24', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '75', '2024-10-10', 2995.67, 'pago', '2025-06-24', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '79', '2024-11-13', 2995.67, 'pago', '2025-06-24', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '83', '2024-12-12', 2995.67, 'pago', '2025-06-24', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '88', '2025-03-26', 2995.67, 'pago', '2025-06-24', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '89', '2025-03-26', 2995.67, 'pago', '2025-06-24', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '94', '2025-04-07', 2995.67, 'pago', '2025-06-24', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '95', '2025-05-20', 2995.67, 'pago', '2025-06-24', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '104', '2025-06-12', 2995.67, 'pago', '2025-09-05', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '110', '2025-07-28', 2995.67, 'pago', '2026-03-10', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '113', '2025-08-12', 2995.67, 'pago', '2026-03-10', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '120', '2025-09-03', 2995.67, 'pago', '2026-03-10', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '122', '2025-10-02', 2995.67, 'pago', '2026-03-10', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '126', '2025-12-03', 2995.67, 'pago', '2026-03-10', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '130', '2025-12-04', 2995.67, 'pago', '2026-03-10', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '139', '2025-12-22', 2995.67, 'pago', '2026-03-10', null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '3', '2026-02-19', 2995.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '5', '2026-03-03', 2995.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '8', '2026-04-07', 2995.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '11', '2026-05-27', 2995.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '14', '2026-06-18', 2995.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '15', '2026-07-01', 2995.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '17', '2026-08-03', 2995.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO CSF/FUNDO', '19', '2026-09-02', 2995.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '12015', '2023-04-24', 1767.67, 'pago', '2023-06-14', null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '12742', '2023-06-02', 1767.67, 'pago', '2024-02-02', null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '13099', '2023-07-06', 1767.67, 'pago', '2024-02-02', null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '5', '2023-08-10', 1767.67, 'pago', '2024-02-02', null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '7', '2023-09-12', 1767.67, 'pago', '2024-02-02', null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '11', '2023-10-02', 1767.67, 'pago', '2024-04-09', null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '15', '2023-11-08', 1767.67, 'pago', '2024-04-09', null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '18', '2023-12-01', 1767.67, 'pago', '2024-04-09', null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '21', '2024-01-16', 1767.67, 'pago', '2024-04-09', null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '22', '2024-01-16', 1767.67, 'pago', '2024-07-11', null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '28', '2024-02-16', 1767.67, 'pago', '2024-07-11', null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '30', '2024-03-06', 1767.67, 'pago', '2024-07-11', null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '41', '2024-04-26', 1767.67, 'pago', '2024-07-19', null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '43', '2024-04-29', 1767.67, 'pago', '2024-07-19', null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '44', '2024-05-07', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '50', '2024-06-06', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '56', '2024-07-09', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '61', '2024-08-13', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '70', '2024-09-16', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '74', '2024-10-10', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '78', '2024-11-11', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '82', '2024-12-12', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '85', '2025-02-07', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '91', '2025-03-26', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '92', '2025-03-26', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '105', '2025-07-08', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '106', '2025-07-08', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '107', '2025-07-08', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '108', '2025-07-08', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '109', '2025-07-28', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '115', '2025-08-12', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '118', '2025-09-03', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '121', '2025-10-02', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '127', '2025-12-03', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '135', '2025-12-04', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '140', '2025-12-22', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO INFRA', '9', '2026-04-07', 1767.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '33', '2024-03-27', 1900.67, 'pago', '2024-07-11', null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '34', '2024-03-27', 1900.67, 'pago', '2024-07-11', null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '36', '2024-04-18', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '45', '2024-05-16', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '49', '2024-06-04', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '54', '2024-07-09', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '62', '2024-08-13', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '71', '2024-09-16', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '73', '2024-10-04', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '77', '2024-11-05', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '81', '2024-12-12', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '90', '2025-03-25', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '93', '2025-04-07', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '100', '2025-05-23', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '101', '2025-05-23', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '102', '2025-06-12', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '112', '2025-07-28', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '116', '2025-08-12', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '119', '2025-09-03', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '124', '2025-10-02', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '137', '2025-12-04', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '141', '2025-12-22', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '2', '2026-02-19', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '6', '2026-03-03', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '10', '2026-04-07', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '12', '2026-05-27', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '13', '2026-06-18', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '16', '2026-07-01', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '18', '2026-08-04', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTAS MONITORAMENTO PRONTO SOCORRO', '21', '2026-09-04', 1900.67, 'pendente', null, null),
  ('CONTR DE NOTA CENTRO ADM', '16', '2023-11-09', 3990.33, 'pago', '2024-02-02', null),
  ('CONTR DE NOTA CENTRO ADM', '17', '2023-12-01', 3990.33, 'pago', '2024-02-02', null),
  ('CONTR DE NOTA CENTRO ADM', '23', '2024-02-05', 3990.33, 'pago', '2024-05-13', null),
  ('CONTR DE NOTA CENTRO ADM', '24', '2024-02-05', 3990.33, 'pago', '2024-07-11', null),
  ('CONTR DE NOTA CENTRO ADM', '29', '2024-02-26', 3990.33, 'pago', '2024-07-11', null),
  ('CONTR DE NOTA CENTRO ADM', '32', '2024-03-27', 3990.33, 'pago', '2024-07-19', null),
  ('CONTR DE NOTA CENTRO ADM', '42', '2024-04-26', 3990.33, 'pago', '2024-07-19', null),
  ('CONTR DE NOTA CENTRO ADM', '48', '2024-06-01', 3990.33, 'pago', '2024-07-19', null),
  ('CONTR DE NOTA CENTRO ADM', '53', '2024-06-26', 3990.33, 'pago', '2024-09-13', null),
  ('CONTR DE NOTA CENTRO ADM', '58', '2024-07-29', 3990.33, 'pago', '2024-09-13', null),
  ('CONTR DE NOTA CENTRO ADM', '63', '2024-08-28', 3990.33, 'pendente', null, null),
  ('CONTR DE NOTA CENTRO ADM', '72', '2024-09-30', 3990.33, 'pendente', null, null)
) as v(secretaria, numero, data_emissao, valor, situacao, data_baixa, observacao)
join public.prefeitura_secretarias s
  on s.grupo = 'NF' and s.nome = v.secretaria
where not exists (
  select 1 from public.prefeitura_notas n
  where n.secretaria_id = s.id
    and n.numero = v.numero
    and n.data_emissao = v.data_emissao::date
);

-- ============================================================================
-- CONFERÊNCIA — deve dar 164 notas: 80 pagas (R$ 448.642,05) e
-- 84 pendentes (R$ 459.129,48)
-- ============================================================================
--   select situacao, count(*), sum(valor)
--   from public.prefeitura_notas n
--   join public.prefeitura_secretarias s on s.id = n.secretaria_id
--   where s.grupo = 'NF'
--   group by situacao;
-- ============================================================================
