-- ============================================================================
-- ILNET Finance — Módulos liberados por usuário
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Conceito:
--   • Cada usuário pode ser limitado a um subconjunto de módulos do sistema
--     (Finanças, Materiais e Serviços, Patrimônio, Obras).
--   • profiles.allowed_modules guarda os SLUGS liberados
--     (financas, materiais-servicos, ferramentas, obras).
--   • VAZIO = acesso a TODOS os módulos (sem restrição). Assim os usuários
--     já existentes continuam com acesso total sem precisar de backfill.
--   • Admin sempre tem acesso a todos os módulos, independente desta coluna.
--   • Aplicado principalmente ao perfil "financeiro" — operador e visualizador
--     têm telas dedicadas e não usam o hub de módulos.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allowed_modules text[] NOT NULL DEFAULT '{}';
