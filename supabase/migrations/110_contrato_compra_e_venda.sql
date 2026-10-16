-- ============================================================================
-- PRODUMAR — ALUGUÉIS: CONTRATO DE COMPRA E VENDA DE IMÓVEL
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE NOVO sem estragar nada.
--
-- Rodar depois da 078 (aluguéis).
-- ============================================================================
-- Por que:
--
--   Além de alugar, a PRODUMAR compra imóveis. O contrato de compra e venda
--   sai impresso a partir daqui, do mesmo jeito que o de locação:
--
--   • a COMPRADORA é sempre a PRODUMAR — a qualificação dela (CNPJ, endereço,
--     sócia que assina) sai do modelo do contrato de aluguel em uso, então
--     corrigir lá corrige aqui também;
--   • o VENDEDOR (e o cônjuge, quando casado), o imóvel, o preço e a forma de
--     pagamento são preenchidos na tela. O que ficar em branco sai como linha
--     para completar à caneta.
--
-- Nada é apagado: entra uma tabela nova.
-- ============================================================================

create table if not exists public.property_sale_contracts (
  id uuid primary key default uuid_generate_v4(),

  -- ── O vendedor ─────────────────────────────────────────────────────────────
  seller_name           text,
  seller_nationality    text,
  seller_marital_status text,
  seller_property_regime text,  -- regime de bens (comunhão parcial...)
  seller_profession     text,
  seller_rg             text,
  seller_document       text,   -- CPF ou CNPJ
  seller_address        text,
  seller_phone          text,
  seller_email          text,

  -- ── O cônjuge do vendedor (assina junto: art. 1.647 do Código Civil) ──────
  spouse_name        text,
  spouse_nationality text,
  spouse_profession  text,
  spouse_rg          text,
  spouse_document    text,

  -- ── O imóvel ───────────────────────────────────────────────────────────────
  property_kind        text,   -- CASA, TERRENO, PONTO COMERCIAL...
  property_address     text,
  property_area        text,   -- "360,00 m²"
  property_description text,   -- medidas, confrontações, benfeitorias
  property_registration text,  -- matrícula
  property_registry_office text, -- Cartório de Registro de Imóveis de...
  property_iptu_code   text,

  -- ── Preço e pagamento ──────────────────────────────────────────────────────
  price          numeric(14, 2) not null default 0,
  payment_terms  text,          -- como o preço é pago (à vista, entrada + parcelas...)

  -- ── Prazos e penalidades ───────────────────────────────────────────────────
  possession_date date,          -- quando a posse passa à compradora
  deed_days      integer,        -- prazo para a escritura pública, em dias
  penalty_percent numeric(6, 2), -- multa por descumprimento, % do preço

  forum_city text,
  signed_at  date,
  notes      text,               -- cláusulas adicionais

  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_property_sale_contracts_created
  on public.property_sale_contracts(created_at desc);

comment on table public.property_sale_contracts is
  'Contrato de compra e venda de imóvel em que a PRODUMAR é a compradora (migration 110).';

-- ============================================================================
-- ROW LEVEL SECURITY (igual às outras tabelas do módulo Aluguéis)
-- ============================================================================
alter table public.property_sale_contracts enable row level security;

drop policy if exists "property_sale_contracts_read"  on public.property_sale_contracts;
drop policy if exists "property_sale_contracts_write" on public.property_sale_contracts;

create policy "property_sale_contracts_read" on public.property_sale_contracts
  for select using (auth.uid() is not null);
create policy "property_sale_contracts_write" on public.property_sale_contracts
  for all
  using (public.user_can_write_module('alugueis'))
  with check (public.user_can_write_module('alugueis'));
