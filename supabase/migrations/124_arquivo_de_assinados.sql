-- ============================================================================
-- PRODUMAR — ARQUIVO DE DOCUMENTOS ASSINADOS (uma pasta por certificado)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE NOVO sem estragar nada.
--
-- Rodar depois da 122 (certificados) e da 123 (documentos assinados).
-- ============================================================================
-- Por que:
--
--   A aba "Assinar digitalmente" assina qualquer PDF anexado. TUDO o que for
--   assinado com certificado — esses PDFs e também os contratos e procurações
--   de Aluguéis — fica guardado aqui, numa pasta por certificado. Um PDF
--   assinado com dois certificados aparece nas duas pastas.
--
--   É histórico: editar um contrato descarta a assinatura DELE (migration
--   123), mas a cópia assinada continua neste arquivo.
--
--   O PDF mora no disco do servidor (pasta "arquivo-assinado/"); aqui fica o
--   endereço e de quem é. Sem regra de leitura: só o servidor lê, para admin.
--
-- Nada é apagado: entra uma tabela nova.
-- ============================================================================

begin;

create table if not exists public.signed_files (
  id uuid primary key default uuid_generate_v4(),

  file_name  text not null,          -- "contrato-assinado.pdf"
  file_path  text not null,          -- chave no storage
  size_bytes integer,

  -- a pasta: o certificado (o nome e o CPF/CNPJ ficam copiados — a pasta não
  -- some se o certificado for apagado ou renovado)
  certificate_id       uuid references public.signing_certificates(id) on delete set null,
  certificate_name     text not null,
  certificate_document text,

  -- de onde veio: PDF anexado na aba, ou um documento de Aluguéis
  origin text not null default 'avulso'
    check (origin in ('avulso', 'aluguel', 'compra_venda', 'procuracao')),
  doc_id uuid,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_signed_files_pasta
  on public.signed_files(certificate_document, created_at desc);

comment on table public.signed_files is
  'Arquivo de tudo que foi assinado com certificado A1, por certificado (migration 124).';

alter table public.signed_files enable row level security;
-- de propósito, sem "create policy": só o servidor (chave de serviço) lê, para admin

commit;

notify pgrst, 'reload schema';
