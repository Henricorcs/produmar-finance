-- NASCIMENTO DO VAQUEIRO: FOTO DA MÃE, CARACTERÍSTICAS E PROTOCOLO PENDENTE
--
-- 1) O vaqueiro passa a mandar DUAS fotos: a do filhote (photo_path, como
--    sempre) e a da MÃE (mother_photo_path). Ao lançar no rebanho, a da mãe
--    entra na ficha da mãe e a do filhote na ficha dele.
-- 2) Ele escreve as CARACTERÍSTICAS do bezerro (pinta na testa, mancha no
--    lombo...) — ao lançar, vira a observação da ficha da cria.
-- 3) O protocolo do nascimento deixa de TRAVAR o envio: o que ele não marcou
--    como aplicado vira PENDÊNCIA DELE (animal_protocolo_pendencias). Ela
--    aparece na tela do vaqueiro até ele aplicar e tocar em "Apliquei". A
--    pendência vive à parte da solicitação porque a solicitação some quando o
--    patrão lança o bezerro — e a pendência tem que continuar lá.

alter table public.animal_birth_requests add column if not exists mother_photo_path text;
alter table public.animal_birth_requests add column if not exists caracteristicas text;

comment on column public.animal_birth_requests.mother_photo_path is
  'Foto da mãe tirada pelo vaqueiro — vai para a ficha da mãe ao lançar.';
comment on column public.animal_birth_requests.caracteristicas is
  'Características da cria escritas pelo vaqueiro (pinta na testa...).';

create table if not exists public.animal_protocolo_pendencias (
  id               uuid primary key default gen_random_uuid(),
  -- o envio de onde veio; fica nulo depois que o patrão lança (o envio some)
  birth_request_id uuid references public.animal_birth_requests(id) on delete set null,
  -- a cria já no rebanho — preenchido quando o patrão lança o nascimento
  calf_animal_id   uuid references public.animals(id) on delete set null,
  mother_tag       text,
  species          text,
  calf_sex         text,
  birth_date       date,
  medicine         text not null,
  dose             text,
  -- nulo = ainda pendente
  applied_at       date,
  applied_by       uuid references auth.users(id),
  created_by       uuid references auth.users(id) default auth.uid(),
  created_at       timestamptz not null default now()
);

create index if not exists animal_protocolo_pendencias_abertas
  on public.animal_protocolo_pendencias (created_by)
  where applied_at is null;
create index if not exists animal_protocolo_pendencias_envio
  on public.animal_protocolo_pendencias (birth_request_id);

alter table public.animal_protocolo_pendencias enable row level security;

drop policy if exists "animal_protocolo_pendencias_read"   on public.animal_protocolo_pendencias;
drop policy if exists "animal_protocolo_pendencias_insert" on public.animal_protocolo_pendencias;
drop policy if exists "animal_protocolo_pendencias_update" on public.animal_protocolo_pendencias;
drop policy if exists "animal_protocolo_pendencias_delete" on public.animal_protocolo_pendencias;

-- leitura: qualquer logado (igual ao resto do módulo Animais)
create policy "animal_protocolo_pendencias_read" on public.animal_protocolo_pendencias
  for select using (auth.uid() is not null);

-- quem cria é o envio do vaqueiro (ou o admin testando)
create policy "animal_protocolo_pendencias_insert" on public.animal_protocolo_pendencias
  for insert with check (public.current_user_role() in ('vaqueiro', 'admin'));

-- dar baixa: o próprio vaqueiro que deixou pendente, ou quem cuida do rebanho
create policy "animal_protocolo_pendencias_update" on public.animal_protocolo_pendencias
  for update using (created_by = auth.uid() or public.user_can_write_module('animais'));

create policy "animal_protocolo_pendencias_delete" on public.animal_protocolo_pendencias
  for delete using (public.user_can_write_module('animais'));
