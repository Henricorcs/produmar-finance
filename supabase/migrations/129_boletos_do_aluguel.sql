-- ============================================================================
-- PRODUMAR — ALUGUÉIS: os boletos do contrato (Cora)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Por que:
--
--   Fechado o contrato, o inquilino recebe os boletos do aluguel de cada mês.
--   O sistema emite esses boletos na Cora (com Pix junto), um por mês do
--   contrato, com a multa e os juros do atraso, e guarda aqui o que a Cora
--   devolveu: a linha digitável, o código de barras, o PDF e o Pix copia e
--   cola. É daqui que sai o carnê impresso para entregar ao inquilino.
--
--   Quando o inquilino paga, a Cora avisa (webhook) e a baixa do mês em
--   rental_payments é feita sozinha.
--
--   Um mês, um contrato, um boleto valendo. O cancelado fica de história, e o
--   mês pode ganhar outro boleto (por exemplo, depois de mudar o valor).
--
-- Nada é apagado: entra uma tabela. Rodar de novo não quebra.
-- ============================================================================

create table if not exists public.rental_boletos (
  id uuid primary key default uuid_generate_v4(),

  contract_id uuid not null references public.rental_contracts(id) on delete cascade,

  -- o mês de referência, sempre no dia 1 (o mesmo de rental_payments)
  competencia date not null,
  due_date    date not null,
  amount      numeric(12, 2) not null check (amount > 0),

  -- o que a Cora devolveu
  cora_invoice_id text not null unique,
  -- OPEN / LATE / IN_PAYMENT / PAID / CANCELLED (o status bruto da Cora)
  cora_status    text not null default 'OPEN',
  digitable_line text,
  barcode        text,
  pdf_url        text,
  our_number     text,
  pix_emv        text,

  -- preenchidos quando a Cora avisa que foi pago
  paid_at     date,
  paid_amount numeric(12, 2),

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- só um boleto valendo por mês: o cancelado não conta
create unique index if not exists uq_rental_boletos_mes
  on public.rental_boletos(contract_id, competencia)
  where cora_status <> 'CANCELLED';

create index if not exists idx_rental_boletos_contract
  on public.rental_boletos(contract_id, due_date);

comment on table public.rental_boletos is
  'Boletos do aluguel emitidos na Cora, um por mês do contrato.';

-- ============================================================================
-- ROW LEVEL SECURITY — como o resto do módulo Aluguéis
-- ============================================================================
alter table public.rental_boletos enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'rental_boletos' and policyname = 'rental_boletos_read') then
    create policy "rental_boletos_read" on public.rental_boletos
      for select using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'rental_boletos' and policyname = 'rental_boletos_write') then
    create policy "rental_boletos_write" on public.rental_boletos
      for all
      using (public.user_can_write_module('alugueis'))
      with check (public.user_can_write_module('alugueis'));
  end if;
end $$;
