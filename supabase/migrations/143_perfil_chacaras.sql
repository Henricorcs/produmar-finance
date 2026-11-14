-- ============================================================================
-- PRODUMAR — PERFIL 'chacaras': QUEM CUIDA SÓ DA AGENDA DAS CHÁCARAS
-- ============================================================================
-- Execute no SQL Editor do Supabase. São DUAS execuções:
--   PARTE 1 sozinha primeiro, depois a PARTE 2 numa nova execução.
-- Pode rodar de novo sem problema. Rodar DEPOIS da 142.
-- ============================================================================
-- Por que:
--
--   A agenda das chácaras (migration 142) vai ser tocada por quem atende os
--   clientes do Sítio Castro e da Chácara Thalles. Essa pessoa não tem nada
--   que ver no resto do sistema: nem caixa, nem OS, nem animais.
--
--   O perfil é fechado como o da prefeitura: entrou, cai direto em /chacaras
--   e não sai de lá (o middleware devolve qualquer outra rota). Dentro da tela
--   ele faz tudo: reserva, corrige, dá baixa no restante e exclui.
--
--   No banco, a escrita dele fica presa ao módulo 'chacaras' pela mesma
--   função que já protege os módulos (user_can_write_module).
-- ============================================================================

-- ============================================================================
-- PARTE 1 — o valor novo no enum (rode SOZINHA e depois rode a PARTE 2)
-- ============================================================================
alter type user_role add value if not exists 'chacaras';

-- ============================================================================
-- PARTE 2 — pode gravar no módulo das chácaras, e só nele
-- ============================================================================
-- Mesmo corpo da 104, com uma linha a mais. O papel é comparado como TEXTO
-- (mesmo truque da 060/079/104) para não esbarrar no enum recém-criado.
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
        p.role::text in ('admin', 'financeiro')
        or (
          p.role::text in ('operador', 'encarregado')
          and module_slug = any(coalesce(p.allowed_modules, '{}'))
        )
        or (p.role::text = 'prefeitura' and module_slug = 'prefeitura')
        or (p.role::text = 'chacaras' and module_slug = 'chacaras')
      )
  );
$$;

comment on function public.user_can_write_module(text) is
  'Pode gravar neste módulo? admin/financeiro sempre; operador e encarregado só nos módulos liberados no perfil; prefeitura só no módulo prefeitura (104); chacaras só no módulo chacaras (143).';

-- ============================================================================
-- DEPOIS DE RODAR
-- ============================================================================
--   Em Configurações → Usuários, crie a pessoa com o perfil "Chácaras".
-- ============================================================================
