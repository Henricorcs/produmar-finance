-- ============================================================================
-- ILNET Finance — DIARISTAS: meia diária
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- Rodar DEPOIS da migration 059.
-- ============================================================================
-- Por que:
--   Nem todo dia é dia inteiro: o cara vem de manhã, resolve o serviço e vai
--   embora. Isso é meia diária — vale metade e continua sendo um dia que ele
--   veio, com a descrição dele.
--
--   `daily_rate` continua sendo O QUE SE PAGA NAQUELE DIA: na meia diária o
--   valor JÁ ENTRA PELA METADE. É de propósito — assim toda soma que já existe
--   (a view abaixo, o relatório, o fechamento do mês) continua certa sem
--   precisar lembrar de dividir em algum lugar. Esquecer de dividir é pagar a
--   mais, e isso não pode depender de ninguém lembrar.
--
--   `half_day` então é só a MARCA: é ela que pinta o dia de amarelo no
--   calendário e escreve "meia diária" no relatório.
-- ============================================================================

alter table public.diarista_dias
  add column if not exists half_day boolean not null default false;

-- ============================================================================
-- VIEW: v_diaristas (a mesma da 059, agora contando as meias)
-- ============================================================================
drop view if exists public.v_diaristas;
create view public.v_diaristas
with (security_invoker = on) as
select
  d.*,
  coalesce(t.days_count, 0)      as days_count,
  coalesce(t.half_days_count, 0) as half_days_count,
  coalesce(t.total_value, 0)     as total_value,
  t.last_work_date
from public.diaristas d
left join lateral (
  select
    count(*)                                   as days_count,
    count(*) filter (where x.half_day)         as half_days_count,
    coalesce(sum(x.daily_rate), 0)             as total_value,
    max(x.work_date)                           as last_work_date
  from public.diarista_dias x
  where x.diarista_id = d.id
) t on true;
