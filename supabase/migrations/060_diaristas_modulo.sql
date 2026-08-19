-- ============================================================================
-- ILNET Finance — DIARISTAS vira MÓDULO PRÓPRIO (atrelado ao Estoque)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS da migration 059.
-- ============================================================================
-- Por que:
--   Os diaristas ganharam card próprio no hub de módulos (slug 'diaristas'),
--   em vez de serem uma aba do Estoque. O dado continua atrelado ao Estoque —
--   o dia trabalhado aponta para supply_obras —, mas o ACESSO agora pode ser
--   dado sozinho: dá para liberar Diaristas a quem não mexe no estoque.
--
--   Então a escrita passa a aceitar os DOIS módulos: quem já manda no Estoque
--   continua mandando nos diaristas (nada quebra para quem já tinha acesso), e
--   quem receber só 'diaristas' também consegue trabalhar.
--
--   Nada muda para o técnico: a permissão dele é por PAPEL, não por módulo.
-- ============================================================================

-- ── diaristas: cadastro (nome, PIX, valor da diária) ────────────────────────
drop policy if exists "diaristas_write" on public.diaristas;
create policy "diaristas_write" on public.diaristas
  for all
  using (
    public.user_can_write_module('diaristas')
    or public.user_can_write_module('estoque')
  )
  with check (
    public.user_can_write_module('diaristas')
    or public.user_can_write_module('estoque')
  );

-- ── diarista_dias: o calendário ─────────────────────────────────────────────
drop policy if exists "diarista_dias_insert" on public.diarista_dias;
create policy "diarista_dias_insert" on public.diarista_dias
  for insert with check (
    -- o ::text é de propósito: current_user_role() devolve o enum user_role e
    -- 'tecnico' só existe nele depois da 052 (ver o comentário na 059)
    public.current_user_role()::text in ('tecnico', 'admin')
    or public.user_can_write_module('diaristas')
    or public.user_can_write_module('estoque')
  );

drop policy if exists "diarista_dias_update" on public.diarista_dias;
create policy "diarista_dias_update" on public.diarista_dias
  for update
  using (
    public.user_can_write_module('diaristas')
    or public.user_can_write_module('estoque')
  )
  with check (
    public.user_can_write_module('diaristas')
    or public.user_can_write_module('estoque')
  );

-- apagar: o chefe apaga qualquer um; o técnico só o que ele mesmo marcou
drop policy if exists "diarista_dias_delete" on public.diarista_dias;
create policy "diarista_dias_delete" on public.diarista_dias
  for delete using (
    public.user_can_write_module('diaristas')
    or public.user_can_write_module('estoque')
    or created_by = auth.uid()
  );
