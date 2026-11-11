-- ============================================================================
-- PRODUMAR — ANIMAIS: lote do rebanho (separar os animais por lote)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 047 (tipo do animal) e 108. Uma execução só.
-- ============================================================================
-- Por que:
--
--   O dono quer separar o rebanho em lotes ("LOTE DA ENGORDA", "VACAS
--   PARIDAS", "PASTO DO RIO"...): dá o nome do lote, escolhe quais animais vão
--   para ele e fica guardado o dia em que cada animal entrou.
--
--   NÃO é o mesmo "lote" da migration 089. Aquele (`animal_lotes`) é o ciclo
--   do tanque de peixe e do galpão de ave, contado por quantidade. Este é para
--   bicho com brinco, um a um. Por isso as tabelas têm outro nome:
--
--   animal_grupos         → o lote (nome, tipo do animal, observação)
--   animal_grupo_animais  → quem está no lote e desde quando
--
--   Um animal fica em UM lote por vez. Passar para outro lote fecha a entrada
--   antiga (left_on = dia da mudança) e abre a nova — o histórico de por onde
--   o animal passou fica guardado.
--
-- Nada é apagado. Rodar de novo não quebra nada.
-- ============================================================================

-- ============================================================================
-- TABELA: animal_grupos (o lote)
-- ============================================================================
create table if not exists public.animal_grupos (
  id uuid primary key default uuid_generate_v4(),

  species text not null default 'bovino',
  name    text not null,

  -- lote desativado some da hora de escolher, mas o histórico dele fica
  active boolean not null default true,

  notes text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.animal_grupos drop constraint if exists animal_grupos_species_check;
alter table public.animal_grupos add constraint animal_grupos_species_check
  check (species in ('bovino', 'equino', 'caprino', 'ovino', 'suino'));

-- Dois "LOTE 01" do mesmo tipo viram confusão na hora de escolher.
create unique index if not exists uq_animal_grupos_nome
  on public.animal_grupos(species, name);

-- ============================================================================
-- TABELA: animal_grupo_animais (quem está no lote e desde quando)
-- ============================================================================
create table if not exists public.animal_grupo_animais (
  id uuid primary key default uuid_generate_v4(),

  grupo_id  uuid not null references public.animal_grupos(id) on delete cascade,
  animal_id uuid not null references public.animals(id) on delete cascade,

  -- o dia em que o animal entrou no lote
  joined_on date not null default current_date,
  -- o dia em que saiu (passou para outro lote ou foi tirado); null = está lá
  left_on   date,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.animal_grupo_animais drop constraint if exists animal_grupo_animais_datas_check;
alter table public.animal_grupo_animais add constraint animal_grupo_animais_datas_check
  check (left_on is null or left_on >= joined_on);

-- UM LOTE POR VEZ: o animal não pode estar em dois lotes ao mesmo tempo.
create unique index if not exists uq_animal_grupo_aberto
  on public.animal_grupo_animais(animal_id)
  where left_on is null;

create index if not exists idx_animal_grupo_animais_grupo
  on public.animal_grupo_animais(grupo_id);
create index if not exists idx_animal_grupo_animais_animal
  on public.animal_grupo_animais(animal_id);

-- ============================================================================
-- Permissões: todo mundo logado lê; quem escreve em Animais escreve aqui
-- ============================================================================
alter table public.animal_grupos        enable row level security;
alter table public.animal_grupo_animais enable row level security;

do $$
declare t text;
begin
  foreach t in array array['animal_grupos', 'animal_grupo_animais'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for select using (auth.uid() is not null)',
      t || '_read', t
    );
    execute format(
      'create policy %I on public.%I for all using (public.user_can_write_module(''animais'')) with check (public.user_can_write_module(''animais''))',
      t || '_write', t
    );
  end loop;
end $$;
