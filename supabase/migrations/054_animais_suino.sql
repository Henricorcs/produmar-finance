-- ============================================================================
-- ILNET Finance — Animais: TIPO SUÍNO (porco, porca, leitão, leitoa)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS da migration 047 (tipo do animal).
-- ATENÇÃO: este arquivo tem ALTER TYPE — são DUAS execuções, PARTE 1 e depois
-- PARTE 2. Rodar tudo de uma vez dá erro na PARTE 2.
-- ============================================================================
-- Por que:
--   O rebanho agora também tem porco. É o quinto tipo, e entra do mesmo jeito
--   que equino, caprino e ovino entraram na 047: um valor a mais no enum e as
--   raças mais comuns já cadastradas, para ninguém precisar digitar.
--
--   A CATEGORIA continua saindo sozinha da idade + sexo (view v_animals) e
--   continua com as mesmas três chaves — elas são o PAPEL do animal, não o
--   nome dele. Quem dá nome é a tela: leitão/leitoa (filhote), porco (macho
--   adulto), porca (fêmea adulta). Por isso a view NÃO precisa ser recriada
--   aqui: nada muda nas colunas dela.
-- ============================================================================

-- ============================================================================
-- PARTE 1: adicionar 'suino' ao enum animal_species
-- IMPORTANTE: ALTER TYPE ... ADD VALUE precisa ser commitado antes de ser
-- usado na PARTE 2. Rode esta parte sozinha primeiro, depois rode a PARTE 2
-- em uma nova execução do SQL Editor.
-- ============================================================================

ALTER TYPE animal_species ADD VALUE IF NOT EXISTS 'suino';

-- ============================================================================
-- PARTE 2: raças mais comuns de suíno (o usuário pode renomear/remover)
-- Rode esta parte em uma SEGUNDA execução do SQL Editor, depois da PARTE 1.
-- ============================================================================

insert into public.animal_breeds (name, species)
values
  ('landrace',    'suino'),
  ('large white', 'suino'),
  ('duroc',       'suino'),
  ('piau',        'suino'),
  ('mestiço',     'suino')
on conflict (species, name) do nothing;
