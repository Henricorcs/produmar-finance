-- ============================================================================
-- Produmar — As obras do Estoque passam a ser cuidadas no módulo Obras
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 051 e 057.
-- ============================================================================
-- O que muda:
--   • NADA de dado muda. A tabela supply_obras continua sendo a lista de obras
--     do Estoque (separada de public.obras), com os mesmos registros.
--   • O que muda é QUEM pode mexer nela: a tela dessas obras saiu do Estoque e
--     foi para o módulo Obras, então quem manda em Obras também precisa poder
--     cadastrar, editar e apagar. Quem manda no Estoque continua podendo — é
--     ele que cria a obra na hora de lançar uma saída.
-- ============================================================================

-- ── Obras do Estoque (supply_obras) ──────────────────────────────────────────
drop policy if exists "supply_obras_write" on public.supply_obras;
create policy "supply_obras_write" on public.supply_obras
  for all
  using (
    public.user_can_write_module('estoque')
    or public.user_can_write_module('obras')
  )
  with check (
    public.user_can_write_module('estoque')
    or public.user_can_write_module('obras')
  );

-- ── Setores da obra (supply_obra_sectors) ────────────────────────────────────
drop policy if exists "supply_obra_sectors_write" on public.supply_obra_sectors;
create policy "supply_obra_sectors_write" on public.supply_obra_sectors
  for all
  using (
    public.user_can_write_module('estoque')
    or public.user_can_write_module('obras')
  )
  with check (
    public.user_can_write_module('estoque')
    or public.user_can_write_module('obras')
  );
