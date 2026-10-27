-- PROCURAÇÃO DE EMPRESA: o outorgante e o outorgado podem ser uma empresa.
-- Empresa usa os mesmos campos da pessoa para razão social (name), CNPJ
-- (document) e sede (endereço), e ganha quem a representa na assinatura.
alter table public.power_of_attorneys
  add column if not exists grantor_kind text not null default 'pf',
  add column if not exists grantor_rep_name text,
  add column if not exists grantor_rep_role text,
  add column if not exists grantor_rep_document text,
  add column if not exists grantor_rep_rg text,
  add column if not exists attorney_kind text not null default 'pf',
  add column if not exists attorney_rep_name text,
  add column if not exists attorney_rep_role text,
  add column if not exists attorney_rep_document text,
  add column if not exists attorney_rep_rg text;

alter table public.power_of_attorneys drop constraint if exists power_of_attorneys_grantor_kind_check;
alter table public.power_of_attorneys add constraint power_of_attorneys_grantor_kind_check
  check (grantor_kind in ('pf', 'pj'));
alter table public.power_of_attorneys drop constraint if exists power_of_attorneys_attorney_kind_check;
alter table public.power_of_attorneys add constraint power_of_attorneys_attorney_kind_check
  check (attorney_kind in ('pf', 'pj'));

comment on column public.power_of_attorneys.grantor_kind is 'pf = pessoa física; pj = empresa (name = razão social, document = CNPJ).';
comment on column public.power_of_attorneys.attorney_kind is 'pf = pessoa física; pj = empresa (name = razão social, document = CNPJ).';
