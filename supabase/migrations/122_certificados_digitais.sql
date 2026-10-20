-- ============================================================================
-- PRODUMAR — CERTIFICADOS DIGITAIS A1 (para assinar contratos e procurações)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE NOVO sem estragar nada.
-- ============================================================================
-- Por que:
--
--   Os contratos e procurações eram baixados em PDF e assinados no computador,
--   com o certificado A1 instalado ali. Agora os certificados ficam no sistema
--   e o PDF sai assinado direto da tela, até pelo celular.
--
-- SEGURANÇA — esta tabela guarda o arquivo do certificado e a senha dele:
--   • os dois CIFRADOS (AES-256-GCM) pelo servidor antes de chegar aqui;
--   • RLS ligado e NENHUMA regra de leitura: nenhum usuário logado lê esta
--     tabela, nem com o app aberto. Só o servidor (chave de serviço) lê —
--     e ele só faz isso para quem é admin.
--
-- Nada é apagado: entra uma tabela nova.
-- ============================================================================

begin;

create table if not exists public.signing_certificates (
  id uuid primary key default uuid_generate_v4(),

  -- de quem é (lido do próprio certificado ao enviar)
  holder_name     text not null,
  holder_document text,           -- CPF ou CNPJ, só dígitos
  issuer          text,
  valid_from      timestamptz,
  valid_until     timestamptz,

  -- o cofre (cifrado pelo servidor: "iv.tag.dados" em base64)
  pfx_encrypted      text not null,
  password_encrypted text not null,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.signing_certificates is
  'Certificados A1 para assinar PDFs. Arquivo e senha cifrados; só o servidor lê (migration 122).';

alter table public.signing_certificates enable row level security;
-- de propósito, sem "create policy": ninguém lê pelo app, só a chave de serviço

commit;

notify pgrst, 'reload schema';
