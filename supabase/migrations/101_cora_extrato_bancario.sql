-- Importação automática do extrato bancário da Cora: cada movimentação vira
-- um lançamento em `transactions`, sem plano de contas (category_id/
-- cost_center_id nulos) até alguém classificar.
--
-- A origem de um lançamento já é derivável sem coluna redundante:
--   cora_invoice_id is null and cora_entry_id is null  -> lançamento manual
--   cora_invoice_id is not null                        -> boleto emitido pelo sistema
--   cora_invoice_id is null and cora_entry_id is not null -> só apareceu no extrato

alter table public.transactions
  add column if not exists cora_entry_id text unique,
  add column if not exists cora_transaction_type text;
