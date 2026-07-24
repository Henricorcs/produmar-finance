-- ============================================================================
-- ILNET Finance — Escrita por módulo (operador com módulo liberado pode gravar)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Problema:
--   Ao liberar um módulo (ex.: Patrimônio, Obras) para um OPERADOR, ele passava
--   a VER a tela, mas as policies de escrita só permitiam admin/financeiro —
--   então o cadastro dava "new row violates row-level security policy".
--
-- Solução:
--   Helper user_can_write_module(slug): true para admin/financeiro (sempre) e
--   para operador quando o slug está em profiles.allowed_modules. As policies de
--   escrita dos módulos passam a usar esse helper.
-- ============================================================================

create or replace function public.user_can_write_module(module_slug text)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role in ('admin', 'financeiro')
        or (p.role = 'operador' and module_slug = any(coalesce(p.allowed_modules, '{}')))
      )
  );
$$;

-- ── Patrimônio (módulo 'ferramentas') ───────────────────────────────────────
drop policy if exists "tools_write" on public.tools;
create policy "tools_write" on public.tools for all
  using (public.user_can_write_module('ferramentas'))
  with check (public.user_can_write_module('ferramentas'));

drop policy if exists "tool_loans_write" on public.tool_loans;
create policy "tool_loans_write" on public.tool_loans for all
  using (public.user_can_write_module('ferramentas'))
  with check (public.user_can_write_module('ferramentas'));

drop policy if exists "tool_maintenance_write" on public.tool_maintenance;
create policy "tool_maintenance_write" on public.tool_maintenance for all
  using (public.user_can_write_module('ferramentas'))
  with check (public.user_can_write_module('ferramentas'));

drop policy if exists "tool_writeoffs_write" on public.tool_writeoffs;
create policy "tool_writeoffs_write" on public.tool_writeoffs for all
  using (public.user_can_write_module('ferramentas'))
  with check (public.user_can_write_module('ferramentas'));

drop policy if exists "tool_units_write" on public.tool_units;
create policy "tool_units_write" on public.tool_units for all
  using (public.user_can_write_module('ferramentas'))
  with check (public.user_can_write_module('ferramentas'));

-- ── Obras (módulo 'obras') ───────────────────────────────────────────────────
drop policy if exists "obras_write" on public.obras;
create policy "obras_write" on public.obras for all
  using (public.user_can_write_module('obras'))
  with check (public.user_can_write_module('obras'));

drop policy if exists "obra_items_write" on public.obra_items;
create policy "obra_items_write" on public.obra_items for all
  using (public.user_can_write_module('obras'))
  with check (public.user_can_write_module('obras'));
