-- ============================================================================
-- Produmar Finance — Comprovantes de Empréstimos (anexos)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
--
-- Reaproveita o bucket de storage 'attachments' (o mesmo usado pela aba Contas).
-- Os arquivos dos empréstimos ficam sob o prefixo  loans/<loan_id>/...
-- ============================================================================

-- ── Garante que o bucket existe (idempotente) ──────────────────────────────
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- ── Policies do bucket (cria só se ainda não existirem) ────────────────────
do $$ begin
  create policy "Authenticated read attachments" on storage.objects for select
    using (bucket_id = 'attachments' and auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Authenticated upload attachments" on storage.objects for insert
    with check (bucket_id = 'attachments' and auth.uid() is not null);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "Authenticated delete attachments" on storage.objects for delete
    using (bucket_id = 'attachments' and auth.uid() is not null);
exception when duplicate_object then null; end $$;

-- ============================================================================
-- TABELA: loan_attachments (comprovantes de um empréstimo / pagamento)
-- ============================================================================
create table public.loan_attachments (
  id uuid primary key default uuid_generate_v4(),
  loan_id    uuid not null references public.loans(id) on delete cascade,
  -- opcional: vincula o comprovante a um pagamento específico
  payment_id uuid references public.loan_payments(id) on delete set null,

  file_name    text not null,
  file_size    bigint,
  mime_type    text,
  storage_path text not null,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_loan_attachments_loan    on public.loan_attachments(loan_id);
create index idx_loan_attachments_payment on public.loan_attachments(payment_id);

-- ============================================================================
-- ROW LEVEL SECURITY (igual ao resto: leitura logado, escrita admin/financeiro)
-- ============================================================================
alter table public.loan_attachments enable row level security;

create policy "loan_attachments_read"  on public.loan_attachments for select
  using (auth.uid() is not null);
create policy "loan_attachments_write" on public.loan_attachments for all
  using (public.current_user_role() in ('admin', 'financeiro'));
