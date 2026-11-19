-- ============================================================================
-- PRODUMAR — Devedores: CHECKLIST DE ENTREGA DE VEÍCULO
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE NOVO sem estragar nada.
--
-- Rodar depois da 006 (tabela loans).
-- ============================================================================
-- Por que:
--
--   O dono vende veículo e, na entrega, imprime um checklist para o comprador
--   assinar: documento, chave reserva, estepe, macaco, pneus, lataria... Agora
--   o checklist nasce em Devedores — o comprador pode vir da lista de
--   devedores (puxa nome, CPF, RG e endereço) ou ser digitado à mão — e fica
--   gravado aqui para imprimir de novo quando precisar.
--
--   Os itens (Sim/Não e observação) são marcados à caneta na hora da entrega:
--   a tabela guarda só quem recebe, o veículo, o lugar e o dia.
--
--   Os dados do comprador são COPIADOS no momento: mudar o cadastro do devedor
--   depois não mexe num checklist já assinado. Apagar a dívida não apaga o
--   checklist (loan_id fica vazio).
-- ============================================================================

create table if not exists public.vehicle_delivery_checklists (
  id               uuid primary key default gen_random_uuid(),
  loan_id          uuid references public.loans(id) on delete set null,
  buyer_name       text not null,
  buyer_document   text,
  buyer_rg         text,
  buyer_address    text,
  buyer_phone      text,
  vehicle_model    text,
  vehicle_plate    text,
  vehicle_year     text,
  vehicle_color    text,
  vehicle_chassis  text,
  vehicle_renavam  text,
  vehicle_km       text,
  delivery_place   text,
  delivery_date    date not null default current_date,
  notes            text,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_vehicle_delivery_checklists_date
  on public.vehicle_delivery_checklists(delivery_date desc, created_at desc);
create index if not exists idx_vehicle_delivery_checklists_loan
  on public.vehicle_delivery_checklists(loan_id);

drop trigger if exists set_vehicle_delivery_checklists_updated_at on public.vehicle_delivery_checklists;
create trigger set_vehicle_delivery_checklists_updated_at
  before update on public.vehicle_delivery_checklists
  for each row execute function public.set_updated_at();

-- Mesmas regras de Devedores: lê quem está logado, escreve admin e financeiro.
alter table public.vehicle_delivery_checklists enable row level security;

drop policy if exists "vehicle_delivery_checklists_read" on public.vehicle_delivery_checklists;
create policy "vehicle_delivery_checklists_read" on public.vehicle_delivery_checklists
  for select using (auth.uid() is not null);

drop policy if exists "vehicle_delivery_checklists_write" on public.vehicle_delivery_checklists;
create policy "vehicle_delivery_checklists_write" on public.vehicle_delivery_checklists
  for all using (public.current_user_role() in ('admin', 'financeiro'));

comment on table public.vehicle_delivery_checklists is
  'Checklist de entrega de veículo vendido, impresso para o comprador assinar (150). Comprador copiado do devedor ou digitado.';

-- ============================================================================
-- DEPOIS DE RODAR — conferir:
--   select count(*) from public.vehicle_delivery_checklists;
-- ============================================================================
