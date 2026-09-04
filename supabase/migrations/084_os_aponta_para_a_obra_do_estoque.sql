-- ============================================================================
-- PRODUMAR — A OS APONTA PARA A OBRA DO ESTOQUE
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE UMA VEZ SÓ, e pode rodar de novo.
--
-- Rodar depois da 051 (supply_obras) e da 083 (o material da OS).
-- ============================================================================
-- Por que:
--
--   Este sistema tem DUAS listas de obra, e isso é de propósito (a 065 diz
--   isso com todas as letras): public.obras, do módulo Obras, e
--   public.supply_obras, que é a lista que o Estoque usa.
--
--   Quem trabalha com material vive na segunda. O aviso do técnico, o do
--   operador, o setor da obra, a diária — tudo aponta para supply_obras. É lá
--   que estão a Casa Bernardino e as outras seis obras de verdade.
--
--   Só que a OS apontava para a PRIMEIRA (public.obras, desde a 033), que tem
--   uma obra só e nenhuma ativa. Resultado prático: o campo de obra da OS
--   simplesmente não aparecia, porque a lista chegava vazia. O chefe mandava
--   comprar material e não tinha como dizer para qual obra levar.
--
--   Esta coluna conserta isso pelo lado certo: a OS passa a poder apontar para
--   a obra do ESTOQUE, que é a mesma que vai receber a baixa quando o material
--   chegar e a pendência for confirmada. A conta da obra fecha com ela mesma.
--
-- ============================================================================
-- A COLUNA ANTIGA CONTINUA
-- ============================================================================
--   obra_id (para public.obras) não é tocada. As OS antigas que apontam para
--   lá seguem apontando, e o resumo de custo do módulo Obras continua somando
--   o que sempre somou. O que nasce daqui em diante usa a coluna nova.
-- ============================================================================

alter table public.service_orders
  add column if not exists supply_obra_id uuid references public.supply_obras(id) on delete set null;

create index if not exists idx_service_orders_supply_obra_id
  on public.service_orders(supply_obra_id);

comment on column public.service_orders.supply_obra_id is
  'Obra do ESTOQUE (supply_obras) para onde esta OS manda o material. É a mesma lista que o aviso do técnico e a baixa usam (migration 084).';
