-- ============================================================================
-- PRODUMAR — ALIMENTAÇÃO: quanto custa cada refeição (R$ 15,00)
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Por que:
--
--   A Alimentação (migration 154) contava as refeições; o dono quer o custo do
--   mês em reais. Cada refeição custa R$ 15,00 hoje.
--
--   O valor fica GRAVADO EM CADA REFEIÇÃO, no dia em que ela é marcada. Se o
--   preço do bandeco mudar, troca-se o valor atual (alimentacao_config) e os
--   meses que já passaram continuam com o custo que tiveram.
--
-- Nada é apagado. Rodar de novo não quebra.
-- ============================================================================

-- o valor de cada refeição marcada (as que já existem ficam com R$ 15,00)
alter table public.alimentacao_refeicoes
  add column if not exists valor numeric(10, 2) not null default 15
    check (valor >= 0);

comment on column public.alimentacao_refeicoes.valor is
  'Quanto custou esta refeição — o valor da refeição no dia em que foi marcada (migration 155).';

-- ----------------------------------------------------------------------------
-- O valor atual da refeição: uma linha só
-- ----------------------------------------------------------------------------
create table if not exists public.alimentacao_config (
  id int primary key default 1 check (id = 1),
  valor_refeicao numeric(10, 2) not null default 15 check (valor_refeicao >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.alimentacao_config (id, valor_refeicao) values (1, 15)
on conflict (id) do nothing;

comment on table public.alimentacao_config is
  'O valor atual de cada refeição do bandeco; entra em cada refeição marcada daqui para frente (migration 155).';

alter table public.alimentacao_config enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'alimentacao_config' and policyname = 'alimentacao_config_read') then
    create policy "alimentacao_config_read" on public.alimentacao_config
      for select using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'alimentacao_config' and policyname = 'alimentacao_config_write') then
    create policy "alimentacao_config_write" on public.alimentacao_config
      for all
      using (public.user_can_write_module('diaristas'))
      with check (public.user_can_write_module('diaristas'));
  end if;
end $$;
