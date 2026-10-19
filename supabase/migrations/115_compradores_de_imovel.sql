-- ============================================================================
-- PRODUMAR — ALUGUÉIS: QUEM COMPRA O IMÓVEL (compradores cadastrados)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE NOVO sem estragar nada.
--
-- Rodar depois da 110 (contrato de compra e venda).
-- ============================================================================
-- Por que:
--
--   Até aqui a compradora era sempre a PRODUMAR. Agora o contrato pode ser
--   feito para outra empresa ou para uma pessoa física. Os compradores ficam
--   num cadastro (property_buyers) para não precisar digitar tudo de novo no
--   próximo contrato; o contrato só aponta para quem comprou (buyer_id).
--
--   buyer_id vazio = a PRODUMAR, como sempre foi — contrato antigo continua
--   igual. Comprador que já está em algum contrato não pode ser apagado (a
--   trava é do banco: "on delete restrict"), senão o contrato passaria a sair
--   com a PRODUMAR no lugar dele sem ninguém perceber.
--
-- Nada é apagado: entram uma tabela e uma coluna.
-- ============================================================================

begin;

create table if not exists public.property_buyers (
  id uuid primary key default uuid_generate_v4(),

  -- 'pj' = empresa, 'pf' = pessoa física
  kind text not null default 'pf' check (kind in ('pj', 'pf')),

  name           text not null,   -- razão social ou nome completo
  document       text,            -- CNPJ ou CPF
  rg             text,            -- só pessoa física
  nationality    text,
  marital_status text,
  property_regime text,
  profession     text,

  street     text,
  number     text,
  complement text,
  district   text,
  city       text,
  zip        text,
  phone      text,
  email      text,

  -- empresa: quem assina por ela
  rep_name     text,
  rep_document text,
  rep_rg       text,
  rep_role     text,              -- sócio administrador, diretor...

  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.property_buyers is
  'Compradores de imóvel (empresa ou pessoa física) para o contrato de compra e venda (migration 115). Sem comprador escolhido, a compradora é a PRODUMAR.';

alter table public.property_sale_contracts
  add column if not exists buyer_id uuid references public.property_buyers(id) on delete restrict;

create index if not exists idx_property_sale_contracts_buyer
  on public.property_sale_contracts(buyer_id);

alter table public.property_buyers enable row level security;

drop policy if exists "property_buyers_read"  on public.property_buyers;
drop policy if exists "property_buyers_write" on public.property_buyers;

create policy "property_buyers_read" on public.property_buyers
  for select using (auth.uid() is not null);
create policy "property_buyers_write" on public.property_buyers
  for all
  using (public.user_can_write_module('alugueis'))
  with check (public.user_can_write_module('alugueis'));

commit;

notify pgrst, 'reload schema';
