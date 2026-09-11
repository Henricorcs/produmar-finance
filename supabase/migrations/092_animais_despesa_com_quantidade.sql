-- ============================================================================
-- PRODUMAR — A DESPESA DE ANIMAIS PASSA A GUARDAR A CONTA, NÃO SÓ O TOTAL
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE UMA VEZ SÓ, e pode rodar de novo.
--
-- Rodar depois da 072 (a tabela da despesa).
-- ============================================================================
-- Por que:
--
--   A despesa só tinha "o que foi" e o valor. Quem lançava escrevia
--   "20 SACOS DE RAÇÃO" no meio do texto e R$ 1.900,00 no valor — e um mês
--   depois ninguém sabe se o saco saiu por 95 ou por 80, nem dá para comparar
--   a compra deste mês com a do mês passado.
--
--   Agora o produto é o produto ("RAÇÃO ENGORDA"), e a conta fica em pé:
--   QUANTIDADE × VALOR UNITÁRIO, na UNIDADE de medida que foi comprada
--   (saco, quilo, litro, milheiro). O `amount` continua sendo o total — é ele
--   que a ficha soma, e nada do que já está lançado muda de valor.
--
--   Os três campos são opcionais de propósito: o frete e a mão de obra não têm
--   quantidade nenhuma, e exigir isso deles só atrapalharia quem lança.
-- ============================================================================

alter table public.animal_despesas
  add column if not exists quantity   numeric(12, 3) not null default 0,
  add column if not exists unit       text,
  add column if not exists unit_price numeric(12, 2) not null default 0;

-- Não existe quantidade negativa nem preço negativo. Idempotente.
alter table public.animal_despesas drop constraint if exists animal_despesas_quantity_check;
alter table public.animal_despesas
  add constraint animal_despesas_quantity_check check (quantity >= 0);

alter table public.animal_despesas drop constraint if exists animal_despesas_unit_price_check;
alter table public.animal_despesas
  add constraint animal_despesas_unit_price_check check (unit_price >= 0);

comment on column public.animal_despesas.quantity is
  'Quanto foi comprado — 20 sacos, 300 kg, 2 milheiros (migration 092). Zero quando o gasto não tem quantidade (frete, mão de obra).';
comment on column public.animal_despesas.unit is
  'A unidade de medida da compra: SC, KG, L, UN... (migration 092).';
comment on column public.animal_despesas.unit_price is
  'Quanto custou CADA unidade (migration 092). O total continua em amount — é ele que a ficha soma.';
