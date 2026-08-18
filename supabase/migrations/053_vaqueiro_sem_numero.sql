-- ============================================================================
-- ILNET Finance — O vaqueiro não dá mais o número do bezerro
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS da migration 048 (perfil vaqueiro). Uma execução só — não tem
-- ALTER TYPE aqui, então pode rodar o arquivo inteiro de uma vez.
-- ============================================================================
-- Por que:
--   Numerar bezerro é decisão de quem cuida do rebanho, não de quem está no
--   curral às cinco da manhã: o vaqueiro chutava um número, o patrão trocava na
--   conferência, e o número errado ainda aparecia na tela de pendentes como se
--   fosse oficial. Agora ele manda só o essencial — foto, número da mãe e sexo
--   — e o número nasce na aba "Nascimentos", quando o patrão lança de verdade.
--
--   Por isso calf_tag deixa de ser obrigatório NA SOLICITAÇÃO. Em animals ele
--   continua sendo obrigatório: lá é o bicho de verdade, e nenhum entra no
--   rebanho sem número.
-- ============================================================================

alter table public.animal_birth_requests
  alter column calf_tag drop not null;
