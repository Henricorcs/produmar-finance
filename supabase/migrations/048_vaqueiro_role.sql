-- ============================================================================
-- ILNET Finance — Perfil 'vaqueiro' (tela própria de nascimento de bezerro)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 041 a 047 (módulo Animais).
-- ============================================================================
-- Por que:
--   O vaqueiro é um usuário de baixíssima permissão, só de celular, que só
--   pode fazer UMA coisa: enviar um nascimento de bezerro (foto, data
--   automática, sexo, número do bezerro) para o patrão conferir. Ele NÃO
--   escolhe a mãe de uma lista — só digita a numeração dela de cabeça, no
--   curral. Quem casa esse número com o cadastro de verdade é o patrão, na
--   aba "Nascimentos" de Animais — só aí o bezerro entra no rebanho.
--
--   Por isso o vaqueiro continua sem user_can_write_module('animais')
--   (migration 039): esse helper libera INSERT/UPDATE/DELETE no módulo
--   inteiro, e ele não pode editar nem apagar nada do rebanho. A escrita dele
--   fica presa a UMA tabela isolada — animal_birth_requests — que não é o
--   rebanho de verdade, só uma fila de pedidos. Como ele nunca chega perto de
--   animals/animal_births, uma policy de INSERT comum já basta; não precisa
--   mais de função security definer para proteger a escrita (versão anterior
--   desta migration criava register_calf_birth() para isso — não é mais
--   necessário e a PARTE 2 abaixo já limpa essa função se ela chegou a
--   existir).
--
--   Leitura das fêmeas (para o patrão escolher a mãe de verdade) já funciona
--   sem mudar nada: "animals_read" (migration 041) já libera SELECT para
--   qualquer usuário autenticado.
-- ============================================================================

-- ============================================================================
-- PARTE 1: adicionar 'vaqueiro' ao enum user_role
-- IMPORTANTE: ALTER TYPE ... ADD VALUE precisa ser commitado antes de ser
-- usado na PARTE 2. Rode esta parte sozinha primeiro, depois rode a PARTE 2
-- em uma nova execução do SQL Editor.
-- ============================================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'vaqueiro';

-- ============================================================================
-- PARTE 2: solicitação de nascimento (o vaqueiro digita a mãe, o patrão confere)
-- Rode esta parte em uma SEGUNDA execução do SQL Editor, depois da PARTE 1.
-- ============================================================================

-- limpa a função da versão anterior desta migration, se chegou a rodar
-- (idempotente — seguro rodar mesmo que ela nunca tenha existido)
drop function if exists public.register_calf_birth(uuid, text, animal_sex, date, text, text);

create table if not exists public.animal_birth_requests (
  id uuid primary key default uuid_generate_v4(),

  mother_tag text       not null,   -- número da mãe do jeito que o vaqueiro digitou — não é FK
  calf_tag   text       not null,
  calf_sex   animal_sex not null,
  birth_date date       not null default current_date,

  photo_path text,                  -- foto do bezerro (bucket attachments)

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
-- Sem coluna de status: a linha existir já significa "pendente". O patrão
-- resolve apagando a linha — seja lançando de verdade (o bezerro entra no
-- rebanho e a solicitação some), seja descartando (envio errado/duplicado).
alter table public.animal_birth_requests enable row level security;

drop policy if exists "animal_birth_requests_read"   on public.animal_birth_requests;
drop policy if exists "animal_birth_requests_insert" on public.animal_birth_requests;
drop policy if exists "animal_birth_requests_delete" on public.animal_birth_requests;

-- leitura: qualquer logado (igual ao resto do módulo Animais)
create policy "animal_birth_requests_read" on public.animal_birth_requests
  for select using (auth.uid() is not null);

-- envio: só vaqueiro e admin — os dois únicos papéis que chegam em /vaqueiro
create policy "animal_birth_requests_insert" on public.animal_birth_requests
  for insert with check (public.current_user_role() in ('vaqueiro', 'admin'));

-- resolver (lançar ou descartar) pede o mesmo acesso de escrita do resto do
-- módulo Animais — quem já cadastra/edita o rebanho é quem decide o que fazer
-- com a solicitação. O vaqueiro não entra aqui: ele só envia, não decide.
create policy "animal_birth_requests_delete" on public.animal_birth_requests
  for delete using (public.user_can_write_module('animais'));
