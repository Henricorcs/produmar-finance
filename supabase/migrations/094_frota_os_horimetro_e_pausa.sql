-- ============================================================================
-- PRODUMAR — FROTA: a OS da máquina ganha HORÍMETRO, KM e PAUSA no celular
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 073, 074 e 075.
-- ============================================================================
-- Por que:
--
--   Quando a OS de máquina saiu de Operações e passou a nascer na ficha do
--   veículo (073-075), o painel do operador ficou só com INICIAR e FINALIZAR.
--   O que a OS de Operações tinha e é o miolo do serviço de máquina ficou para
--   trás:
--
--     • o HORÍMETRO de início e de fim — é dele que sai quantas horas a
--       máquina trabalhou, e é isso que se cobra na hora;
--     • o KM de início e de fim do caminhão e da caçamba;
--     • a PAUSA — o serviço que atravessa dias para no fim do expediente e
--       continua no dia seguinte, com a leitura de cada parada.
--
--   Esta migration devolve as três coisas à OS da ficha, do mesmo jeito que a
--   OS de Operações já guarda (migration 025): as leituras em colunas da OS, e
--   cada par pausa → retomada numa linha da tabela de pausas.
--
-- Nada é apagado: entram quatro colunas, uma tabela e as policies dela.
-- Rodar de novo não quebra.
-- ============================================================================

-- ── 1) As leituras de início e de fim ───────────────────────────────────────
-- O horímetro não anda com a máquina desligada, então horas trabalhadas =
-- horímetro final − horímetro inicial, com ou sem pausa no meio.
alter table public.machine_servicos
  add column if not exists hourmeter_start numeric(12, 1),
  add column if not exists hourmeter_end   numeric(12, 1),
  add column if not exists km_start        numeric(12, 1),
  add column if not exists km_end          numeric(12, 1);

comment on column public.machine_servicos.hourmeter_start is
  'Horímetro anotado pelo operador ao tocar em INICIAR';
comment on column public.machine_servicos.hourmeter_end is
  'Horímetro anotado ao FINALIZAR — horas trabalhadas = fim − início';
comment on column public.machine_servicos.km_start is
  'KM do painel do caminhão/caçamba ao INICIAR';
comment on column public.machine_servicos.km_end is
  'KM do painel ao FINALIZAR — km rodado = fim − início';

-- ── 2) As pausas ────────────────────────────────────────────────────────────
-- Mesmo desenho de service_order_pauses (025): cada linha é um par pausa →
-- retomada. Pausa em aberto = resume_time NULL, e é isso que diz que a OS está
-- parada. Data e hora vêm do relógio do celular (o servidor é UTC).
create table if not exists public.machine_servico_pausas (
  id uuid primary key default uuid_generate_v4(),
  machine_servico_id uuid not null
    references public.machine_servicos(id) on delete cascade,
  pause_number integer not null,

  -- a parada (fim do expediente)
  pause_date        text,     -- YYYY-MM-DD
  pause_time        text,     -- HH:MM
  pause_reading     numeric,  -- horímetro ou km no momento da pausa
  pause_notes       text,     -- o que ficou do dia
  latitude          numeric,  -- onde parou (GPS, quando o celular deixa)
  longitude         numeric,
  location_accuracy numeric,

  -- a volta — null enquanto está parado
  resume_date    text,
  resume_time    text,
  resume_reading numeric,

  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_machine_servico_pausas_os
  on public.machine_servico_pausas(machine_servico_id);

-- ── 3) Quem mexe na pausa ───────────────────────────────────────────────────
-- Leitura: qualquer um logado, como a ficha.
-- Escrita: o operador na OS que foi enviada a ele (a mesma regra da 075), e o
-- escritório que já manda na Frota ou em Materiais e Serviços (a da 073).
alter table public.machine_servico_pausas enable row level security;

drop policy if exists "machine_servico_pausas_read"       on public.machine_servico_pausas;
drop policy if exists "machine_servico_pausas_operador"   on public.machine_servico_pausas;
drop policy if exists "machine_servico_pausas_escritorio" on public.machine_servico_pausas;

create policy "machine_servico_pausas_read" on public.machine_servico_pausas
  for select using (auth.uid() is not null);

create policy "machine_servico_pausas_operador" on public.machine_servico_pausas
  for all
  using (
    exists (
      select 1 from public.machine_servicos s
      where s.id = machine_servico_id and s.assigned_to = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.machine_servicos s
      where s.id = machine_servico_id and s.assigned_to = auth.uid()
    )
  );

create policy "machine_servico_pausas_escritorio" on public.machine_servico_pausas
  for all
  using (
    public.user_can_write_module('frota')
    or public.user_can_write_module('materiais-servicos')
  )
  with check (
    public.user_can_write_module('frota')
    or public.user_can_write_module('materiais-servicos')
  );
