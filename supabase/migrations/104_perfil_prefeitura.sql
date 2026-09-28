-- ============================================================================
-- PRODUMAR — PERFIL 'prefeitura': QUEM LANÇA AS NOTAS DA PREFEITURA
-- ============================================================================
-- Execute no SQL Editor do Supabase. São DUAS execuções:
--   PARTE 1 sozinha primeiro, depois a PARTE 2 numa nova execução.
-- Pode rodar de novo sem problema. Rodar DEPOIS da 102.
-- ============================================================================
-- Por que:
--
--   O controle das notas da prefeitura (migration 102) é alimentado por uma
--   pessoa que não tem nada que ver no resto do sistema: nem caixa, nem OS,
--   nem estoque. Nenhum perfil servia — o financeiro enxerga tudo, e o
--   operador/encarregado carregam o painel de OS junto.
--
--   Este perfil é fechado como o do vaqueiro: entrou, cai direto em
--   /prefeitura e não sai de lá (o middleware devolve qualquer outra rota).
--   Dentro da tela ele faz tudo: lança nota, dá baixa, edita, cadastra
--   secretaria.
--
--   No banco, a escrita dele fica presa ao módulo 'prefeitura' pela mesma
--   função que já protege os módulos (user_can_write_module). A leitura das
--   outras tabelas continua como sempre foi para quem está logado — o que o
--   prende é a tela, igual aos outros perfis fechados.
-- ============================================================================

-- ============================================================================
-- PARTE 1 — o valor novo no enum (rode SOZINHA e depois rode a PARTE 2)
-- ============================================================================
alter type user_role add value if not exists 'prefeitura';

-- ============================================================================
-- PARTE 2 — pode gravar no módulo da prefeitura, e só nele
-- ============================================================================
-- Mesmo corpo da 079, com uma linha a mais. O papel é comparado como TEXTO
-- (mesmo truque da 060/079) para não esbarrar no enum recém-criado.
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
      )
  );
$$;

comment on function public.user_can_write_module(text) is
  'Pode gravar neste módulo? admin/financeiro sempre; operador e encarregado só nos módulos liberados no perfil; prefeitura só no módulo prefeitura (migration 104).';

-- ============================================================================
-- DEPOIS DE RODAR
-- ============================================================================
--   Em Configurações → Usuários, crie a pessoa com o perfil "Prefeitura".
-- ============================================================================
