-- ============================================================================
-- Produmar Finance — Empréstimos aparecem em "A receber"
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
--
-- Vincula cada parcela (e o empréstimo avulso) a uma transação de ENTRADA
-- pendente, para que os recebimentos esperados apareçam no KPI "A receber",
-- no filtro "A receber" da aba Contas e na projeção de fluxo de caixa.
-- ============================================================================

-- Recebível único (empréstimos avulsos)
alter table public.loans
  add column if not exists receivable_transaction_id uuid
  references public.transactions(id) on delete set null;

-- Recebível por parcela (empréstimos parcelados)
alter table public.loan_installments
  add column if not exists transaction_id uuid
  references public.transactions(id) on delete set null;

create index if not exists idx_loans_receivable
  on public.loans(receivable_transaction_id);
create index if not exists idx_loan_installments_tx
  on public.loan_installments(transaction_id);
