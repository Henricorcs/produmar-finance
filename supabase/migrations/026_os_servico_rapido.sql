-- ============================================================================
-- ILNET Finance — OS de "Serviço rápido" (tarefas/errands de funcionários)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Conceito:
--   • Novo tipo de OS 'servico_rapido': uma tarefa rápida atribuída a um
--     funcionário comum (ex.: "comprar 1L de diesel"). É sempre INTERNA, sem
--     máquina, sem cobrança e sem materiais — só a tarefa.
--   • O funcionário usa a MESMA tela de OS dos técnicos (painel /operador):
--     INICIAR em 1 toque, PAUSAR/CONTINUAR (igual à prestação de serviço
--     interno) e FINALIZAR.
--   • No fechamento ele escreve "o que foi feito" (completion_notes), pode
--     informar o valor gasto (vira o total da OS — custo interno) e anexar
--     comprovantes (foto do recibo / PDF) na tabela service_order_attachments.
-- ============================================================================

-- ── Novo valor do enum (não é usado em nenhum INSERT/UPDATE neste script, então
--    pode ficar no mesmo arquivo) ────────────────────────────────────────────
ALTER TYPE service_order_type ADD VALUE IF NOT EXISTS 'servico_rapido';

-- ── "O que foi feito" (preenchido pelo funcionário ao finalizar) ────────────
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS completion_notes text;

-- ============================================================================
-- TABELA: service_order_attachments (comprovantes de uma OS)
-- ============================================================================
-- Reaproveita o bucket de storage 'attachments' (o mesmo usado por Contas e
-- Empréstimos). Os arquivos ficam sob o prefixo  service_orders/<os_id>/...

-- Garante que o bucket existe (idempotente)
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- Policies do bucket (cria só se ainda não existirem) — qualquer autenticado
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

create table if not exists public.service_order_attachments (
  id uuid primary key default uuid_generate_v4(),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,

  file_name    text not null,
  file_size    bigint,
  mime_type    text,
  storage_path text not null,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_service_order_attachments_order
  on public.service_order_attachments(service_order_id);

alter table public.service_order_attachments enable row level security;

-- Leitura: todo usuário logado. Escrita: admin/financeiro/operador
-- (o operador faz o upload do comprovante ao finalizar — mesma regra de
-- service_order_pauses).
drop policy if exists "service_order_attachments_read"  on public.service_order_attachments;
drop policy if exists "service_order_attachments_write" on public.service_order_attachments;
create policy "service_order_attachments_read"  on public.service_order_attachments
  for select using (auth.uid() is not null);
create policy "service_order_attachments_write" on public.service_order_attachments
  for all using (public.current_user_role() in ('admin', 'financeiro', 'operador'));
