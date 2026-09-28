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
-- DEPOIS DE RODAR
-- ============================================================================
--   As secretarias e as notas da planilha entram pela 103 (aba INTERNET).
--   O módulo "Prefeitura" aparece no hub para o admin. Para liberar a outra
--   pessoa, marque "Prefeitura" no cadastro do usuário (Configurações).
-- ============================================================================
