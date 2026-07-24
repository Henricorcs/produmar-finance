-- ============================================================================
-- ILNET Finance — Múltiplas fotos por patrimônio
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Antes cada patrimônio tinha UMA foto (tools.photo_path). Agora pode ter várias
-- em tool_photos. A coluna tools.photo_path é mantida como "foto principal"
-- (a primeira) para compatibilidade com telas/consultas existentes.
-- Depende de user_can_write_module() (migration 039).
-- ============================================================================

create table if not exists public.tool_photos (
  id         uuid primary key default uuid_generate_v4(),
  tool_id    uuid not null references public.tools(id) on delete cascade,
  path       text not null,                                  -- foto no bucket attachments
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tool_photos_tool_id on public.tool_photos(tool_id);

alter table public.tool_photos enable row level security;

drop policy if exists "tool_photos_read"  on public.tool_photos;
drop policy if exists "tool_photos_write" on public.tool_photos;
create policy "tool_photos_read"  on public.tool_photos for select using (auth.uid() is not null);
create policy "tool_photos_write" on public.tool_photos for all
  using (public.user_can_write_module('ferramentas'))
  with check (public.user_can_write_module('ferramentas'));

-- Backfill: leva a foto única já existente para a galeria (sem duplicar).
insert into public.tool_photos (tool_id, path, created_by, created_at)
select t.id, t.photo_path, t.created_by, t.created_at
from public.tools t
where t.photo_path is not null
  and not exists (
    select 1 from public.tool_photos tp
    where tp.tool_id = t.id and tp.path = t.photo_path
  );
