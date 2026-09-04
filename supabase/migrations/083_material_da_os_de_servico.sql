-- ============================================================================
-- PRODUMAR — A OS DE SERVIÇO LEVA A LISTA DE MATERIAL A COMPRAR
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE UMA VEZ SÓ, e pode rodar de novo.
--
-- Rodar depois da 052 (a fila de material) — nada aqui depende dela, mas é a
-- ordem em que a história faz sentido.
-- ============================================================================
-- Por que:
--
--   Quando o escritório manda uma OS de material, ela não é uma baixa: é uma
--   ORDEM DE COMPRA. "Compra estes canos e leva pra Casa Bernardino." Quem vai
--   à loja é quem está na rua, e o estoque só sabe o que aconteceu depois,
--   quando ele avisa o que comprou e por quanto (migration 082) e o chefe dá
--   entrada e baixa na aba Pendentes.
--
--   Por isso o material da OS precisa caber na mesma tabela de linhas que já
--   existe, sem virar movimento de estoque nenhum. E aí aparece o problema
--   prático: numa OS de serviço rápido, UMA das linhas é o serviço em si (é
--   ela que carrega o valor) e as outras são o material pedido. Ao reabrir a
--   OS pra editar, as duas coisas voltam misturadas e sem como distinguir.
--
--   Esta coluna é a marca que separa. É o mesmo recurso que o is_freight já
--   usa há tempos para dizer "esta linha é frete, não é material" — aqui só se
--   diz o contrário sobre o outro tipo de linha.
--
-- ============================================================================
-- O QUE NÃO MUDA
-- ============================================================================
--   Nas OS antigas de entrega de material a coluna nasce falsa e nada muda:
--   lá toda linha que não é frete já é material por definição, e a tela
--   continua lendo daquele jeito. A marca só é escrita nas linhas de material
--   das OS de serviço, que são as novas.
--
--   Nenhum saldo se mexe por causa desta coluna. Ela é só rótulo de linha.
-- ============================================================================

alter table public.service_order_items
  add column if not exists is_material boolean not null default false;

comment on column public.service_order_items.is_material is
  'Marca a linha que é MATERIAL PEDIDO numa OS de serviço rápido — a linha do serviço em si não tem a marca. Só rótulo: não mexe em estoque (migration 083).';
