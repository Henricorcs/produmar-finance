-- ============================================================================
-- ILNET Finance — Animais: TIPO SUÍNO (2 de 2 — as raças)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS da 054_animais_suino.sql, em uma execução SEPARADA — é ela que
-- cria o valor 'suino', e ele só existe para este arquivo depois do commit.
-- ============================================================================
-- Se der "unsafe use of new value 'suino'" aqui, é sinal de que a 054 foi
-- colada junto: rode a 054 sozinha primeiro, aperte Run, e só então este.
--
-- As raças mais comuns do tipo, para ninguém precisar digitar. O usuário pode
-- renomear/remover na tela (Animais → raças). Só um empurrão inicial: o
-- cadastro de suíno funciona sem elas.
-- ============================================================================

insert into public.animal_breeds (name, species)
values
  ('landrace',    'suino'),
  ('large white', 'suino'),
  ('duroc',       'suino'),
  ('piau',        'suino'),
  ('mestiço',     'suino')
on conflict (species, name) do nothing;
