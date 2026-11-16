-- ============================================================================
-- PRODUMAR — ANIMAIS: ALERTA DE DESCARTE
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE NOVO sem estragar nada.
--
-- Rodar depois da 146 (perfil vaqueiro nível 01).
-- ============================================================================
-- Por que:
--
--   O dono pediu: "cria um alerta de animal para descarte, onde eu informo e
--   deve aparecer este alerta". Na ficha do animal ele marca "Para descarte"
--   (com o motivo, se quiser) e o animal passa a aparecer no alerta da aba
--   Rebanho e no sino do topo, até ser tirado do descarte ou sair do rebanho
--   (venda ou morte).
--
--   Quem marca é o patrão. O Vaqueiro nível 01 VÊ o alerta (é ele quem separa
--   o animal no curral), mas não marca nem tira — o gatilho da 146 passa a
--   barrar também estas duas colunas.
--
-- Nada é apagado: entram duas colunas novas, opcionais.
-- ============================================================================

alter table public.animals add column if not exists descarte_em date;
alter table public.animals add column if not exists descarte_motivo text;

comment on column public.animals.descarte_em is
  'Dia em que o animal foi marcado para descarte. Vazio = não está para descarte (147).';
comment on column public.animals.descarte_motivo is
  'Por que vai ser descartado (idade, não emprenha, problema de casco...). Opcional (147).';

-- ── O vaqueiro nível 01 não marca nem tira o descarte ──────────────────────
-- Mesmo gatilho da 146, com as duas colunas novas na comparação.
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
      raise exception 'Vaqueiro nível 01 não lança saída nem descarte de animal.'
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

  if row(new.descarte_em, new.descarte_motivo)
     is distinct from
     row(old.descarte_em, old.descarte_motivo) then
    raise exception 'Vaqueiro nível 01 não marca nem tira o descarte de animal.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- A v_animals é recriada para enxergar as colunas novas (o `a.*` é resolvido
-- na criação da view). Mesma definição da 145, sem mudança de regra.
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
