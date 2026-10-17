-- ============================================================================
-- PRODUMAR — ALUGUÉIS: ENDEREÇO DO INQUILINO E DO FIADOR EM PARTES
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE NOVO sem estragar nada.
--
-- Rodar depois da 078 (aluguéis).
-- ============================================================================
-- Por que:
--
--   O contrato de aluguel passou a ser preenchido um campo por vez, como o de
--   compra e venda (112). O endereço de onde o inquilino mora — e o do fiador —
--   era um campo corrido; agora é perguntado em partes (rua, número,
--   complemento, bairro, cidade/UF, CEP) e o contrato monta a frase sozinho.
--
--   As colunas antigas (tenant_address, guarantor_address) ficam: contrato já
--   salvo continua saindo com o endereço que tinha.
--
--   A view v_rental_contracts é recriada porque ela usa "c.*": no Postgres o
--   asterisco é congelado quando a view nasce, e as colunas novas não
--   apareceriam nela.
--
-- Nada é apagado: entram colunas novas e a view é refeita igual, com elas.
-- ============================================================================

begin;

alter table public.rental_contracts
  add column if not exists tenant_street     text,
  add column if not exists tenant_number     text,
  add column if not exists tenant_complement text,
  add column if not exists tenant_district   text,
  add column if not exists tenant_city       text,
  add column if not exists tenant_zip        text,

  add column if not exists guarantor_street     text,
  add column if not exists guarantor_number     text,
  add column if not exists guarantor_complement text,
  add column if not exists guarantor_district   text,
  add column if not exists guarantor_city       text,
  add column if not exists guarantor_zip        text;

drop view if exists public.v_rental_contracts;
create view public.v_rental_contracts
with (security_invoker = on) as
select
  c.*,
  p.code                as property_code,
  p.name                as property_name,
  p.kind                as property_kind,
  p.street              as property_street,
  p.number              as property_number,
  p.complement          as property_complement,
  p.district            as property_district,
  p.city                as property_city,
  p.state               as property_state,
  p.zip                 as property_zip,
  p.registration        as property_registration,
  p.iptu_code           as property_iptu_code,
  p.water_code          as property_water_code,
  p.power_code          as property_power_code,
  p.active              as property_active,
  coalesce(r.pagos, 0)       as meses_pagos,
  coalesce(r.recebido, 0)    as total_recebido,
  r.ultimo_pagamento
from public.rental_contracts c
join public.rental_properties p on p.id = c.property_id
left join lateral (
  select
    count(*) filter (where x.paid_at is not null)::int as pagos,
    coalesce(sum(x.paid_amount), 0)                    as recebido,
    max(x.paid_at)                                     as ultimo_pagamento
  from public.rental_payments x
  where x.contract_id = c.id
) r on true;

grant select on public.v_rental_contracts to authenticated;

commit;

notify pgrst, 'reload schema';
