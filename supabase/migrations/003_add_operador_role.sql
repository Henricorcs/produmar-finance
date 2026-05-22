-- Migration 003: Adiciona o perfil 'operador' ao enum user_role
--                e libera escrita em service_orders para operadores
-- Execute no Supabase SQL Editor

-- ============================================================================
-- PARTE 1: adicionar 'operador' ao enum
-- IMPORTANTE: ALTER TYPE ... ADD VALUE precisa ser commitado antes de ser
-- usado nas policies abaixo. Rode esta parte sozinha primeiro, depois rode
-- a PARTE 2 em uma nova execucao.
-- ============================================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'operador';

-- ============================================================================
-- PARTE 2: ajustar RLS para permitir que operadores atualizem service_orders
-- (finalizar OS, registrar horimetro, marcar entrega, etc.)
-- Rode esta parte em uma SEGUNDA execucao do SQL Editor, depois da PARTE 1.
-- ============================================================================

-- DROP policies existentes que so permitem admin/financeiro
DROP POLICY IF EXISTS "service_orders_write"      ON public.service_orders;
DROP POLICY IF EXISTS "service_order_items_write" ON public.service_order_items;

-- Recria permitindo tambem 'operador'
CREATE POLICY "service_orders_write" ON public.service_orders FOR ALL
  USING (public.current_user_role() IN ('admin', 'financeiro', 'operador'));

CREATE POLICY "service_order_items_write" ON public.service_order_items FOR ALL
  USING (public.current_user_role() IN ('admin', 'financeiro', 'operador'));
