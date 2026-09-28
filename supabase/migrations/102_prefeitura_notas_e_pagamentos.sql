-- ============================================================================
-- PRODUMAR — PREFEITURA: AS NOTAS EMITIDAS PARA CADA SECRETARIA E A BAIXA
-- ============================================================================
-- Execute no SQL Editor do Supabase (Painel → Editor SQL → Nova consulta →
-- cole tudo → Executar). PODE RODAR DE UMA VEZ SÓ, e pode rodar de novo.
--
-- Depende da 039/079 (a função user_can_write_module).
-- ============================================================================
-- Por que:
--
--   O controle das notas da prefeitura morava numa planilha: uma coluna por
--   secretaria, com o nº da nota, a data, o valor e o "OK" de quando a
--   prefeitura pagou. Funcionava, mas ninguém sabia de cara QUANTO a
--   prefeitura estava devendo nem DESDE QUANDO — e a data do pagamento não
--   ficava registrada, só o OK.
--
--   Aqui cada secretaria tem o seu controle, igual à planilha, e cada nota
--   ganha a DATA DA BAIXA: o dia em que o dinheiro entrou.
--
--   Este módulo NÃO lança nada no caixa. É controle, como Devedores.
-- ============================================================================

create table if not exists public.prefeitura_secretarias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  -- o TOTAL do contrato, que ficava no pé da coluna da planilha (opcional)
  valor_contrato numeric(14,2),
  -- o valor que a nota costuma ter (1.200, 3.400...): já vem preenchido
  valor_padrao numeric(14,2),
  ordem int not null default 0,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.prefeitura_notas (
  id uuid primary key default gen_random_uuid(),
  secretaria_id uuid not null references public.prefeitura_secretarias(id) on delete cascade,
  numero text not null,
  data_emissao date not null,
  valor numeric(14,2) not null check (valor > 0),
  -- pendente = emitida e esperando; pago = deu baixa; cancelada = não conta
  situacao text not null default 'pendente'
    check (situacao in ('pendente', 'pago', 'cancelada')),
  -- o dia em que a prefeitura pagou. Nota paga sempre tem data.
  data_baixa date,
  observacao text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint prefeitura_notas_baixa_com_data
    check (situacao <> 'pago' or data_baixa is not null)
);

create index if not exists prefeitura_notas_secretaria_idx
  on public.prefeitura_notas (secretaria_id, data_emissao);

alter table public.prefeitura_secretarias enable row level security;
alter table public.prefeitura_notas enable row level security;

drop policy if exists "prefeitura_secretarias_read"  on public.prefeitura_secretarias;
drop policy if exists "prefeitura_secretarias_write" on public.prefeitura_secretarias;
create policy "prefeitura_secretarias_read" on public.prefeitura_secretarias
  for select using (auth.uid() is not null);
create policy "prefeitura_secretarias_write" on public.prefeitura_secretarias
  for all using (public.user_can_write_module('prefeitura'))
  with check (public.user_can_write_module('prefeitura'));

drop policy if exists "prefeitura_notas_read"  on public.prefeitura_notas;
drop policy if exists "prefeitura_notas_write" on public.prefeitura_notas;
create policy "prefeitura_notas_read" on public.prefeitura_notas
  for select using (auth.uid() is not null);
create policy "prefeitura_notas_write" on public.prefeitura_notas
  for all using (public.user_can_write_module('prefeitura'))
  with check (public.user_can_write_module('prefeitura'));

comment on table public.prefeitura_notas is
  'Notas emitidas para a prefeitura, uma secretaria por controle, com a data da baixa do pagamento. Não mexe no caixa (migration 102).';

-- ============================================================================
-- AS SECRETARIAS DA PLANILHA — só na primeira vez (tabela vazia)
-- ============================================================================
insert into public.prefeitura_secretarias (nome, valor_contrato, valor_padrao, ordem)
select v.nome, v.valor_contrato, v.valor_padrao, v.ordem
from (values
  ('SECRETARIA DE ADMINISTRAÇÃO',                   330000.00, 1200.00,  1),
  ('SECRETARIA MUNICIPAL DE SAÚDE - FMS',             30000.00, 1200.00,  2),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS',                  60000.00, 1200.00,  3),
  ('SECRETARIA MUNICIPAL DE ASSISTÊNCIA SOCIAL',      30000.00, 1200.00,  4),
  ('FUNDO MUNICIPAL DE ASSISTÊNCIA SOCIAL',           60000.00, 1200.00,  5),
  ('SEC DE EDUCAÇÃO - QSE',                           75000.00, 1200.00,  6),
  ('SEC DE EDUCAÇÃO REDE DE ENS FUND',                    null, 1200.00,  7),
  ('FUNDO MUNICIPAL DE SAÚDE - FMS CONTR DE NOTAS',       null, 5991.67,  8),
  ('CONTR DE NOTAS INTERNET - ASSISTÊNCIA SOCIAL',        null, 3400.00,  9),
  ('CONTR DE NOTAS INTERNET - EDUCAÇÃO',                  null, 3400.00, 10),
  ('CONTR DE NOTAS INTERNET - SAÚDE',                     null, 3400.00, 11),
  ('CONTR DE NOTAS INTERNET - ADM',                       null, 3400.00, 12)
) as v(nome, valor_contrato, valor_padrao, ordem)
where not exists (select 1 from public.prefeitura_secretarias);

-- ============================================================================
-- DEPOIS DE RODAR
-- ============================================================================
--   O módulo "Prefeitura" aparece no hub para o admin. Para liberar a outra
--   pessoa, marque "Prefeitura" no cadastro do usuário (Configurações).
-- ============================================================================
