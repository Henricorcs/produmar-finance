-- ============================================================================
-- PRODUMAR — ALUGUÉIS: o boleto avulso (entrada, caução...)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Por que:
--
--   A entrada ou o caução do contrato às vezes não dá para imprimir na data
--   do contrato. O boleto avulso é gerado depois, separado do carnê das
--   mensalidades: tem valor, vencimento e descrição próprios ("ENTRADA",
--   "CAUÇÃO" ou o que for), nasce só no sistema ou já no banco (Cora), e
--   aparece junto dos boletos do contrato marcado como AVULSO.
--
--   Ele NÃO é mês do aluguel: não ocupa a vaga do mês (a regra de um boleto
--   valendo por mês passa a olhar só os do carnê) e, quando é pago no banco,
--   fica PAGO no próprio boleto, sem dar baixa em mês nenhum.
--
--   O competencia do avulso guarda só o mês do vencimento (a coluna é
--   obrigatória); quem manda nele é a descrição.
--
-- Nada é apagado. Rodar de novo não quebra.
-- ============================================================================

alter table public.rental_boletos add column if not exists avulso boolean not null default false;
alter table public.rental_boletos add column if not exists descricao text;

-- um boleto valendo por mês — agora só os do carnê; os avulsos ficam de fora
drop index if exists public.uq_rental_boletos_mes;
create unique index if not exists uq_rental_boletos_mes
  on public.rental_boletos(contract_id, competencia)
  where cora_status <> 'CANCELLED' and not avulso;

comment on column public.rental_boletos.avulso is
  'true = boleto avulso (entrada, caução...), fora do carnê das mensalidades e sem baixa de mês.';
comment on column public.rental_boletos.descricao is
  'O que o boleto avulso cobra ("ENTRADA", "CAUÇÃO"...). Null nos boletos do mês.';
