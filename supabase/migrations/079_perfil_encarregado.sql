-- ============================================================================
-- PRODUMAR — Perfil ENCARREGADO (recebe OS e manda no módulo liberado)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- IMPORTANTE: rode a PARTE 1 sozinha primeiro e depois a PARTE 2 em uma NOVA
-- execução — valor novo de enum precisa ser commitado antes de ser usado.
-- ============================================================================
-- Por que:
--
--   Faltava um degrau entre o OPERADOR e o ADMIN.
--
--   O operador é fechado de propósito: ele recebe no celular a OS que mandaram
--   para ele, toca em INICIAR e em FINALIZAR, e mais nada. Já o admin abre tudo
--   — o financeiro, as contas, os usuários.
--
--   Só que existe quem fica no meio: o ENCARREGADO. É quem toma conta da
--   frota. Ele precisa, ao mesmo tempo:
--     • RECEBER a OS que o escritório manda para ele, como qualquer operador;
--     • ALIMENTAR o módulo Máquinas e Veículos — as diárias da caçamba e das
--       máquinas, a troca de diárias com o parceiro, as despesas;
--     • CRIAR e DISTRIBUIR ordem de serviço para os motoristas (o Claúdio, o
--       Jelington), que continuam operadores comuns.
--
--   E não pode virar admin para isso: o financeiro da empresa não é da conta
--   dele.
--
--   O encarregado segue exatamente a mesma regra do operador para módulos: ele
--   só enxerga (e só grava) o que foi liberado no cadastro dele. Se você liberar
--   só "Máquinas e Veículos", é só isso que ele alcança.
--
-- Nada é apagado: entra um valor no enum e o helper de escrita passa a conhecer
-- o papel novo. Rodar de novo não quebra.
-- ============================================================================

-- ============================================================================
-- PARTE 1: o papel novo no enum
-- ============================================================================
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'encarregado';

-- ============================================================================
-- PARTE 2 (rodar em uma SEGUNDA execução)
-- ============================================================================
-- O helper que TODAS as policias de módulo usam (migration 039). O encarregado
-- entra com a mesma regra do operador: grava no módulo que está liberado para
-- ele, e em mais nenhum.
--
-- Continua valendo: admin e financeiro gravam em qualquer módulo; quem não tem
-- o módulo na lista não grava em nada.
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
        or (
          p.role in ('operador', 'encarregado')
          and module_slug = any(coalesce(p.allowed_modules, '{}'))
        )
      )
  );
$$;

comment on function public.user_can_write_module(text) is
  'Pode gravar neste módulo? admin/financeiro sempre; operador e encarregado só nos módulos liberados no perfil.';
