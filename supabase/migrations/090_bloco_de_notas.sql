-- ============================================================================
-- PRODUMAR — O BLOCO DE NOTAS DE CADA UM
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE UMA VEZ SÓ, e pode rodar de novo.
--
-- Não depende de nenhuma migration anterior.
-- ============================================================================
-- Por que:
--
--   O papelzinho ao lado do teclado. "Ligar pro Bernardino", "levar a nota do
--   posto", "conferir a ração do tanque 3" — recado que não é lançamento, não
--   é OS e não é conta a pagar, mas se não ficar anotado some.
--
--   Fica no topo de toda tela, ao lado do sino: abre, escreve, fecha. Uma
--   linha é uma tarefa, e o sistema põe o pontinho na frente.
--
-- ============================================================================
-- O BLOCO É DA PESSOA, NÃO DA EMPRESA
-- ============================================================================
--   Uma linha por login (o user_id é a própria chave), e a RLS prende cada um
--   ao seu: ninguém lê nem escreve no bloco do outro — nem o admin. O que o
--   encarregado anota não aparece para o escritório, e vice-versa.
--
--   Por isso também não há histórico nem lixeira: o texto é um só, e cada
--   gravação substitui o anterior. É um papel de rascunho, não um documento.
-- ============================================================================

create table if not exists public.user_notes (
  -- o dono É a chave: um bloco por login, nem dois nem nenhum
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- o papel inteiro, do jeito que a pessoa escreveu (uma tarefa por linha)
  content text not null default '',

  updated_at timestamptz not null default now()
);

alter table public.user_notes enable row level security;

-- Cada um só enxerga e só mexe no próprio bloco.
drop policy if exists "user_notes_own" on public.user_notes;
create policy "user_notes_own" on public.user_notes
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.user_notes is
  'Bloco de notas pessoal, um por login. Texto livre, uma tarefa por linha. Privado: a RLS não deixa ninguém ler o bloco de outro (migration 090).';

-- ============================================================================
-- DEPOIS DE RODAR
-- ============================================================================
--   Nada a configurar. O botão amarelo aparece no topo da tela para todo mundo
--   que entra no sistema, em qualquer módulo.
-- ============================================================================
