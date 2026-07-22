-- ============================================================================
-- PRODUMAR — Patrimônio (Fase 3): quantidade, unidade e valores
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- O antigo módulo "Ferramentas" vira "Patrimônio". As tabelas continuam
-- chamando-se tools/tool_* — só os rótulos na tela mudam.
--
--   • quantity          = saldo total de unidades daquele item.
--   • unit              = tipo de unidade (unidade, peça, jogo, par...).
--   • unit_value        = valor unitário do item (quanto vale cada unidade).
--   • replacement_value = valor de reposição — quanto custa repor uma unidade
--                         perdida/inutilizada.
-- ============================================================================

alter table public.tools
  add column if not exists quantity          integer       not null default 1,
  add column if not exists unit              text          not null default 'unidade',
  add column if not exists unit_value        numeric(12,2) not null default 0,
  add column if not exists replacement_value numeric(12,2) not null default 0;
