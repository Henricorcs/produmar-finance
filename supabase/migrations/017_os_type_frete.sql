-- ============================================================================
-- ILNET Finance — Novo tipo de OS: "Frete"
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- IMPORTANTE: rode a PARTE 1 sozinha primeiro e depois a PARTE 2 em uma
-- NOVA execução (valor novo de enum precisa ser commitado antes de ser usado).
-- ============================================================================
-- Conceito:
--   • A cobrança do frete (billing_mode viagem/km/diária) sai da entrega de
--     material e vira um TIPO próprio de OS: 'frete' — sem materiais e sem
--     previsão de entrega, só o que é do frete.
--   • Entrega de material volta a ser somente materiais (qtd × preço).
--   • O trigger de estoque (sync_os_stock_movements) filtra
--     type = 'entrega_material', então OS de frete não mexem no estoque.

-- ── PARTE 1 ─────────────────────────────────────────────────────────────────
ALTER TYPE service_order_type ADD VALUE IF NOT EXISTS 'frete';

-- ── PARTE 2 (rodar em uma SEGUNDA execução) ─────────────────────────────────
-- Converte para 'frete' as OS de entrega que já usavam modo de cobrança e
-- não têm material vinculado a produto (não interfere na baixa de estoque).
UPDATE public.service_orders so
SET type = 'frete'
WHERE so.type = 'entrega_material'
  AND so.billing_mode IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.service_order_items i
    WHERE i.service_order_id = so.id AND i.product_id IS NOT NULL
  );
