-- ============================================================================
-- PRODUMAR — PERFIL 'tecnico_abcz' (TÉCNICO ABCZ): SÓ O GADO PO
-- ============================================================================
-- Execute no SQL Editor do Supabase. São DUAS execuções:
--   PARTE 1 sozinha primeiro, depois a PARTE 2 numa nova execução.
-- Pode rodar de novo sem problema. Rodar DEPOIS da 152.
-- ============================================================================
-- Por que:
--
--   O dono pediu "um usuário com acesso somente à tela do gado Nelore PO, com
--   o nome técnico ABCZ". É o técnico da associação que confere o registro, a
--   genealogia e a pesagem do gado puro de origem.
--
--   Ele entra na tela de Animais já no grupo "Gado PO" e não sai dali: o gado
--   comum (e qualquer outro tipo de animal) não existe para ele — nem na tela,
--   nem no banco.
--
--   Onde o dono não disse, ficou o mais fechado, igual ao Vaqueiro nível 01:
--     • não EXCLUI animal;
--     • não dá SAÍDA (venda ou morte), nem marca descarte;
--     • não vê dinheiro: despesas, vendas de lote e a Ficha ficam fechadas;
--     • não mexe nos CADASTROS (raças, vacinas, remédios, protocolos);
--     • não confere os nascimentos que o vaqueiro manda pelo celular.
--
-- Como:
--
--   O Técnico ABCZ é o Vaqueiro nível 01 com mais uma trava. A função
--   eh_vaqueiro_n1() (146) passa a responder SIM também para ele — e com isso
--   todas as travas da 146 e da 147 valem para ele sem repetir nada. Por cima
--   entra outra política RESTRITIVA: só passa linha de animal de raça PO
--   (o mesmo critério da tela: "NELORE PO", "GIR P.O.", "GUZERÁ (PO)").
--
--   No parto conta se a mãe OU a cria for PO: o bezerro PO de barriga de
--   aluguel (receptora comum) continua aparecendo para ele.
-- ============================================================================

-- ============================================================================
-- PARTE 1 — o valor novo no enum (rode SOZINHA e depois rode a PARTE 2)
-- ============================================================================
alter type user_role add value if not exists 'tecnico_abcz';

-- ============================================================================
-- PARTE 2 — o que ele pode e o que ele não pode
-- ============================================================================

-- ── 1. Grava no módulo de animais ──────────────────────────────────────────
-- Mesmo corpo da 146, com uma linha a mais (papel comparado como TEXTO).
create or replace function public.user_can_write_module(module_slug text)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (
        p.role::text in ('admin', 'financeiro')
        or (
          p.role::text in ('operador', 'encarregado')
          and module_slug = any(coalesce(p.allowed_modules, '{}'))
        )
        or (p.role::text = 'prefeitura' and module_slug = 'prefeitura')
        or (p.role::text = 'chacaras' and module_slug = 'chacaras')
        or (p.role::text in ('vaqueiro_n1', 'tecnico_abcz') and module_slug = 'animais')
      )
  );
$$;

comment on function public.user_can_write_module(text) is
  'Pode gravar neste módulo? admin/financeiro sempre; operador e encarregado só nos módulos liberados no perfil; prefeitura só no módulo prefeitura (104); chacaras só no módulo chacaras (143); vaqueiro_n1 só no módulo animais, e só bovino (146); tecnico_abcz só no módulo animais, e só gado PO (153).';

-- ── 2. As travas da 146/147 valem para ele também ──────────────────────────
create or replace function public.eh_vaqueiro_n1()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text in ('vaqueiro_n1', 'tecnico_abcz')
  );
$$;

comment on function public.eh_vaqueiro_n1() is
  'O usuário logado tem o acesso fechado no gado (Vaqueiro nível 01, 146, ou Técnico ABCZ, 153)? Só bovino, sem excluir, sem saída, sem dinheiro e sem mexer nos cadastros.';

-- O gatilho da 147 dizia "Vaqueiro nível 01" no recado — agora serve aos dois.
create or replace function public.vaqueiro_n1_sem_saida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.eh_vaqueiro_n1() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.active is false
       or new.exit_reason is not null
       or coalesce(new.exit_amount, 0) <> 0
       or new.exit_transaction_id is not null
       or new.descarte_em is not null then
      raise exception 'Este acesso não lança saída nem descarte de animal.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if row(new.active, new.exit_reason, new.exit_date, new.exit_amount,
         new.exit_buyer, new.exit_notes, new.exit_transaction_id,
         new.sale_mode, new.sale_weight_kg, new.sale_price_per_kg)
     is distinct from
     row(old.active, old.exit_reason, old.exit_date, old.exit_amount,
         old.exit_buyer, old.exit_notes, old.exit_transaction_id,
         old.sale_mode, old.sale_weight_kg, old.sale_price_per_kg) then
    raise exception 'Este acesso não dá saída nem desfaz saída de animal.'
      using errcode = '42501';
  end if;

  if row(new.descarte_em, new.descarte_motivo)
     is distinct from
     row(old.descarte_em, old.descarte_motivo) then
    raise exception 'Este acesso não marca nem tira o descarte de animal.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ── 3. As perguntas que as políticas novas fazem ───────────────────────────
create or replace function public.eh_tecnico_abcz()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text = 'tecnico_abcz'
  );
$$;

comment on function public.eh_tecnico_abcz() is
  'O usuário logado é Técnico ABCZ (só gado PO)? Migration 153.';

-- Mesma regra do ehRacaPO da tela: "PO", "P.O." ou "(PO)" como palavra solta.
create or replace function public.nome_de_raca_po(p_nome text)
returns boolean
language sql
immutable
as $$
  select coalesce(btrim(p_nome), '') ~* '(^|[[:space:](])P\.?[[:space:]]*O\.?($|[[:space:])])';
$$;

comment on function public.nome_de_raca_po(text) is
  'O nome da raça é de gado PO ("NELORE PO", "GIR P.O.", "GUZERÁ (PO)")? Migration 153.';

create or replace function public.raca_e_po(p_breed_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.animal_breeds b
    where b.id = p_breed_id
      and coalesce(b.species::text, 'bovino') = 'bovino'
      and public.nome_de_raca_po(b.name)
  );
$$;

comment on function public.raca_e_po(uuid) is
  'Esta raça é de gado PO (bovino)? Usado pelo RLS do tecnico_abcz (153).';

create or replace function public.animal_e_po(p_animal_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.animals a
    where a.id = p_animal_id
      and coalesce(a.species::text, 'bovino') = 'bovino'
      and public.raca_e_po(a.breed_id)
  );
$$;

comment on function public.animal_e_po(uuid) is
  'Este animal é do gado PO? Usado pelo RLS do tecnico_abcz (153).';

-- ── 4. Só gado PO: ver E gravar ────────────────────────────────────────────
do $$
declare
  t text;
  cond text;
  -- tabelas penduradas num animal
  com_animal text[] := array[
    'animal_photos', 'animal_treatments', 'animal_vaccinations',
    'animal_vaccine_pending', 'animal_weights', 'animal_pesos_foto',
    'animal_grupo_animais', 'animal_protocolo_aplicacao_animais'
  ];
  -- os nascimentos que o vaqueiro manda pelo celular: conferir é do patrão
  fechadas text[] := array['animal_birth_requests', 'animal_protocolo_pendencias'];
begin
  foreach t in array array['animals', 'animal_breeds', 'animal_births'] || com_animal || fechadas loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tabela % não existe — pulada', t;
      continue;
    end if;

    if t = 'animals' then
      cond := 'public.raca_e_po(breed_id)';
    elsif t = 'animal_breeds' then
      cond := 'public.nome_de_raca_po(name)';
    elsif t = 'animal_births' then
      cond := '(public.animal_e_po(mother_id) or public.animal_e_po(calf_animal_id))';
    elsif t = any(com_animal) then
      cond := 'public.animal_e_po(animal_id)';
    else
      cond := 'false';
    end if;

    execute format('drop policy if exists %I on public.%I', 'tecnico_abcz_so_po', t);
    execute format(
      'create policy %I on public.%I as restrictive for all using (not (select public.eh_tecnico_abcz()) or %s) with check (not (select public.eh_tecnico_abcz()) or %s)',
      'tecnico_abcz_so_po', t, cond, cond
    );
  end loop;
end $$;

-- ============================================================================
-- CONFERIR
-- ============================================================================
--   select enum_range(null::user_role);                       -- tem tecnico_abcz
--   select tablename from pg_policies
--    where policyname = 'tecnico_abcz_so_po' order by 1;       -- 13 tabelas
--   select name, public.nome_de_raca_po(name) from animal_breeds order by 1;
--
-- DEPOIS DE RODAR
--   Em Configurações → Usuários, crie a pessoa com o perfil "Técnico ABCZ".
-- ============================================================================
