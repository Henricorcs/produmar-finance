-- ============================================================================
-- PRODUMAR — ALUGUÉIS: ANEXO DE MOBÍLIA (casa / kitnet mobiliada)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE NOVO sem estragar nada.
--
-- Rodar depois da 078 (tabela rental_contracts).
-- ============================================================================
-- Por que:
--
--   Imóvel alugado mobiliado leva, junto do contrato, o "ANEXO AO CONTRATO DE
--   LOCAÇÃO DO IMÓVEL": a lista dos móveis, eletrodomésticos e utensílios que
--   o locatário recebe, com o estado e o valor de cada um. Era feito no Word;
--   agora sai do contrato de aluguel já cadastrado (locador, locatário e
--   imóvel vêm sozinhos) e a lista de mobília pode ganhar ou perder itens.
--
--   A lista fica gravada aqui: o próximo anexo do mesmo imóvel já começa com
--   ela. Apagar o contrato apaga os anexos dele.
--
--   items = [{ "comodo": "SALA DE ESTAR/JANTAR", "nome": "Sofá",
--              "descricao": "02 lugares cinza", "estado": "MUITO BOM",
--              "valor": 700 }, ...]
-- ============================================================================

begin;

create table if not exists public.rental_furniture_annexes (
  id             uuid primary key default gen_random_uuid(),
  contract_id    uuid not null references public.rental_contracts(id) on delete cascade,
  property_label text,                         -- "KITNET", "CASA"... (sai no texto)
  items          jsonb not null default '[]'::jsonb,
  notes          text,                         -- observações gerais
  city           text,
  signed_at      date,

  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_rental_furniture_annexes_contract
  on public.rental_furniture_annexes(contract_id);
create index if not exists idx_rental_furniture_annexes_created
  on public.rental_furniture_annexes(created_at desc);

comment on table public.rental_furniture_annexes is
  'Anexo de mobília do contrato de aluguel — imóvel mobiliado (migration 151).';

alter table public.rental_furniture_annexes enable row level security;

drop policy if exists "rental_furniture_annexes_read"  on public.rental_furniture_annexes;
drop policy if exists "rental_furniture_annexes_write" on public.rental_furniture_annexes;

create policy "rental_furniture_annexes_read" on public.rental_furniture_annexes
  for select using (auth.uid() is not null);
create policy "rental_furniture_annexes_write" on public.rental_furniture_annexes
  for all
  using (public.user_can_write_module('alugueis'))
  with check (public.user_can_write_module('alugueis'));

commit;

notify pgrst, 'reload schema';
