-- ============================================================================
-- PRODUMAR — FROTA: a OS da ficha vai para o celular do operador
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 073 e 074.
-- ============================================================================
-- Por que:
--
--   A OS de máquina saiu de Operações e passou a nascer na ficha do veículo.
--   Só que era pela OS de Operações que o operador recebia o serviço no
--   celular — ele abria o painel dele, tocava em INICIAR e, no fim, em
--   FINALIZAR. Sem isto, a OS da ficha ficaria só no papel do escritório e o
--   Claúdio e o Tom não teriam mais o que fazer no painel.
--
--   Então a OS da ficha aprende a ser ENVIADA:
--     assigned_to      → para quem foi mandada (aparece só no painel dele)
--     started_at       → quando ele tocou em INICIAR
--     finished_at      → quando tocou em FINALIZAR
--     finalized_by     → quem fechou (fica no histórico do painel)
--     completion_notes → o que ele escreveu que fez
--
--   Ao finalizar, a OS fecha (status = 'concluida') e o dia deixa de ficar
--   verde no calendário do veículo. O operador também pode corrigir a
--   quantidade: se foram 4 viagens e não 3, o valor acompanha — é para isso
--   que ele está na rua.
--
-- Nada é apagado: entram cinco colunas e uma policy. Rodar de novo não quebra.
-- ============================================================================

alter table public.machine_servicos
  add column if not exists assigned_to      uuid references public.profiles(id) on delete set null,
  add column if not exists started_at       timestamptz,
  add column if not exists finished_at      timestamptz,
  add column if not exists finalized_by     uuid references public.profiles(id) on delete set null,
  add column if not exists completion_notes text;

create index if not exists idx_machine_servicos_assigned
  on public.machine_servicos(assigned_to);

comment on column public.machine_servicos.assigned_to is
  'Operador para quem a OS foi enviada — é só no painel dele que ela aparece';

-- ============================================================================
-- O OPERADOR MEXE NA OS QUE É DELE
-- ============================================================================
-- A escrita da ficha continua sendo de quem manda na Frota (migration 073).
-- Esta policy entra POR CIMA, e só para o operador tocar na OS que foi enviada
-- a ele: iniciar, corrigir a quantidade do que fez e finalizar. A OS de outro
-- operador ele não vê no painel nem alcança por aqui.
--
-- Policies permissivas se somam: quem já podia gravar continua podendo.
-- ============================================================================
drop policy if exists "machine_servicos_operador_update" on public.machine_servicos;

create policy "machine_servicos_operador_update" on public.machine_servicos
  for update
  using (assigned_to = auth.uid())
  with check (assigned_to = auth.uid());
