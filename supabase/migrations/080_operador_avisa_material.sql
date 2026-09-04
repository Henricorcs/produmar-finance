-- ============================================================================
-- PRODUMAR — O OPERADOR AVISA O MATERIAL QUE LEVOU PARA A OBRA
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE UMA VEZ SÓ, e pode rodar de novo.
--
-- Rodar depois da 052 (a fila de material do técnico) e da 079 (o encarregado).
-- ============================================================================
-- Por que:
--
--   Quem leva o material para a obra nem sempre é o técnico. O operador que
--   dirige a caçamba descarrega dois sacos de cimento e meia carrada de areia
--   na Casa do Bernardino e isso não ficava registrado em lugar nenhum — o
--   escritório só descobria depois, de cabeça, quando alguém lembrava.
--
--   Ele passa a ter a mesma fila que o técnico já tem: um AVISO, não uma baixa.
--   O saldo do estoque não se mexe quando ele manda; quem confere e formaliza é
--   o chefe, na aba "Pendentes" do Estoque, do jeito que já faz hoje com o
--   recado do técnico.
--
--   O operador continua SEM acesso ao Estoque: ele não chega perto de
--   supply_items nem de supply_movements. A escrita dele fica presa a
--   supply_requests, que é só o recado — a mesma jaula do técnico.
--
-- ============================================================================
-- PESSOA POR PESSOA, não o perfil inteiro
-- ============================================================================
--   Nem todo operador descarrega material: a maioria só dirige e recebe OS. Por
--   isso o aviso NÃO é liberado para o perfil "operador" inteiro — é uma
--   permissão marcada no cadastro de cada um, em Configurações → Usuários, com
--   o nome "Avisar material da obra".
--
--   Ela viaja no profiles.allowed_modules, junto com os módulos, e o helper
--   user_can_write_module (migrations 039/079) já sabe conferir: para operador
--   e encarregado ele só devolve verdadeiro quando o slug está liberado para
--   aquela pessoa. O slug aqui é 'aviso-material'.
--
--   É de propósito que a permissão não vira MÓDULO: módulo dá card no hub e nav
--   própria, e o painel do operador não deve ter nada disso. Ela libera só uma
--   aba dentro da tela que ele já abre todo dia.
--
-- Nada é apagado e nada muda de forma: só a policy de INSERT é reescrita.
-- ============================================================================

drop policy if exists "supply_requests_insert" on public.supply_requests;

create policy "supply_requests_insert" on public.supply_requests
  for insert with check (
    -- o técnico, que é o dono original desta fila, e o admin
    public.current_user_role()::text in ('tecnico', 'admin')
    -- e quem recebeu "Avisar material da obra" no cadastro (operador /
    -- encarregado): o helper confere o slug no allowed_modules da pessoa
    or public.user_can_write_module('aviso-material')
  );

comment on table public.supply_requests is
  'Fila de aviso de material usado/levado. Mandam: o técnico, o admin e quem tem a permissão aviso-material (operador/encarregado). O chefe confere na aba Pendentes do Estoque e transforma em saída. Não mexe no saldo.';

-- ============================================================================
-- DEPOIS DE RODAR
-- ============================================================================
--   Vá em Configurações → Usuários → o operador → Módulos, e marque
--   "Avisar material da obra". Só quem tiver essa marca vê a aba Material no
--   painel — e só ela deixa o recado entrar no banco.
--
--   Apagar o próprio recado (supply_requests_delete) já valia para quem criou a
--   linha, então o operador cancela o que ele mesmo mandou sem policy nova.
-- ============================================================================
