-- ============================================================================
-- PRODUMAR — MEDIÇÕES: SALVAR A MEDIDA DA CERCA (PERÍMETRO)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE NOVO sem estragar nada.
--
-- Rodar depois da 131 (tabela medicoes).
-- ============================================================================
-- Por que:
--
--   O dono reclamou: "quando meço ao perímetro não tem botão para finalizar e
--   salvar a medida". A aba Medir cerca só fazia a conta na tela. Agora a
--   medida ganha nome e fica gravada na mesma tabela dos lotes, marcada como
--   'cerca'. Para a cerca, perimetro_m guarda a metragem total (aberta ou
--   fechada) e area_m2 fica vazio.
--
-- Nada é apagado: entram duas colunas novas. As medições que já existem
-- continuam como 'lote'.
-- ============================================================================

alter table public.medicoes add column if not exists tipo text not null default 'lote';
alter table public.medicoes add column if not exists fechado boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'medicoes_tipo_check') then
    alter table public.medicoes
      add constraint medicoes_tipo_check check (tipo in ('lote', 'cerca'));
  end if;
end $$;

comment on column public.medicoes.tipo is
  '''lote'' = cantos de um terreno, com área; ''cerca'' = medida de cerca/perímetro pela aba Medir cerca (148).';
comment on column public.medicoes.fechado is
  'Só na cerca: true = cercado fechado, a metragem soma a volta do último ponto ao 1º (148).';

-- ============================================================================
-- DEPOIS DE RODAR — conferir:
--   select column_name, data_type, column_default from information_schema.columns
--    where table_name = 'medicoes' and column_name in ('tipo', 'fechado');
-- ============================================================================
