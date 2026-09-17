-- ============================================================================
-- PRODUMAR — COLABORADORES: cada ENCARREGADO DE OBRA vê só a turma dele
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE UMA VEZ SÓ.
-- Rodar DEPOIS das migrations 059 e 060.
-- ============================================================================
-- Por que:
--
--   O TÉCNICO mudou de nome na tela: agora é ENCARREGADO DE OBRA. No banco o
--   papel continua 'tecnico' — só o nome que aparece mudou. (O 'encarregado'
--   da 079, o da frota, é outro papel e segue igual.)
--
--   Na aba Colaborador da tela dele aparecia TODO colaborador ativo da
--   empresa. Quem tem duas ou três turmas em obras diferentes via a lista
--   inteira e podia marcar dia para gente que não é dele.
--
--   Agora o chefe diz, em Colaboradores (o botão ao lado de cada pessoa),
--   quais encarregados de obra cuidam dela. O encarregado só VÊ — e só LANÇA
--   dia para — quem foi liberado para ele.
--
--   Um colaborador pode ficar com mais de um encarregado (duas turmas na mesma
--   obra), e um encarregado cuida de vários colaboradores: por isso é uma
--   tabela de ligação, e não uma coluna no cadastro.
--
-- ATENÇÃO: logo depois de rodar, NINGUÉM está liberado para ninguém — a aba
-- Colaborador do encarregado de obra fica vazia até o chefe marcar as pessoas
-- em Colaboradores.
--
-- Nada é apagado: entra uma tabela e a policy de lançar dia é refeita. Rodar
-- de novo não quebra.
-- ============================================================================

-- ============================================================================
-- 1) A LIGAÇÃO: colaborador × encarregado de obra
-- ============================================================================
create table if not exists public.diarista_tecnicos (
  diarista_id uuid not null references public.diaristas(id) on delete cascade,
  -- o usuário com o papel 'tecnico' (na tela: Encarregado de obra)
  tecnico_id  uuid not null references public.profiles(id)  on delete cascade,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  primary key (diarista_id, tecnico_id)
);

-- a tela do encarregado busca pelo lado dele: "quem é da minha turma"
create index if not exists idx_diarista_tecnicos_tecnico
  on public.diarista_tecnicos(tecnico_id);

comment on table public.diarista_tecnicos is
  'Quais encarregados de obra (papel tecnico) podem ver e lancar dia para cada colaborador.';

-- ============================================================================
-- 2) ROW LEVEL SECURITY
-- ============================================================================
-- Ler: todo logado (é o que a tela do encarregado usa para montar a lista).
-- Liberar e tirar: quem manda no cadastro de colaboradores — a mesma regra da
-- policy diaristas_write (060).
-- ============================================================================
alter table public.diarista_tecnicos enable row level security;

drop policy if exists "diarista_tecnicos_read"  on public.diarista_tecnicos;
drop policy if exists "diarista_tecnicos_write" on public.diarista_tecnicos;

create policy "diarista_tecnicos_read" on public.diarista_tecnicos
  for select using (auth.uid() is not null);

create policy "diarista_tecnicos_write" on public.diarista_tecnicos
  for all
  using (
    public.user_can_write_module('diaristas')
    or public.user_can_write_module('estoque')
  )
  with check (
    public.user_can_write_module('diaristas')
    or public.user_can_write_module('estoque')
  );

-- ============================================================================
-- 3) LANÇAR DIA: o encarregado de obra só para quem é da turma dele
-- ============================================================================
-- Antes (060) o papel 'tecnico' lançava dia para qualquer colaborador. A trava
-- de verdade fica aqui, e não só na tela: esconder a pessoa da lista não
-- impede ninguém de mandar o lançamento na mão.
--
-- Admin e quem manda no módulo seguem lançando para todo mundo. Apagar não
-- muda (060): o encarregado continua apagando o dia que ele mesmo marcou.
--
-- O ::text é o mesmo de sempre: compara o papel como texto e a policy não
-- depende de o valor existir no enum.
-- ============================================================================
drop policy if exists "diarista_dias_insert" on public.diarista_dias;
create policy "diarista_dias_insert" on public.diarista_dias
  for insert with check (
    public.current_user_role()::text = 'admin'
    or public.user_can_write_module('diaristas')
    or public.user_can_write_module('estoque')
    or (
      public.current_user_role()::text = 'tecnico'
      and exists (
        select 1
        from public.diarista_tecnicos t
        where t.diarista_id = diarista_dias.diarista_id
          and t.tecnico_id  = auth.uid()
      )
    )
  );
