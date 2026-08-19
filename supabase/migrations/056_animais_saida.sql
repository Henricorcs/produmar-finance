-- ============================================================================
-- ILNET Finance — Animais: SAÍDA DO REBANHO (venda ou morte)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS da migration 047 (é ela que deixou a v_animals do jeito de hoje).
-- ============================================================================
-- Por que:
--   Boi vendido ou boi morto não pode sumir do sistema — ele SAI do rebanho.
--   A coluna `active` (que já existia desde a 041) passa a ser escrita: quem
--   saiu fica com active = false e guarda o motivo, a data e, na venda, o
--   valor e o comprador.
--
--   VENDA: o valor vira ENTRADA no financeiro na mesma hora (categoria
--   "Venda de animais", já recebida). O id do lançamento fica em
--   exit_transaction_id — é por ele que a tela desfaz a saída e apaga o
--   dinheiro junto, quando alguém dá baixa no animal errado.
--
--   MORTE: nada vai para o financeiro. Só a data e a observação (o que houve).
-- ============================================================================

-- ── ENUM: motivo da saída ────────────────────────────────────────────────────
do $$ begin
  create type animal_exit_reason as enum ('venda', 'morte');
exception
  when duplicate_object then null;
end $$;

-- ── animals: as colunas da saída (nulas = animal no rebanho) ─────────────────
alter table public.animals
  add column if not exists exit_reason animal_exit_reason,
  add column if not exists exit_date   date,
  add column if not exists exit_amount numeric(12, 2) not null default 0,
  add column if not exists exit_buyer  text,
  add column if not exists exit_notes  text,
  add column if not exists exit_transaction_id uuid
    references public.transactions(id) on delete set null;

create index if not exists idx_animals_exit_date on public.animals(exit_date desc);

-- ── Categoria do financeiro onde a venda cai ─────────────────────────────────
insert into public.categories (name, type, color, icon)
select 'Venda de animais', 'entrada', '#15803D', 'beef'
where not exists (
  select 1 from public.categories
  where name = 'Venda de animais' and type = 'entrada'
);

-- ============================================================================
-- VIEW: v_animals — recriada para trazer as colunas novas
-- ============================================================================
-- O `a.*` da view foi expandido coluna a coluna quando ela foi criada, e
-- `create or replace view` só aceita acrescentar coluna NO FIM — por isso o
-- drop. É a mesma view da 047, sem nenhuma mudança de lógica.
-- ============================================================================
drop view if exists public.v_animals;

create view public.v_animals
with (security_invoker = on) as
select
  a.*,
  br.name as breed_name,
  ag.age_months,
  case
    when ag.age_months is not null and ag.age_months < 12 then 'bezerro'
    when a.sex = 'macho'                                  then 'boi'
    else                                                       'vaca'
  end as category,
  vs.vaccines_total,
  vs.vaccines_ok,
  (vs.vaccines_total - vs.vaccines_ok) as vaccines_due
from public.animals a
left join public.animal_breeds br on br.id = a.breed_id
-- idade em meses cheios
left join lateral (
  select case
    when a.birth_date is null then null
    else (extract(year  from age(current_date, a.birth_date)) * 12
        + extract(month from age(current_date, a.birth_date)))::int
  end as age_months
) ag on true
-- vacinação: para cada vacina cadastrada, o animal está em dia?
--   em dia = já aplicada e (dose única ou o reforço ainda não venceu)
left join lateral (
  select
    count(*)::int as vaccines_total,
    (count(*) filter (
      where z.last_app is not null
        and (
          coalesce(z.rec, 0) = 0
          or z.last_app + make_interval(months => z.rec) > current_date
        )
    ))::int as vaccines_ok
  from (
    select
      av.recurrence_months as rec,
      (
        select max(x.applied_at)
        from public.animal_vaccinations x
        where x.animal_id = a.id and x.vaccine_id = av.id
      ) as last_app
    from public.animal_vaccines av
  ) z
) vs on true;
