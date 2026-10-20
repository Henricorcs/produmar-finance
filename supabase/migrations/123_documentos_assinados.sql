-- ============================================================================
-- PRODUMAR — DOCUMENTOS ASSINADOS (o PDF assinado com certificado fica guardado)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE NOVO sem estragar nada.
--
-- Rodar depois da 122 (certificados digitais).
-- ============================================================================
-- Por que:
--
--   Assinado o contrato (ou a procuração) com certificado, o PDF assinado fica
--   guardado no sistema no lugar do que faltava assinar: a impressão passa a
--   mostrar "Assinado digitalmente" e o Compartilhar manda o PDF assinado.
--   Um documento por contrato — assinar de novo troca o anterior; editar o
--   contrato descarta a assinatura (ela não valeria para o texto novo).
--
--   O arquivo mora no disco do servidor (pasta "assinados/", como as fotos);
--   aqui fica só o endereço dele e quem assinou.
--
-- Nada é apagado: entra uma tabela nova.
-- ============================================================================

begin;

create table if not exists public.signed_documents (
  id uuid primary key default uuid_generate_v4(),
  doc_type  text not null check (doc_type in ('aluguel', 'compra_venda', 'procuracao')),
  doc_id    uuid not null,
  file_path text not null,          -- chave no storage: assinados/<tipo>/<id>/<uuid>.pdf
  signers   text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (doc_type, doc_id)
);

comment on table public.signed_documents is
  'PDF assinado com certificado A1 de cada contrato/procuração (migration 123).';

alter table public.signed_documents enable row level security;

drop policy if exists "signed_documents_read" on public.signed_documents;
-- todo mundo logado vê que está assinado; gravar, só o servidor (chave de serviço)
create policy "signed_documents_read" on public.signed_documents
  for select using (auth.uid() is not null);

commit;

notify pgrst, 'reload schema';
