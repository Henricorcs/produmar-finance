-- CONFISSÃO DE DÍVIDA ASSINÁVEL COM CERTIFICADO
--
-- A confissão de dívida (Devedores → a dívida → Confissão de dívida) pode ser
-- assinada pela PRODUMAR com o certificado A1, como os contratos de Aluguéis.
-- O PDF assinado fica guardado (signed_documents, 123) e a cópia vai para o
-- arquivo (signed_files, 124). Aqui só entra o tipo novo nas duas listas.

alter table public.signed_documents drop constraint if exists signed_documents_doc_type_check;
alter table public.signed_documents add constraint signed_documents_doc_type_check
  check (doc_type in ('aluguel', 'compra_venda', 'procuracao', 'confissao_divida'));

alter table public.signed_files drop constraint if exists signed_files_origin_check;
alter table public.signed_files add constraint signed_files_origin_check
  check (origin in ('avulso', 'aluguel', 'compra_venda', 'procuracao', 'confissao_divida'));
