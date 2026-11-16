-- ============================================================================
-- PRODUMAR — PERFIL 'vaqueiro_n1' (VAQUEIRO NÍVEL 01): SÓ OS BOVINOS
-- ============================================================================
-- Execute no SQL Editor do Supabase. São DUAS execuções:
--   PARTE 1 sozinha primeiro, depois a PARTE 2 numa nova execução.
-- Pode rodar de novo sem problema. Rodar DEPOIS da 145.
-- ============================================================================
-- Por que:
--
--   O dono pediu "um outro tipo de usuário, vaqueiro nível 01, onde ele terá
--   acesso à parte de animais somente de bovinos". É diferente do 'vaqueiro'
--   (048), que só manda o nascimento pelo celular: este entra na tela de
--   Animais e trabalha no rebanho — vacina, pesa, trata, lança parto, confere
--   o nascimento, aplica protocolo, separa em lote, marca desmame.
--
--   Mas só no gado. Equino, caprino, ovino, suíno, peixe e ave não existem
--   para ele: nem na tela, nem no banco. A tela já esconde; aqui o banco
--   garante, para que ninguém veja ou grave outro tipo nem chamando a API na
--   mão.
--
--   Onde o dono não disse, ficou o mais fechado:
--     • não EXCLUI animal;
--     • não dá SAÍDA (venda ou morte) nem desfaz saída;
--     • não vê dinheiro: despesas, vendas de lote e a Ficha ficam fechadas;
--     • não mexe nos CADASTROS (raças, vacinas, remédios, protocolos e o
--       protocolo do nascimento) — usa os que o patrão montou.
--
-- Como:
--
--   As políticas de hoje (leitura para todo logado, escrita para quem tem o
--   módulo 'animais') ficam como estão. Por cima delas entram políticas
--   RESTRITIVAS — o Postgres exige que a linha passe nas permissivas E nas
--   restritivas. Para quem não é vaqueiro_n1 a restritiva é sempre verdadeira
--   e nada muda; para ele, só passa linha de bovino.
--
--   Tipo vazio (species null) conta como bovino, como na tela (speciesOf).
-- ============================================================================

-- ============================================================================
-- PARTE 1 — o valor novo no enum (rode SOZINHA e depois rode a PARTE 2)
-- ============================================================================
alter type user_role add value if not exists 'vaqueiro_n1';

-- ============================================================================
-- PARTE 2 — o que ele pode e o que ele não pode
-- ============================================================================

-- ── 1. Grava no módulo de animais ──────────────────────────────────────────
-- Mesmo corpo da 143, com uma linha a mais. O papel é comparado como TEXTO
-- (mesmo truque da 060/079/104/143) para não esbarrar no enum recém-criado.
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
        or (p.role::text = 'vaqueiro_n1' and module_slug = 'animais')
      )
  );
$$;

comment on function public.user_can_write_module(text) is
  'Pode gravar neste módulo? admin/financeiro sempre; operador e encarregado só nos módulos liberados no perfil; prefeitura só no módulo prefeitura (104); chacaras só no módulo chacaras (143); vaqueiro_n1 só no módulo animais, e só bovino (146).';

-- ── 2. As duas perguntas que as políticas fazem ────────────────────────────
-- security definer: leem profiles/animals sem passar pelo RLS (senão a
-- política de animals perguntaria a animals, em círculo).
create or replace function public.eh_vaqueiro_n1()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text = 'vaqueiro_n1'
  );
$$;

comment on function public.eh_vaqueiro_n1() is
  'O usuário logado é Vaqueiro nível 01 (só bovinos)? Migration 146.';

create or replace function public.animal_e_bovino(p_animal_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.animals a
    where a.id = p_animal_id and coalesce(a.species::text, 'bovino') = 'bovino'
  );
$$;

comment on function public.animal_e_bovino(uuid) is
  'Este animal é bovino (tipo vazio conta como bovino)? Usado pelo RLS do vaqueiro_n1 (146).';

-- ── 3. Só bovino: ver E gravar ─────────────────────────────────────────────
do $$
declare
  t text;
  cond text;
  -- tabelas com o tipo na própria linha
  com_tipo text[] := array[
    'animals', 'animal_breeds', 'animal_vaccines', 'animal_birth_requests',
    'animal_grupos', 'animal_medicamentos', 'animal_protocolos',
    'animal_protocolo_aplicacoes', 'animal_protocolo_nascimento',
    'animal_protocolo_pendencias'
  ];
  -- tabelas penduradas num animal
  com_animal text[] := array[
    'animal_photos', 'animal_treatments', 'animal_vaccinations',
    'animal_vaccine_pending', 'animal_weights', 'animal_pesos_foto',
    'animal_grupo_animais', 'animal_protocolo_aplicacao_animais'
  ];
  -- dinheiro e criação por tanque (peixe e ave): fechadas para ele
  fechadas text[] := array[
    'animal_despesas', 'animal_vendas', 'animal_tanques', 'animal_lotes',
    'animal_lote_movimentos'
  ];
begin
  foreach t in array com_tipo || com_animal || fechadas || array['animal_births', 'animal_protocolo_itens'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tabela % não existe — pulada', t;
      continue;
    end if;

    if t = any(com_tipo) then
      cond := 'coalesce(species::text, ''bovino'') = ''bovino''';
    elsif t = any(com_animal) then
      cond := 'public.animal_e_bovino(animal_id)';
    elsif t = 'animal_births' then
      cond := 'public.animal_e_bovino(coalesce(mother_id, calf_animal_id))';
    elsif t = 'animal_protocolo_itens' then
      cond := 'exists (select 1 from public.animal_protocolos p where p.id = protocolo_id and coalesce(p.species::text, ''bovino'') = ''bovino'')';
    else
      cond := 'false';
    end if;

    execute format('drop policy if exists %I on public.%I', 'vaqueiro_n1_so_bovino', t);
    execute format(
      'create policy %I on public.%I as restrictive for all using (not (select public.eh_vaqueiro_n1()) or %s) with check (not (select public.eh_vaqueiro_n1()) or %s)',
      'vaqueiro_n1_so_bovino', t, cond, cond
    );
  end loop;
end $$;

-- ── 4. Cadastros: ele usa, não mexe ────────────────────────────────────────
-- Raças, vacinas, remédios, protocolos e o protocolo do nascimento são do
-- patrão. Leitura continua (é por eles que ele vacina e aplica).
do $$
declare
  t text;
  cadastros text[] := array[
    'animal_breeds', 'animal_vaccines', 'animal_medicamentos',
    'animal_protocolos', 'animal_protocolo_itens', 'animal_protocolo_nascimento'
  ];
begin
  foreach t in array cadastros loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists %I on public.%I', 'vaqueiro_n1_cadastro_ins', t);
    execute format('drop policy if exists %I on public.%I', 'vaqueiro_n1_cadastro_upd', t);
    execute format('drop policy if exists %I on public.%I', 'vaqueiro_n1_cadastro_del', t);
    execute format(
      'create policy %I on public.%I as restrictive for insert with check (not (select public.eh_vaqueiro_n1()))',
      'vaqueiro_n1_cadastro_ins', t
    );
    execute format(
      'create policy %I on public.%I as restrictive for update using (not (select public.eh_vaqueiro_n1()))',
      'vaqueiro_n1_cadastro_upd', t
    );
    execute format(
      'create policy %I on public.%I as restrictive for delete using (not (select public.eh_vaqueiro_n1()))',
      'vaqueiro_n1_cadastro_del', t
    );
  end loop;
end $$;

-- ── 5. Não exclui animal ───────────────────────────────────────────────────
drop policy if exists "vaqueiro_n1_nao_exclui" on public.animals;
create policy "vaqueiro_n1_nao_exclui" on public.animals
  as restrictive for delete
  using (not (select public.eh_vaqueiro_n1()));

-- ── 6. Não dá saída (venda/morte) nem desfaz ───────────────────────────────
-- A saída é um UPDATE nas colunas exit_* / sale_* / active, e política não
-- compara o antes com o depois — por isso um gatilho.
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
       or new.exit_transaction_id is not null then
      raise exception 'Vaqueiro nível 01 não lança saída de animal.'
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
    raise exception 'Vaqueiro nível 01 não dá saída nem desfaz saída de animal.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists vaqueiro_n1_sem_saida on public.animals;
create trigger vaqueiro_n1_sem_saida
  before insert or update on public.animals
  for each row execute function public.vaqueiro_n1_sem_saida();

-- ============================================================================
-- CONFERIR
-- ============================================================================
--   select enum_range(null::user_role);                       -- tem vaqueiro_n1
--   select tablename, policyname from pg_policies
--    where policyname like 'vaqueiro_n1%' order by 1, 2;      -- 26 tabelas+
--
-- DEPOIS DE RODAR
--   Em Configurações → Usuários, crie a pessoa com o perfil "Vaqueiro nível 01".
-- ============================================================================
