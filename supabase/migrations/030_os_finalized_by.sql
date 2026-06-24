-- ============================================================================
-- ILNET Finance — Quem FINALIZOU a OS (finalized_by)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Conceito:
--   • Até aqui a finalização da OS (status 'entregue') não registrava QUEM a
--     fechou. Agora o painel /operador deixa cada operador ver as OS que ELE
--     mesmo finalizou (somente leitura) — então precisamos saber o autor do
--     fechamento.
--   • finalized_by = o usuário que clicou FINALIZAR no painel do operador.
--     Gravado pela server action finalizeServiceOrder. O escritório marcando a
--     OS como entregue pela tela de Operações NÃO preenche este campo (não é o
--     operador finalizando).
-- ============================================================================

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS finalized_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_orders_finalized_by
  ON public.service_orders(finalized_by);

-- Backfill: OS já entregues herdam o operador responsável (assigned_to) como
-- finalizador — preserva o histórico para quem já tinha OS fechadas antes desta
-- migration. Encaminhar reatribui assigned_to ao novo dono antes do fechamento,
-- então assigned_to reflete quem fechou.
UPDATE public.service_orders
SET finalized_by = assigned_to
WHERE status = 'entregue' AND finalized_by IS NULL AND assigned_to IS NOT NULL;
