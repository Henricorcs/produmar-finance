-- ============================================================================
-- PRODUMAR — Animais: o número de quem SAIU volta a ficar livre
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS da migration 061 (é ela que criou a trava por tipo).
-- ============================================================================
-- Por que:
--   Na fazenda o brinco é reaproveitado: o bovino 003 morreu ou foi vendido,
--   chega outro e ganha o 003. Até aqui o animal que saiu continuava SEGURANDO
--   o número (trava única em espécie + número, vivos e mortos juntos), então o
--   novo 003 batia em "Já existe um bovino com esse número" — e o jeito era
--   editar a ficha do que saiu, apagando a história dele.
--
--   Agora a trava vale só para quem está NO REBANHO (active = true): dois
--   bovinos 003 vivos ao mesmo tempo continuam barrados (é o erro de digitação
--   que a trava pega), mas o 003 vendido em março e o 003 que chegou em
--   novembro convivem — cada um com a sua ficha, pesagens, vacinas e partos.
--   A tela mostra, na ficha, quem já usou aquele número antes.
-- ============================================================================

begin;

drop index if exists public.uq_animals_species_tag;

create unique index if not exists uq_animals_numero_no_rebanho
  on public.animals(species, tag)
  where active;

-- busca de "quem já foi o 003" (ativos e saídos)
create index if not exists idx_animals_species_tag
  on public.animals(species, tag);

commit;
