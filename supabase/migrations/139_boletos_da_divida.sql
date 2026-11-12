-- OS BOLETOS DA DÍVIDA (Devedores) — do mesmo jeito dos boletos do aluguel.
--
-- Primeiro o boleto nasce SÓ NO SISTEMA (cora_status = 'SISTEMA'): um por
-- parcela, ou um só com o saldo na dívida de pagamentos avulsos. Dá para
-- imprimir o carnê e cobrar. Quando o dono confirma, "Gerar no banco" registra
-- o boleto na Cora (código de barras + Pix) e a linha ganha os dados dele.
-- Pago no banco, o webhook da Cora (ou a conferência ao abrir Devedores) dá a
-- baixa sozinho: o pagamento entra em loan_payments e a parcela fica PAGA.
--
-- Como todo o módulo Devedores: NADA aqui encosta no caixa (transactions).

create table if not exists public.loan_boletos (
  id              uuid primary key default gen_random_uuid(),
  loan_id         uuid not null references public.loans(id) on delete cascade,
  -- a parcela que este boleto cobra (nulo no boleto do saldo da dívida avulsa)
  installment_id  uuid references public.loan_installments(id) on delete set null,
  numero          integer,
  descricao       text,
  due_date        date not null,
  amount          numeric(14,2) not null check (amount > 0),
  -- nulo enquanto o boleto está só no sistema
  cora_invoice_id text,
  cora_status     text not null default 'SISTEMA',
  digitable_line  text,
  barcode         text,
  pdf_url         text,
  our_number      text,
  pix_emv         text,
  paid_at         date,
  paid_amount     numeric(14,2),
  -- o pagamento que a baixa automática criou
  payment_id      uuid references public.loan_payments(id) on delete set null,
  created_by      uuid references auth.users(id) default auth.uid(),
  created_at      timestamptz not null default now()
);

create index if not exists idx_loan_boletos_loan on public.loan_boletos(loan_id, due_date);
create unique index if not exists uq_loan_boletos_cora
  on public.loan_boletos(cora_invoice_id) where cora_invoice_id is not null;

comment on table public.loan_boletos is
  'Boletos da dívida (Devedores): só no sistema e, depois de confirmar, na Cora.';

alter table public.loan_boletos enable row level security;

drop policy if exists "loan_boletos_read"  on public.loan_boletos;
drop policy if exists "loan_boletos_write" on public.loan_boletos;

create policy "loan_boletos_read" on public.loan_boletos
  for select using (auth.uid() is not null);

-- quem escreve é quem cuida das dívidas (o mesmo das parcelas e pagamentos)
create policy "loan_boletos_write" on public.loan_boletos
  for all
  using (public.current_user_role() in ('admin', 'financeiro') or public.user_can_write_module('devedores'))
  with check (public.current_user_role() in ('admin', 'financeiro') or public.user_can_write_module('devedores'));
