-- ============================================================================
-- PRODUMAR — O ENCARREGADO TAMBÉM INICIA, PAUSA E FINALIZA A OS
-- ============================================================================
-- Execute no SQL Editor do Supabase. PODE RODAR DE UMA VEZ SÓ, e de novo.
-- Rodar DEPOIS da 079 (perfil encarregado).
-- ============================================================================
-- Por que:
--
--   O Jeferson (encarregado) foi finalizar um SERVIÇO RÁPIDO com valor gasto e
--   o celular mostrou:
--     new row violates row-level security policy for table "service_order_items"
--
--   A 079 criou o encarregado dizendo que ele recebe OS "como qualquer
--   operador" — mas só ensinou isso ao helper dos MÓDULOS. As tabelas da OS
--   têm regras próprias, escritas antes dele existir (003, 016, 019, 025, 026,
--   027), e todas nomeiam só o 'operador'. Resultado: o encarregado recebia a
--   OS no painel e não conseguia gravar nada nela.
--
--   Pior que o erro: a OS em si (service_orders) não dá erro quando a regra
--   barra um UPDATE — o banco simplesmente não muda nenhuma linha. O iniciar e
--   o finalizar "davam certo" na tela e a OS continuava igual.
--
--   Aqui o encarregado entra em todas elas com o MESMO direito do operador —
--   nem mais, nem menos. Usa ALTER POLICY: a regra é trocada no lugar, nada é
--   apagado. O papel é comparado como TEXTO (mesmo truque da 079).
-- ============================================================================

-- a OS: operador e encarregado só ATUALIZAM (iniciar, pausar, finalizar)
alter policy "service_orders_operador_update" on public.service_orders
  using (public.current_user_role()::text in ('operador', 'encarregado'))
  with check (public.current_user_role()::text in ('operador', 'encarregado'));

-- os itens: a finalização recria a linha de frete / de serviço / do valor gasto
alter policy "service_order_items_write" on public.service_order_items
  using (public.current_user_role()::text in ('admin', 'financeiro', 'operador', 'encarregado'));

-- as viagens (modo "por viagem")
alter policy "service_order_trips_write" on public.service_order_trips
  using (public.current_user_role()::text in ('admin', 'financeiro', 'operador', 'encarregado'));

-- as pausas ("ainda não terminei — pausar")
alter policy "service_order_pauses_write" on public.service_order_pauses
  using (public.current_user_role()::text in ('admin', 'financeiro', 'operador', 'encarregado'));

-- o comprovante (foto / arquivo anexado ao finalizar)
alter policy "service_order_attachments_write" on public.service_order_attachments
  using (public.current_user_role()::text in ('admin', 'financeiro', 'operador', 'encarregado'));

-- o encaminhamento da OS para outro
alter policy "service_order_forwards_write" on public.service_order_forwards
  using (public.current_user_role()::text in ('admin', 'financeiro', 'operador', 'encarregado'));

-- ============================================================================
-- CONFERÊNCIA — as 6 regras devem citar 'encarregado'
-- ============================================================================
--   select tablename, policyname, qual from pg_policies
--   where policyname in ('service_orders_operador_update', 'service_order_items_write',
--     'service_order_trips_write', 'service_order_pauses_write',
--     'service_order_attachments_write', 'service_order_forwards_write');
-- ============================================================================
