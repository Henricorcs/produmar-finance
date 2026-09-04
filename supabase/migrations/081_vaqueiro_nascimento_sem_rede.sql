-- ============================================================================
-- PRODUMAR — O NASCIMENTO NÃO ENTRA DUAS VEZES QUANDO A REDE OSCILA
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE UMA VEZ SÓ, e pode rodar de novo.
--
-- Rodar depois da 048 (perfil vaqueiro) e da 053 (bezerro sem número).
-- ============================================================================
-- Por que:
--
--   A vaca pare no mato, e no mato não tem sinal. Agora o celular do vaqueiro
--   GUARDA o nascimento e sobe sozinho quando o sinal volta — mas isso abre um
--   buraco que não existia antes: a resposta do servidor pode se perder no
--   caminho de volta.
--
--   O celular manda, o banco grava, e a barra cai antes de a confirmação
--   chegar. Do lado de lá parece que não foi. Na próxima tentativa ele manda o
--   MESMO bezerro de novo — e o patrão vê dois nascimentos da mesma mãe, com a
--   mesma foto, sem ter como saber qual é o de verdade.
--
--   A solução é o celular carimbar cada nascimento com um número só dele antes
--   de tentar enviar. É esse número que chega aqui como client_id. Se o mesmo
--   carimbo bater na porta duas vezes, o banco recusa o segundo — e o sistema
--   trata essa recusa como "já está gravado, pode tirar da fila", que é
--   exatamente o que aconteceu.
--
--   Fica NULO no que veio antes desta migration e em quem envia pela tela
--   comum: o índice único do Postgres deixa vários nulos conviverem, então
--   nada do que já está lá precisa mudar.
-- ============================================================================

alter table public.animal_birth_requests
  add column if not exists client_id uuid;

comment on column public.animal_birth_requests.client_id is
  'Carimbo que o celular do vaqueiro dá ao nascimento antes de enviar. Impede o mesmo bezerro de entrar duas vezes quando a rede cai depois de gravar (migration 081).';

-- Um carimbo, um nascimento. Nulos não brigam entre si.
create unique index if not exists animal_birth_requests_client_id_key
  on public.animal_birth_requests (client_id)
  where client_id is not null;
