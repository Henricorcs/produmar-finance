-- ============================================================================
-- PRODUMAR — ANIMAIS: o PROTOCOLO DO NASCIMENTO na tela do vaqueiro
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE UMA VEZ SÓ, e pode rodar de novo.
--
-- Rodar depois da 041 (animais), da 048 (vaqueiro) e da 091 (tipo do bicho
-- no nascimento).
-- ============================================================================
-- Por que:
--
--   A cria tem que tomar os medicamentos NA HORA em que nasce — é ali, com o
--   bicho na mão, que o vaqueiro está. Depois, no rebanho, ninguém lembra de
--   voltar só para isso.
--
--   Quem decide o que se aplica é o dono: ele monta o PROTOCOLO de cada tipo de
--   bicho na tela de Animais (o bezerro toma uma coisa, o leitão outra). O
--   celular do vaqueiro mostra essa lista no ato de informar o nascimento, e
--   ele só consegue salvar depois de marcar cada item como aplicado.
--
--   O que ele marcou vai junto com o nascimento, como uma FOTOGRAFIA do
--   protocolo daquele momento — se o dono mudar a lista amanhã, o registro de
--   hoje continua dizendo o que foi dado hoje. Na conferência, quando o patrão
--   lança a cria no rebanho, cada item vira um tratamento na ficha dela.
--
-- Nada é apagado: entram uma tabela e uma coluna.
-- ============================================================================

-- ── 1) O protocolo: o que cada tipo de bicho toma ao nascer ─────────────────
create table if not exists public.animal_protocolo_nascimento (
  id uuid primary key default uuid_generate_v4(),

  species    animal_species not null,  -- bovino, equino, caprino, ovino, suíno
  medicine   text not null,            -- ex.: IODO NO UMBIGO, VERMÍFUGO, FERRO
  dose       text,                     -- ex.: 2 ML, UMA APLICAÇÃO
  sort_order integer not null default 0,

  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_animal_protocolo_nascimento_species
  on public.animal_protocolo_nascimento(species, sort_order);

comment on table public.animal_protocolo_nascimento is
  'O que a cria de cada tipo de bicho toma ao nascer. O dono monta na tela de Animais; o vaqueiro marca cada item como aplicado ao informar o nascimento (migration 095).';

-- Leitura: qualquer logado — o vaqueiro precisa ler para ver a lista.
-- Escrita: quem manda no módulo Animais, como o resto do rebanho.
alter table public.animal_protocolo_nascimento enable row level security;

drop policy if exists "animal_protocolo_nascimento_read"  on public.animal_protocolo_nascimento;
drop policy if exists "animal_protocolo_nascimento_write" on public.animal_protocolo_nascimento;

create policy "animal_protocolo_nascimento_read" on public.animal_protocolo_nascimento
  for select using (auth.uid() is not null);

create policy "animal_protocolo_nascimento_write" on public.animal_protocolo_nascimento
  for all
  using (public.user_can_write_module('animais'))
  with check (public.user_can_write_module('animais'));

-- ── 2) O que o vaqueiro aplicou, junto com o nascimento ─────────────────────
-- Lista de { "medicine": "...", "dose": "..." } — a fotografia do protocolo no
-- momento em que ele marcou. Nulo no que foi enviado antes desta migration.
alter table public.animal_birth_requests
  add column if not exists protocolo_aplicado jsonb;

comment on column public.animal_birth_requests.protocolo_aplicado is
  'Os medicamentos do protocolo do nascimento que o vaqueiro marcou como aplicados, como estavam na hora (migration 095). Viram tratamentos da cria quando o patrão lança no rebanho.';
