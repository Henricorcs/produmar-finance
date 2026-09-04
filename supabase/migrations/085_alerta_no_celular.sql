-- ============================================================================
-- PRODUMAR — O CELULAR DO FUNCIONÁRIO APITA QUANDO CHEGA OS PRA ELE
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE UMA VEZ SÓ, e pode rodar de novo.
--
-- Rodar depois da 023 (assigned_to, o dono da OS).
-- ============================================================================
-- Por que:
--
--   Hoje a OS chega calada. O escritório lança, e o funcionário só descobre
--   quando abre o app por conta própria — ou quando alguém liga pra avisar que
--   tem OS esperando. Na prática o telefonema é o alerta, e é ele que a gente
--   quer aposentar.
--
--   Para o celular apitar sozinho, o navegador precisa ter uma "inscrição" de
--   avisos guardada: um endereço só daquele aparelho, mais duas chaves que
--   embaralham a mensagem no caminho. É isso que esta tabela guarda.
--
-- ============================================================================
-- UM APARELHO, UMA LINHA
-- ============================================================================
--   A mesma pessoa pode ter o app no celular e no tablet, e cada um recebe seu
--   aviso — por isso a linha é do APARELHO, não da pessoa. O endpoint é único:
--   se o mesmo aparelho se inscrever de novo (o navegador troca a inscrição de
--   tempos em tempos), a linha é atualizada em vez de duplicar.
--
--   Quem apaga o app, limpa os dados ou revoga a permissão deixa uma inscrição
--   morta para trás. O servidor descobre isso na primeira tentativa de envio
--   (o navegador responde 404/410) e apaga a linha sozinho — não precisa de
--   faxina manual.
--
-- ============================================================================
-- O QUE NÃO ENTRA AQUI
-- ============================================================================
--   Nenhum dado de OS, de obra ou de material. A tabela guarda só o endereço
--   do aparelho e as chaves. O texto do aviso é montado na hora do envio e não
--   fica gravado em lugar nenhum.
-- ============================================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default uuid_generate_v4(),

  user_id uuid not null references auth.users(id) on delete cascade,

  -- o endereço que o navegador dá a ESTE aparelho
  endpoint text not null unique,
  -- as duas chaves que embaralham a mensagem até o aparelho
  p256dh text not null,
  auth   text not null,

  -- só para o dono saber qual aparelho é qual, quando tiver mais de um
  user_agent text,

  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- Cada um cuida das inscrições do próprio login: cria, vê e apaga as suas.
-- Quem ENVIA o aviso é o servidor, com a chave de serviço, que passa por cima
-- da RLS — então ninguém precisa enxergar a inscrição de outro para ser
-- avisado.
drop policy if exists "push_subscriptions_own" on public.push_subscriptions;
create policy "push_subscriptions_own" on public.push_subscriptions
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.push_subscriptions is
  'Aparelhos inscritos para receber aviso de OS nova. Uma linha por aparelho; inscrição morta é apagada sozinha no primeiro envio que falhar (migration 085).';
