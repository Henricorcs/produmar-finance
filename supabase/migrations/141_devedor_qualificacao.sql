-- OS DADOS DO DEVEDOR PARA A CONFISSÃO DE DÍVIDA
--
-- A confissão de dívida (140) precisa da qualificação completa de quem deve.
-- A dívida só guardava nome, CPF/CNPJ e telefone — o resto saía como linha
-- para a caneta. Agora o cadastro da dívida tem os campos:
--   pessoa física: nacionalidade, estado civil, profissão, RG e endereço;
--   empresa (CNPJ): endereço da sede e quem assina por ela (nome e CPF).
-- Tudo opcional: o que ficar em branco continua saindo como linha.

alter table public.loans add column if not exists borrower_nationality   text;
alter table public.loans add column if not exists borrower_marital_status text;
alter table public.loans add column if not exists borrower_profession    text;
alter table public.loans add column if not exists borrower_rg            text;
alter table public.loans add column if not exists borrower_address       text;
alter table public.loans add column if not exists borrower_rep_name      text;
alter table public.loans add column if not exists borrower_rep_document  text;
