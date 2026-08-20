-- ============================================================================
-- ILNET Finance — Animais: o NÚMERO é por tipo de animal
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS da migration 047 (é ela que criou animals.species).
-- ============================================================================
-- Por que:
--   O número do animal (brinco) era único no rebanho INTEIRO: cadastrado o
--   boi 003, o porco 003 batia em "Já existe um animal com esse número". Só
--   que cada criação tem a sua numeração — o brinco do gado não conversa com
--   o do chiqueiro, e ninguém vai renumerar o rebanho por causa disso.
--
--   Agora o número é único DENTRO DO TIPO: pode existir o bovino 003, o suíno
--   003 e o caprino 003 ao mesmo tempo. Dois bovinos 003 continuam barrados,
--   que é o erro de digitação que a trava sempre serviu para pegar.
--
--   Quem já saiu do rebanho (vendido/morto) continua ocupando o número do seu
--   tipo — o histórico dele não pode ser confundido com o de um animal novo.
-- ============================================================================

-- ── Fora a trava antiga (número único no rebanho todo) ───────────────────────
-- A 041 criou como índice; a linha do constraint fica de rede de segurança
-- para bancos onde ele tenha virado constraint em algum momento.
alter table public.animals drop constraint if exists uq_animals_tag;
drop index if exists public.uq_animals_tag;

-- ── A trava nova: um número por tipo ─────────────────────────────────────────
create unique index if not exists uq_animals_species_tag
  on public.animals(species, tag);
