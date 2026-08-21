-- ============================================================================
-- ILNET Finance — Estoque: METROS DE CERCA por setor
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 051 e 057 (obras e setores do Estoque).
-- ============================================================================
-- Por que:
--   A obra da cerca não se mede em material, se mede em METRO FEITO. O chefe
--   quer olhar a obra e ver quanto de cerca já andou em cada setor — e quanto
--   isso custou.
--
--   Quem sabe quantos metros saíram no dia é o técnico, que está lá. Mas ele
--   NÃO vê dinheiro nenhum: manda só o número de metros. O preço é do chefe.
--
--   Por que uma tabela nova, e não um campo em supply_requests: o recado do
--   técnico MORRE quando o chefe dá baixa (a linha é apagada, migration 052).
--   Metro feito é histórico da obra — não pode sumir junto com o recado.
--
--   O preço por metro é uma TABELA, não um valor por lançamento:
--     • supply_obras.fence_rate        → o preço da obra inteira
--     • supply_obra_sectors.fence_rate → o preço daquele setor (0 = usa o da obra)
--     • supply_fence_runs.rate_per_meter → nulo = usa a tabela acima;
--       preenchido = o chefe TRAVOU o preço daquele trecho (ex.: um pedaço que
--       foi combinado diferente, ou uma parte antiga que não pode ser reajustada
--       junto com o resto).
--
--   Assim o chefe cadastra o preço UMA vez e todo metro lançado já entra
--   valendo — inclusive os que o técnico mandou antes de o preço existir.
-- ============================================================================

-- ============================================================================
-- O PREÇO POR METRO (a tabela do chefe)
-- ============================================================================
-- 0 = não combinado. É o mesmo critério do valor da diária (migration 059).
alter table public.supply_obras
  add column if not exists fence_rate numeric(12, 2) not null default 0;

alter table public.supply_obra_sectors
  add column if not exists fence_rate numeric(12, 2) not null default 0;

-- ============================================================================
-- TABELA: supply_fence_runs (um lançamento = um trecho feito num dia)
-- ============================================================================
create table if not exists public.supply_fence_runs (
  id uuid primary key default uuid_generate_v4(),

  -- A obra é obrigatória: metro de cerca sem obra não entra em conta nenhuma.
  obra_id uuid not null references public.supply_obras(id) on delete cascade,
  -- O setor é o "por onde andou". Apagar o setor não apaga o metro feito.
  sector_id uuid references public.supply_obra_sectors(id) on delete set null,

  work_date date not null default current_date,

  -- Quantos metros saíram nesse dia, naquele setor. Meio metro é metro.
  meters numeric(12, 2) not null check (meters > 0),

  -- O que foi feito no trecho ("esticou 3 fios", "levantou mourão da porteira").
  description text,
  -- Foto do trecho, no bucket attachments (opcional).
  photo_path text,

  -- Preço travado deste trecho. NULO = usa o preço do setor / da obra.
  rate_per_meter numeric(12, 2) check (rate_per_meter >= 0),

  -- Nome de quem lançou, gravado no lançamento: created_by aponta para
  -- auth.users, que não dá para juntar com profiles numa consulta do PostgREST.
  registered_by_name text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_supply_fence_runs_obra   on public.supply_fence_runs(obra_id);
create index if not exists idx_supply_fence_runs_sector on public.supply_fence_runs(sector_id);
create index if not exists idx_supply_fence_runs_data   on public.supply_fence_runs(work_date desc);
create index if not exists idx_supply_fence_runs_autor  on public.supply_fence_runs(created_by);

-- ============================================================================
-- VIEW: v_supply_fence_runs (o lançamento com o preço já resolvido)
-- ============================================================================
-- A ordem do coalesce É a regra de preço:
--   1) o preço travado no trecho (inclusive zero, quando o chefe diz que aquele
--      pedaço não paga — por isso o nullif NÃO entra aqui);
--   2) o preço do setor (0 = não tem preço próprio, cai para a obra);
--   3) o preço da obra.
--
-- Esta view é do CHEFE. A tela do técnico lê supply_fence_runs direto, que não
-- tem valor nenhum — só metro.
-- ============================================================================
drop view if exists public.v_supply_fence_runs;
create view public.v_supply_fence_runs
with (security_invoker = on) as
select
  f.*,
  o.name as obra_name,
  s.name as sector_name,
  coalesce(f.rate_per_meter, nullif(s.fence_rate, 0), o.fence_rate, 0) as effective_rate,
  round(
    f.meters * coalesce(f.rate_per_meter, nullif(s.fence_rate, 0), o.fence_rate, 0),
    2
  ) as total_value
from public.supply_fence_runs f
join public.supply_obras o on o.id = f.obra_id
left join public.supply_obra_sectors s on s.id = f.sector_id;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Mesmo desenho dos diaristas (059): o técnico LANÇA, o chefe CORRIGE.
-- ============================================================================
alter table public.supply_fence_runs enable row level security;

drop policy if exists "supply_fence_runs_read"   on public.supply_fence_runs;
drop policy if exists "supply_fence_runs_insert" on public.supply_fence_runs;
drop policy if exists "supply_fence_runs_update" on public.supply_fence_runs;
drop policy if exists "supply_fence_runs_delete" on public.supply_fence_runs;

create policy "supply_fence_runs_read" on public.supply_fence_runs
  for select using (auth.uid() is not null);

-- lançar metro: o técnico (é para isso que ele existe) e quem manda no Estoque.
-- O ::text é de propósito — ver o comentário da migration 059.
create policy "supply_fence_runs_insert" on public.supply_fence_runs
  for insert with check (
    public.current_user_role()::text in ('tecnico', 'admin')
    or public.user_can_write_module('estoque')
  );

-- corrigir é do chefe: o lançamento tem preço travado, e preço é dinheiro.
-- O técnico que errou o metro apaga e lança de novo (política de baixo).
create policy "supply_fence_runs_update" on public.supply_fence_runs
  for update
  using (public.user_can_write_module('estoque'))
  with check (public.user_can_write_module('estoque'));

create policy "supply_fence_runs_delete" on public.supply_fence_runs
  for delete using (
    public.user_can_write_module('estoque') or created_by = auth.uid()
  );
