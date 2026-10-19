-- ============================================================================
-- PRODUMAR — ALUGUÉIS: PROCURAÇÕES (titularidade da conta de energia)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE NOVO sem estragar nada.
-- ============================================================================
-- Por que:
--
--   Quando um imóvel muda de dono ou de inquilino, a conta de energia
--   (EQUATORIAL) precisa mudar de titular — e quem vai à loja é alguém da
--   PRODUMAR, com uma procuração do titular. Ela era feita no Word, copiando a
--   anterior; agora é preenchida na tela, uma pergunta por vez, como a compra
--   e venda, e sai impressa ou em PDF.
--
--   OUTORGANTE = quem dá a procuração (o titular da conta).
--   OUTORGADO  = quem recebe os poderes (quem vai resolver na concessionária).
--
-- Nada é apagado: entra uma tabela nova.
-- ============================================================================

begin;

create table if not exists public.power_of_attorneys (
  id uuid primary key default uuid_generate_v4(),

  -- ── Outorgante (quem dá a procuração) ─────────────────────────────────────
  grantor_name           text,
  grantor_gender         text check (grantor_gender in ('m', 'f')),
  grantor_nationality    text,
  grantor_marital_status text,
  grantor_profession     text,
  grantor_birthplace     text,   -- naturalidade
  grantor_rg             text,
  grantor_document       text,   -- CPF
  grantor_street         text,
  grantor_number         text,
  grantor_complement     text,
  grantor_district       text,
  grantor_city           text,
  grantor_zip            text,

  -- ── Outorgado (o procurador) ──────────────────────────────────────────────
  attorney_name           text,
  attorney_gender         text check (attorney_gender in ('m', 'f')),
  attorney_nationality    text,
  attorney_marital_status text,
  attorney_profession     text,
  attorney_rg             text,
  attorney_document       text,
  attorney_street         text,
  attorney_number         text,
  attorney_complement     text,
  attorney_district       text,
  attorney_city           text,
  attorney_zip            text,

  -- ── Os poderes ────────────────────────────────────────────────────────────
  company        text,   -- EQUATORIAL, CAEMA...
  service        text,   -- TRANSFERÊNCIA DE TITULARIDADE...
  account_number text,   -- a conta contrato (está na conta de energia)
  validity       text,   -- "até a conclusão do processo"

  city       text,       -- onde é assinada
  signed_at  date,
  notes      text,       -- poderes a mais

  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_power_of_attorneys_created
  on public.power_of_attorneys(created_at desc);

comment on table public.power_of_attorneys is
  'Procurações do módulo Aluguéis — ex.: troca de titularidade da conta de energia (migration 121).';

alter table public.power_of_attorneys enable row level security;

drop policy if exists "power_of_attorneys_read"  on public.power_of_attorneys;
drop policy if exists "power_of_attorneys_write" on public.power_of_attorneys;

create policy "power_of_attorneys_read" on public.power_of_attorneys
  for select using (auth.uid() is not null);
create policy "power_of_attorneys_write" on public.power_of_attorneys
  for all
  using (public.user_can_write_module('alugueis'))
  with check (public.user_can_write_module('alugueis'));

commit;

notify pgrst, 'reload schema';
