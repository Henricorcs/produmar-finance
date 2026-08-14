-- ============================================================================
-- ILNET Finance — Perfil 'vaqueiro' (tela própria de nascimento de bezerro)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS das migrations 041 a 047 (módulo Animais).
-- ============================================================================
-- Por que:
--   O vaqueiro é um usuário de baixíssima permissão, só de celular, que só
--   pode fazer UMA coisa: registrar o nascimento de um bezerro (foto, data
--   automática, número da mãe, sexo). Ele não pode ver nem editar mais nada
--   do sistema — nem o resto do rebanho.
--
--   Por isso ele NÃO entra em user_can_write_module('animais') (migration
--   039): esse helper libera INSERT/UPDATE/DELETE no módulo inteiro, e um
--   vaqueiro com isso poderia editar ou apagar qualquer animal. Em vez
--   disso, a escrita dele passa só pela função register_calf_birth abaixo —
--   ela mesma confere a permissão e é a ÚNICA porta de entrada. O papel
--   'vaqueiro' não recebe nenhum grant direto de tabela.
--
--   Leitura das fêmeas (para escolher a mãe) já funciona sem mudar nada:
--   "animals_read" (migration 041) já libera SELECT para qualquer usuário
--   autenticado.
-- ============================================================================

-- ============================================================================
-- PARTE 1: adicionar 'vaqueiro' ao enum user_role
-- IMPORTANTE: ALTER TYPE ... ADD VALUE precisa ser commitado antes de ser
-- usado na função abaixo. Rode esta parte sozinha primeiro, depois rode a
-- PARTE 2 em uma nova execução do SQL Editor.
-- ============================================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'vaqueiro';

-- ============================================================================
-- PARTE 2: função que registra o nascimento (mãe + bezerro + foto)
-- Rode esta parte em uma SEGUNDA execução do SQL Editor, depois da PARTE 1.
-- ============================================================================

create or replace function public.register_calf_birth(
  p_mother_id uuid,
  p_calf_tag text,
  p_calf_sex animal_sex,
  p_birth_date date,
  p_photo_path text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role       user_role;
  v_mother_sex animal_sex;
  v_species    text;
  v_breed_id   uuid;
  v_calf_tag   text;
  v_calf_id    uuid;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null or v_role not in ('vaqueiro', 'admin') then
    raise exception 'Sem permissão para registrar nascimento';
  end if;

  if p_mother_id is null then
    raise exception 'Selecione a mãe';
  end if;
  if p_calf_sex is null then
    raise exception 'Informe o sexo do bezerro';
  end if;
  if p_birth_date is null then
    raise exception 'Informe a data do nascimento';
  end if;

  v_calf_tag := upper(btrim(coalesce(p_calf_tag, '')));
  if v_calf_tag = '' then
    raise exception 'Informe o número do bezerro';
  end if;

  -- a cria puxa da mãe o tipo e a raça (mesma regra de createBirth() na tela de Animais)
  select sex, species, breed_id into v_mother_sex, v_species, v_breed_id
  from public.animals
  where id = p_mother_id;

  if not found then
    raise exception 'Mãe não encontrada';
  end if;
  if v_mother_sex <> 'femea' then
    raise exception 'A mãe selecionada não é fêmea';
  end if;

  insert into public.animals (tag, sex, species, birth_date, breed_id, created_by)
  values (v_calf_tag, p_calf_sex, coalesce(v_species, 'bovino'), p_birth_date, v_breed_id, auth.uid())
  returning id into v_calf_id;

  insert into public.animal_births
    (mother_id, birth_date, calf_tag, calf_sex, calf_animal_id, notes, created_by)
  values
    (p_mother_id, p_birth_date, v_calf_tag, p_calf_sex, v_calf_id, nullif(btrim(coalesce(p_notes, '')), ''), auth.uid());

  if p_photo_path is not null then
    insert into public.animal_photos (animal_id, path, created_by)
    values (v_calf_id, p_photo_path, auth.uid());

    update public.animals set photo_path = p_photo_path where id = v_calf_id;
  end if;

  return v_calf_id;
end;
$$;

grant execute on function public.register_calf_birth(uuid, text, animal_sex, date, text, text) to authenticated;
