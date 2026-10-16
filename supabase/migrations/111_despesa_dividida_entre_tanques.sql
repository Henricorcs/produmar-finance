-- ============================================================================
-- PRODUMAR — ANIMAIS: DESPESA DIVIDIDA ENTRE OS TANQUES
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE NOVO sem estragar nada.
--
-- Rodar depois da 089 (tanque e ciclo).
-- ============================================================================
-- Por que:
--
--   A nota de ração chega uma só, mas a ração vai para todos os tanques com
--   peixe. Até aqui a despesa só sabia ir para UM tanque (ou para nenhum, e aí
--   não entrava no custo de ciclo nenhum).
--
--   Agora a nota pode ser DIVIDIDA: vira uma despesa em cada tanque, com a
--   parte dele — pela quantidade de peixe vivo ou em partes iguais. As partes
--   da mesma nota levam o mesmo `rateio_id`, e é por ele que a tela mostra
--   que a despesa veio de uma nota dividida e deixa apagar a nota inteira de
--   uma vez.
--
-- Nada é apagado: entra uma coluna (vazia nas despesas que já existem).
-- ============================================================================

alter table public.animal_despesas
  add column if not exists rateio_id uuid;

create index if not exists idx_animal_despesas_rateio
  on public.animal_despesas(rateio_id)
  where rateio_id is not null;

comment on column public.animal_despesas.rateio_id is
  'Partes da mesma nota dividida entre tanques (migration 111). Null = despesa normal, de um tanque só ou da criação.';
