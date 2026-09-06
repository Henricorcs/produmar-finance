-- ============================================================================
-- PRODUMAR — ANIMAIS: piscicultura e aves (2 de 2 — a despesa aceita os novos)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS da 086_animais_piscicultura_e_aves.sql, que cria os dois valores
-- no enum. Rodar esta antes da 086 não quebra nada — mas aí quem trava é o
-- cadastro do animal, que não conhece os tipos novos.
-- ============================================================================
-- Por que:
--   A despesa com animais (migration 072) guarda a espécie como TEXTO, com uma
--   trava listando quais valem. Ela nasceu com as cinco espécies daquela época;
--   sem esta migration, lançar a compra de ração da piscicultura ou das aves
--   morre na trava do banco — e a mensagem que chega na tela é o erro cru.
--
--   A despesa é o motivo de os dois tipos existirem: quem cria peixe e galinha
--   não fica registrando bicho por bicho, mas gasta com ração, sal e alevino
--   todo mês, e precisa saber quanto cada criação custou.
--
-- Nada é apagado. Rodar de novo não quebra nada.
-- ============================================================================

alter table public.animal_despesas
  drop constraint if exists animal_despesas_species_check;

alter table public.animal_despesas
  add constraint animal_despesas_species_check
  check (
    species in ('bovino', 'equino', 'caprino', 'ovino', 'suino', 'piscicultura', 'aves')
  );

comment on column public.animal_despesas.species is
  'Espécie que pagou a conta. Piscicultura e aves entram aqui pelo gasto: o normal é não haver bicho cadastrado um a um.';
