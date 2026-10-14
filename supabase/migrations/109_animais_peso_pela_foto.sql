-- ============================================================================
-- PRODUMAR — ANIMAIS: PESO PELA FOTO (estimativa da IA × balança)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE NOVO sem estragar nada.
--
-- Rodar depois da 041 (animais) e da 046 (pesagens).
-- ============================================================================
-- Por que:
--
--   Na tela de Pesagem entrou o botão "Estimar pela foto": o celular fotografa
--   o animal e a IA devolve um peso aproximado (com uma faixa, ex.: 340 a
--   420 kg). Foto não tem escala nem profundidade, então isso é ESTIMATIVA —
--   e o peso do animal calcula a dose em ml dos protocolos.
--
--   Por isso a estimativa NÃO vai para animal_weights (nem mexe em
--   animals.weight): fica nesta tabela à parte. Quando a foto é tirada no dia
--   da balança, o peso real fica na mesma linha (`real_kg`) e a tela mostra
--   quanto a foto erra no rebanho de verdade — e se ela erra menos do que
--   simplesmente repetir o último peso (`ultimo_peso_kg`).
--
-- Nada é apagado: entra uma tabela nova.
-- ============================================================================

create table if not exists public.animal_pesos_foto (
  id uuid primary key default uuid_generate_v4(),

  animal_id uuid not null references public.animals(id) on delete cascade,
  taken_at  date not null default current_date,

  -- o que a IA disse
  estimado_kg numeric(10, 2) not null,
  min_kg      numeric(10, 2),
  max_kg      numeric(10, 2),
  confianca   text check (confianca in ('baixa', 'media', 'alta')),
  observacao  text,
  modelo      text,

  -- última pesagem de balança que o sistema conhecia na hora da foto: é a
  -- régua "e se eu só repetisse o último peso?"
  ultimo_peso_kg numeric(10, 2),

  -- peso da balança no mesmo dia (null = foi só estimativa, sem balança)
  real_kg numeric(10, 2),

  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_animal_pesos_foto_animal
  on public.animal_pesos_foto(animal_id, created_at desc);

comment on table public.animal_pesos_foto is
  'Peso estimado pela IA a partir de foto (migration 109). Não é pesagem: não calcula dose. real_kg = balança no mesmo dia, para medir o erro.';

-- ============================================================================
-- ROW LEVEL SECURITY (igual às outras tabelas do módulo)
-- ============================================================================
alter table public.animal_pesos_foto enable row level security;

drop policy if exists "animal_pesos_foto_read"  on public.animal_pesos_foto;
drop policy if exists "animal_pesos_foto_write" on public.animal_pesos_foto;

create policy "animal_pesos_foto_read" on public.animal_pesos_foto
  for select using (auth.uid() is not null);
create policy "animal_pesos_foto_write" on public.animal_pesos_foto
  for all
  using (public.user_can_write_module('animais'))
  with check (public.user_can_write_module('animais'));
