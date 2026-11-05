-- ============================================================================
-- PRODUMAR — MEDIÇÕES: o mapa e a área de um lote marcado pelo GPS
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Por que:
--
--   O dono anda no terreno com o celular e marca os cantos do lote (4 ou
--   mais) pelo GPS. O sistema desenha o lote, dá a medida de cada lado, o
--   perímetro e a área em m² e em hectares, e tira o PDF com o mapa.
--
--   Cada medição guarda os cantos como vieram do GPS (latitude, longitude e a
--   precisão de cada um), em ordem. A área e o perímetro também ficam
--   gravados, para a lista mostrar sem refazer a conta — mas quem manda são
--   os pontos: editar recalcula tudo.
--
-- Nada é apagado: entra uma tabela. Rodar de novo não quebra.
-- ============================================================================

create table if not exists public.medicoes (
  id uuid primary key default uuid_generate_v4(),

  nome       text not null check (length(trim(nome)) > 0),
  local      text,
  observacao text,

  -- [{ "lat": -4.03, "lng": -44.46, "precisao": 2.8, "em": "2026-11-05T…", "leituras": 31 }, …]
  pontos jsonb not null default '[]'::jsonb check (jsonb_typeof(pontos) = 'array'),

  area_m2     numeric(14, 2),
  perimetro_m numeric(12, 2),

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_medicoes_created on public.medicoes(created_at desc);

comment on table public.medicoes is
  'Medições de lote pelo GPS: os cantos em ordem, a área (m²) e o perímetro (migration 131).';

-- ============================================================================
-- ROW LEVEL SECURITY — lê quem está logado; grava quem tem o módulo Medições
-- ============================================================================
alter table public.medicoes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'medicoes' and policyname = 'medicoes_read') then
    create policy "medicoes_read" on public.medicoes
      for select using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'medicoes' and policyname = 'medicoes_write') then
    create policy "medicoes_write" on public.medicoes
      for all
      using (public.user_can_write_module('medicoes'))
      with check (public.user_can_write_module('medicoes'));
  end if;
end $$;

-- ============================================================================
-- DEPOIS DE RODAR
-- ============================================================================
--   Admin e financeiro já gravam. Operador e encarregado precisam do módulo
--   "Medições" marcado em Configurações → Usuários.
-- ============================================================================
