-- ============================================================================
-- PRODUMAR — O VAQUEIRO DIZ QUE BICHO NASCEU (não é tudo bezerro)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE UMA VEZ SÓ, e pode rodar de novo.
--
-- Rodar depois da 047 (tipo do animal) e da 048 (perfil vaqueiro).
-- ============================================================================
-- Por que:
--
--   A tela do vaqueiro nasceu só para o gado, e ficou assim: o cordeiro que a
--   ovelha pariu chegava no celular do patrão escrito "Bezerro fêmea", e o
--   cabrito também, e o potro também. Quem está conferindo a fila não tem como
--   saber que bicho é aquele da foto — e a fila é justamente o lugar onde ele
--   precisa achar a mãe certa no rebanho.
--
--   Agora o vaqueiro marca o TIPO junto com o sexo, e o nome acompanha em toda
--   a viagem: cordeiro, cabrito, potro, leitão, bezerro.
--
--   Quem nasceu antes desta migration continua bovino — é o default da coluna,
--   e é o que esses envios sempre foram na prática.
--
--   O tipo que vale no cadastro continua sendo o da MÃE: na hora de lançar no
--   rebanho a cria puxa tipo e raça de quem pariu (createBirth). O que o
--   vaqueiro marca aqui é o recado dele para o patrão — serve para dar nome à
--   fila e para avisar quando a mãe escolhida é de outro bicho.
-- ============================================================================

alter table public.animal_birth_requests
  add column if not exists species animal_species not null default 'bovino';

comment on column public.animal_birth_requests.species is
  'Que bicho nasceu, do jeito que o vaqueiro marcou no celular (migration 091). Dá nome à fila — bezerro, potro, cabrito, cordeiro, leitão. O tipo que entra no cadastro é o da mãe escolhida pelo patrão.';
