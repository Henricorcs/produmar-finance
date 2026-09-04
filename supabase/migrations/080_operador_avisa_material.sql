-- ============================================================================
-- PRODUMAR — O OPERADOR AVISA O MATERIAL QUE LEVOU PARA A OBRA
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE UMA VEZ SÓ.
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
--   O operador continua SEM user_can_write_module('estoque'): ele não chega
--   perto de supply_items nem de supply_movements. A escrita dele fica presa a
--   supply_requests, que é só o recado — a mesma jaula do técnico.
--
-- Nada é apagado e nada muda de forma: só a policy de INSERT passa a aceitar
-- mais dois papéis. Rodar de novo não quebra.
-- ============================================================================

-- ============================================================================
-- ENVIO: técnico, operador, encarregado e admin
-- ============================================================================
-- O ::text é de propósito, e é o mesmo cuidado das migrations 052 e 079: se um
-- dia um papel novo for criado e usado no mesmo arquivo, comparar como TEXTO
-- evita o "unsafe use of new value of enum type" do Postgres. O resultado é o
-- mesmo, e o arquivo continua rodando de uma vez só.
-- ============================================================================
drop policy if exists "supply_requests_insert" on public.supply_requests;

create policy "supply_requests_insert" on public.supply_requests
  for insert with check (
    public.current_user_role()::text in ('tecnico', 'admin', 'operador', 'encarregado')
  );

comment on table public.supply_requests is
  'Fila de aviso de material usado/levado. Técnico, operador e encarregado mandam; o chefe confere na aba Pendentes do Estoque e transforma em saída. Não mexe no saldo.';

-- ============================================================================
-- PRONTO
-- ============================================================================
-- Nada mais muda: apagar o próprio recado (supply_requests_delete) já valia
-- para qualquer um que criou a linha, então o operador cancela o que ele mesmo
-- mandou sem precisar de policy nova.
-- ============================================================================
