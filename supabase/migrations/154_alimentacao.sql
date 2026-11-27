-- ============================================================================
-- PRODUMAR — ALIMENTAÇÃO: quem comeu o bandeco em cada dia
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Por que:
--
--   A empresa dá a comida (o bandeco) para quem trabalha, e quer saber quantas
--   refeições saíram no mês para medir quanto custa essa despesa.
--
--   A lista de quem come é À PARTE do cadastro de Colaboradores (diaristas):
--   de vez em quando alguém que veio fazer uma diária só, ou outro serviço,
--   também come — e não deve virar colaborador por causa disso. Então são
--   duas tabelas novas:
--     alimentacao_pessoas   → a lista de quem come (só o nome e um recado)
--     alimentacao_refeicoes → uma linha por pessoa por dia em que ela comeu
--
--   A unique (pessoa_id, data) garante que o mesmo dia não conta duas vezes,
--   nem se duas pessoas marcarem ao mesmo tempo.
--
-- Nada é apagado: entram duas tabelas. Rodar de novo não quebra.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Quem come
-- ----------------------------------------------------------------------------
create table if not exists public.alimentacao_pessoas (
  id uuid primary key default uuid_generate_v4(),
  nome text not null check (length(trim(nome)) > 0),
  -- quem é, o que veio fazer: "diária na cerca", "motorista da carreta"...
  observacao text,
  -- arquivado sai da lista do dia, mas o que comeu continua na conta do mês
  ativo boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_alimentacao_pessoas_nome
  on public.alimentacao_pessoas (nome);

comment on table public.alimentacao_pessoas is
  'Lista de quem come o bandeco — à parte do cadastro de Colaboradores (migration 154).';

-- ----------------------------------------------------------------------------
-- Cada refeição: a pessoa comeu naquele dia
-- ----------------------------------------------------------------------------
create table if not exists public.alimentacao_refeicoes (
  id uuid primary key default uuid_generate_v4(),
  pessoa_id uuid not null references public.alimentacao_pessoas(id) on delete cascade,
  data date not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint alimentacao_refeicoes_um_por_dia unique (pessoa_id, data)
);

create index if not exists idx_alimentacao_refeicoes_data
  on public.alimentacao_refeicoes (data);

comment on table public.alimentacao_refeicoes is
  'Uma linha por pessoa por dia em que ela comeu o bandeco; a contagem do mês mede o custo da alimentação (migration 154).';

-- ============================================================================
-- ROW LEVEL SECURITY — lê quem está logado; grava quem tem o módulo
-- Colaboradores (slug 'diaristas', o mesmo dos diaristas — ver a 060)
-- ============================================================================
alter table public.alimentacao_pessoas enable row level security;
alter table public.alimentacao_refeicoes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'alimentacao_pessoas' and policyname = 'alimentacao_pessoas_read') then
    create policy "alimentacao_pessoas_read" on public.alimentacao_pessoas
      for select using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'alimentacao_pessoas' and policyname = 'alimentacao_pessoas_write') then
    create policy "alimentacao_pessoas_write" on public.alimentacao_pessoas
      for all
      using (public.user_can_write_module('diaristas'))
      with check (public.user_can_write_module('diaristas'));
  end if;

  if not exists (select 1 from pg_policies where tablename = 'alimentacao_refeicoes' and policyname = 'alimentacao_refeicoes_read') then
    create policy "alimentacao_refeicoes_read" on public.alimentacao_refeicoes
      for select using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'alimentacao_refeicoes' and policyname = 'alimentacao_refeicoes_write') then
    create policy "alimentacao_refeicoes_write" on public.alimentacao_refeicoes
      for all
      using (public.user_can_write_module('diaristas'))
      with check (public.user_can_write_module('diaristas'));
  end if;
end $$;

-- ============================================================================
-- DEPOIS DE RODAR
-- ============================================================================
--   Aparece a aba "Alimentação" dentro de Colaboradores. Admin e financeiro já
--   marcam; operador e encarregado precisam do módulo "Colaboradores" marcado
--   em Configurações → Usuários; o visualizador só olha.
-- ============================================================================
