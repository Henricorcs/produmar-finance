-- ============================================================================
-- ILNET Finance — Estoque: perfil 'tecnico' e a fila de material usado
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 049, 050 e 051 (módulo Estoque).
-- ============================================================================
-- Por que:
--   Quem gasta o material é o técnico na rua, não quem cuida do estoque. Ele
--   precisa de UMA tela de celular para dizer "usei 30 m de cano na obra tal"
--   — e nada mais. O saldo NÃO cai nesse momento: o envio é só uma fila de
--   avisos. Quem confere e dá baixa de verdade é o chefe, na aba "Pendentes"
--   do Estoque, onde o pedido vira uma saída normal em supply_movements.
--
--   É o mesmo desenho do vaqueiro (migration 048): o técnico não tem
--   user_can_write_module('estoque') — ele nunca chega perto de supply_items
--   nem de supply_movements. A escrita dele fica presa a esta tabela isolada,
--   supply_requests, que não é o estoque de verdade, só o recado.
--
--   O material e a obra podem vir da lista OU escritos na mão: no meio do
--   serviço nem sempre o que ele usou está cadastrado. Quem casa isso com o
--   cadastro de verdade é o chefe, na hora de dar baixa.
-- ============================================================================

-- ============================================================================
-- PARTE 1: adicionar 'tecnico' ao enum user_role
-- IMPORTANTE: ALTER TYPE ... ADD VALUE precisa ser commitado antes de ser
-- usado na PARTE 2. Rode esta parte sozinha primeiro, depois rode a PARTE 2
-- em uma nova execução do SQL Editor.
-- ============================================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'tecnico';

-- ============================================================================
-- PARTE 2: supply_requests (o técnico avisa, o chefe dá baixa)
-- Rode esta parte em uma SEGUNDA execução do SQL Editor, depois da PARTE 1.
-- ============================================================================

create table if not exists public.supply_requests (
  id uuid primary key default uuid_generate_v4(),

  -- O material: escolhido da lista (item_id) OU digitado de cabeça (item_text).
  -- Um dos dois é obrigatório — ver o check no fim da tabela.
  item_id   uuid references public.supply_items(id) on delete cascade,
  item_text text,

  quantity numeric(12, 3) not null check (quantity > 0),

  -- Onde foi usado: a obra da lista e/ou o lugar escrito na mão ("poste da
  -- esquina", "casa do cliente"). Também precisa de pelo menos um dos dois.
  obra_id     uuid references public.supply_obras(id) on delete set null,
  destination text,

  used_date date not null default current_date,
  notes     text,

  -- foto do que foi usado / de onde foi aplicado (bucket attachments)
  photo_path text,

  -- Nome de quem enviou, gravado no envio: o chefe precisa saber quem pegou o
  -- material, e created_by aponta para auth.users — que não dá para juntar com
  -- profiles numa consulta do PostgREST.
  sent_by_name text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint supply_requests_tem_material check (
    item_id is not null or nullif(btrim(item_text), '') is not null
  ),
  constraint supply_requests_tem_lugar check (
    obra_id is not null or nullif(btrim(destination), '') is not null
  )
);

create index if not exists idx_supply_requests_created on public.supply_requests(created_at desc);
create index if not exists idx_supply_requests_creator on public.supply_requests(created_by);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
-- Sem coluna de status: a linha existir já significa "aguardando o chefe". Ela
-- morre quando ele resolve — dando baixa (nasce a saída em supply_movements) ou
-- descartando (envio errado/duplicado).
alter table public.supply_requests enable row level security;

drop policy if exists "supply_requests_read"   on public.supply_requests;
drop policy if exists "supply_requests_insert" on public.supply_requests;
drop policy if exists "supply_requests_delete" on public.supply_requests;

-- leitura: qualquer logado (igual ao resto do módulo Estoque)
create policy "supply_requests_read" on public.supply_requests
  for select using (auth.uid() is not null);

-- envio: só técnico e admin — os dois únicos papéis que chegam em /tecnico
create policy "supply_requests_insert" on public.supply_requests
  for insert with check (public.current_user_role() in ('tecnico', 'admin'));

-- resolver (dar baixa ou descartar) pede o mesmo acesso de escrita do módulo
-- Estoque. O técnico entra aqui só para cancelar o QUE ELE MESMO enviou —
-- mandou errado, apaga o recado; nunca decide sobre o envio de outro.
create policy "supply_requests_delete" on public.supply_requests
  for delete using (
    public.user_can_write_module('estoque') or created_by = auth.uid()
  );
