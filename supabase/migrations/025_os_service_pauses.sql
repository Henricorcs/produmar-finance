-- ============================================================================
-- ILNET Finance — Pausa / retomada de serviço (prestação de serviço interno)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Conceito:
--   • Serviço interno (prestação de serviço) pode durar vários dias. Ao fim do
--     expediente o operador toca em "PAUSAR": o app grava a hora e a localização
--     (GPS) automaticamente, a leitura do veículo/máquina (km do hodômetro OU
--     horímetro, conforme tracking_type da máquina) e uma observação do dia
--     (opcional).
--   • No dia seguinte ele toca em "CONTINUAR SERVIÇO": o app grava a hora de
--     retorno e a leitura (km/horímetro) ao voltar a trabalhar.
--   • Cada par pausa→retomada é uma linha. Pausa EM ABERTO = resume_time NULL
--     (no máximo uma por OS) — é o que indica que o serviço está pausado.
--   • Datas e horas vêm do relógio do celular do técnico (o servidor é UTC na
--     Vercel). GPS é best-effort: desligado/sem permissão não bloqueia a pausa.
--   • A leitura é um diário de uso da máquina + observações — não altera o
--     cálculo do serviço (horas = horímetro_final − horímetro_inicial; o
--     horímetro não avança com a máquina parada).
-- ============================================================================

create table if not exists public.service_order_pauses (
  id uuid primary key default uuid_generate_v4(),
  service_order_id uuid not null references public.service_orders(id) on delete cascade,
  pause_number integer not null,

  -- Pausa (fim do expediente)
  pause_date        text,    -- YYYY-MM-DD (relógio do celular do técnico)
  pause_time        text,    -- HH:MM
  pause_reading     numeric, -- km (hodômetro) ou horímetro no momento da pausa
  pause_notes       text,    -- observação do dia (opcional)
  latitude          numeric, -- localização (GPS) de onde pausou
  longitude         numeric,
  location_accuracy numeric, -- precisão em metros informada pelo aparelho

  -- Retomada (dia seguinte) — null enquanto pausado
  resume_date    text,
  resume_time    text,
  resume_reading numeric,

  created_at timestamptz not null default now()
);

create index if not exists idx_service_order_pauses_order
  on public.service_order_pauses(service_order_id);

alter table public.service_order_pauses enable row level security;

-- Leitura: todo usuário logado. Escrita: admin/financeiro/operador
-- (mesma regra de service_orders / service_order_trips — o técnico pausa).
drop policy if exists "service_order_pauses_read"  on public.service_order_pauses;
drop policy if exists "service_order_pauses_write" on public.service_order_pauses;
create policy "service_order_pauses_read"  on public.service_order_pauses
  for select using (auth.uid() is not null);
create policy "service_order_pauses_write" on public.service_order_pauses
  for all using (public.current_user_role() in ('admin', 'financeiro', 'operador'));
