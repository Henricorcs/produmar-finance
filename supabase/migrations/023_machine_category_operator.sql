-- ============================================================================
-- ILNET Finance — Categoria da máquina + disponibilidade por operador + envio
--                 de OS direcionada a um operador
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Conceito:
--   • Cada máquina/veículo tem uma CATEGORIA (caminhão, caçamba, trator,
--     carregadeira, máquina, outro). É texto livre controlado pela UI — não há
--     enum no banco para facilitar adicionar categorias novas sem migration.
--   • Cada OPERADOR só "enxerga" / é elegível para as categorias liberadas no
--     seu login (profiles.allowed_categories). Ex.: Claúdio = caminhão+caçamba;
--     Tom = trator+carregadeira+máquina.
--   • A OS pode ser ENVIADA para um operador específico (service_orders.
--     assigned_to). No painel /operador aparece só a OS atribuída a ele (ou as
--     ainda sem dono, como fallback).
--   • Regra de negócio: só caminhão e caçamba fazem FRETE / cobrança por KM —
--     validada na aplicação (dialog de OS + server action).
-- ============================================================================

-- 1) Categoria da máquina/veículo
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS category text;

-- Backfill best-effort a partir do texto livre "type" já cadastrado.
UPDATE public.machines
SET category = CASE
  WHEN type ILIKE '%caçamb%' OR type ILIKE '%cacamb%' THEN 'cacamba'
  WHEN type ILIKE '%caminh%'                          THEN 'caminhao'
  WHEN type ILIKE '%trator%'                          THEN 'trator'
  WHEN type ILIKE '%carregad%' OR type ILIKE '%pá%'   THEN 'carregadeira'
  WHEN type ILIKE '%escavad%' OR type ILIKE '%retro%' THEN 'maquina'
  ELSE NULL
END
WHERE category IS NULL AND type IS NOT NULL AND type <> '';

-- 2) Categorias liberadas por operador (vazio = sem restrição definida)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allowed_categories text[] NOT NULL DEFAULT '{}';

-- 3) OS direcionada a um operador
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_orders_assigned_to
  ON public.service_orders(assigned_to);
