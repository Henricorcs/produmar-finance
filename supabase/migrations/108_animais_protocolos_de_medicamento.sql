-- ============================================================================
-- PRODUMAR — ANIMAIS: PROTOCOLOS DE MEDICAMENTO (programação por etapas)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE UMA VEZ SÓ, e pode rodar de novo.
--
-- Rodar depois da 041 (animais), da 047 (tipo do animal) e da 046 (pesagens).
-- ============================================================================
-- Por que:
--
--   O dono trata o rebanho em LEVAS: hoje um grupo de animais toma vermífugo e
--   ferro, daqui a um mês toma o reforço. Até aqui o sistema só sabia aplicar
--   vacina num animal por vez, e a conta de "quantos ml dar neste boi de 380 kg"
--   era feita de cabeça no curral.
--
--   Agora são três coisas:
--
--   1) MEDICAMENTOS — cadastro por tipo de bicho, com a regra de dose da bula:
--      dose fixa (5 ml) ou por peso (1 ml a cada 50 kg).
--
--   2) PROTOCOLO (o modelo) — a receita: quais medicamentos e em que DIA
--      depois do início. "Dia 0: vermífugo + ferro; dia 30: reforço."
--
--   3) PROGRAMAÇÃO — o protocolo aplicado num grupo de animais a partir de uma
--      data. Cada etapa vira a lista do curral (nº do animal, peso, ml de cada
--      medicamento) e, quando é marcada como aplicada, cada dose vira um
--      TRATAMENTO na ficha do animal — o mesmo histórico que já existe.
--
--   A programação guarda uma FOTOGRAFIA dos itens e das regras de dose (coluna
--   `itens`): mexer no modelo ou no cadastro amanhã não muda a levada que já
--   está correndo.
--
-- Nada é apagado: entram quatro tabelas e duas colunas em animal_treatments.
-- ============================================================================

-- ── 1) Medicamentos ─────────────────────────────────────────────────────────
create table if not exists public.animal_medicamentos (
  id uuid primary key default uuid_generate_v4(),

  species            animal_species not null default 'bovino',
  name               text not null,            -- ex.: IVERMECTINA 1%
  default_dose_ml    numeric(10, 2),           -- dose fixa em ml
  -- dose por peso: "dose_ml_per_weight ml a cada dose_weight_kg kg"
  dose_ml_per_weight numeric(10, 2),
  dose_weight_kg     numeric(10, 2),
  notes              text,

  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create unique index if not exists uq_animal_medicamentos_species_name
  on public.animal_medicamentos(species, name);

comment on table public.animal_medicamentos is
  'Medicamentos do rebanho por tipo de bicho, com a regra de dose (fixa ou ml por kg). Usados nos protocolos (migration 108).';

-- ── 2) Protocolo (o modelo) e os itens dele ─────────────────────────────────
create table if not exists public.animal_protocolos (
  id uuid primary key default uuid_generate_v4(),

  species animal_species not null default 'bovino',
  name    text not null,                       -- ex.: DESMAMA, ENTRADA NO CONFINAMENTO
  notes   text,

  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.animal_protocolo_itens (
  id uuid primary key default uuid_generate_v4(),

  protocolo_id   uuid not null references public.animal_protocolos(id) on delete cascade,
  medicamento_id uuid not null references public.animal_medicamentos(id) on delete cascade,
  -- em que dia, contado do início: 0 = no dia, 30 = um mês depois
  dia            integer not null default 0 check (dia >= 0),
  sort_order     integer not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists idx_animal_protocolo_itens_protocolo
  on public.animal_protocolo_itens(protocolo_id, dia, sort_order);

-- ── 3) Programação: o protocolo aplicado num grupo de animais ───────────────
create table if not exists public.animal_protocolo_aplicacoes (
  id uuid primary key default uuid_generate_v4(),

  protocolo_id uuid references public.animal_protocolos(id) on delete set null,
  name         text not null,                  -- o nome do protocolo na hora
  species      animal_species not null default 'bovino',
  start_date   date not null default current_date,
  -- fotografia: [{ dia, medicamento_id, name, default_dose_ml,
  --                dose_ml_per_weight, dose_weight_kg }]
  itens        jsonb not null default '[]'::jsonb,
  notes        text,

  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_animal_protocolo_aplicacoes_start
  on public.animal_protocolo_aplicacoes(start_date desc);

create table if not exists public.animal_protocolo_aplicacao_animais (
  aplicacao_id uuid not null references public.animal_protocolo_aplicacoes(id) on delete cascade,
  animal_id    uuid not null references public.animals(id) on delete cascade,
  -- o peso que calcula a dose; começa com o peso do animal e é corrigido no
  -- curral, a cada etapa
  weight_kg    numeric(10, 2),
  primary key (aplicacao_id, animal_id)
);

create index if not exists idx_animal_protocolo_aplicacao_animais_animal
  on public.animal_protocolo_aplicacao_animais(animal_id);

-- ── 4) A dose aplicada vira tratamento, ligado à etapa ──────────────────────
alter table public.animal_treatments
  add column if not exists protocolo_aplicacao_id uuid
    references public.animal_protocolo_aplicacoes(id) on delete set null,
  add column if not exists protocolo_dia integer;

create index if not exists idx_animal_treatments_protocolo
  on public.animal_treatments(protocolo_aplicacao_id, protocolo_dia);

comment on column public.animal_treatments.protocolo_aplicacao_id is
  'A programação de protocolo que gerou este tratamento (migration 108). Junto com protocolo_dia diz qual etapa já foi aplicada.';

-- ── RLS: lê quem está logado, escreve quem manda no módulo Animais ──────────
alter table public.animal_medicamentos                enable row level security;
alter table public.animal_protocolos                  enable row level security;
alter table public.animal_protocolo_itens             enable row level security;
alter table public.animal_protocolo_aplicacoes        enable row level security;
alter table public.animal_protocolo_aplicacao_animais enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'animal_medicamentos',
    'animal_protocolos',
    'animal_protocolo_itens',
    'animal_protocolo_aplicacoes',
    'animal_protocolo_aplicacao_animais'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for select using (auth.uid() is not null)',
      t || '_read', t
    );
    execute format(
      'create policy %I on public.%I for all using (public.user_can_write_module(''animais'')) with check (public.user_can_write_module(''animais''))',
      t || '_write', t
    );
  end loop;
end $$;
