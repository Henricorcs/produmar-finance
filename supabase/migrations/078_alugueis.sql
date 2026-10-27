-- ============================================================================
-- PRODUMAR — MÓDULO ALUGUÉIS: imóveis, contratos e o aluguel de cada mês
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Por que:
--
--   Os imóveis alugados não tinham lugar nenhum no sistema. O contrato ficava
--   numa pasta, o vencimento na cabeça e o "fulano já pagou?" numa conversa de
--   WhatsApp. Este módulo põe as três coisas juntas:
--
--   1) O IMÓVEL. Cadastro com o endereço completo e um CÓDIGO que o sistema dá
--      sozinho, na ordem de cadastro (1, 2, 3...). É por ele que se fala do
--      imóvel sem precisar soletrar o endereço inteiro.
--
--   2) O CONTRATO. Quem é o inquilino, o fiador, quanto é o aluguel, em que dia
--      vence, quando começa e quando acaba. Com esses dados a tela IMPRIME o
--      contrato de vocês, preenchido — o modelo fica guardado aqui e os campos
--      são trocados na hora da impressão.
--
--   3) O ALUGUEL DO MÊS. A cobrança de cada mês NÃO é criada de véspera: ela
--      nasce da conta do contrato (o dia do vencimento + o valor). O que fica
--      gravado é a BAIXA — quando o inquilino pagou, quanto e como. Assim não
--      existe cobrança fantasma para apagar quando um contrato muda de valor
--      ou termina no meio do mês.
--
--   IMPORTANTE: como no resto do sistema (obra, animais, frota), o que se lança
--   aqui NÃO vira lançamento no módulo Contas. É registro e relatório dentro de
--   Aluguéis.
--
-- Nada é apagado: entram quatro tabelas e uma view. Rodar de novo não quebra.
-- ============================================================================

-- ============================================================================
-- TABELA: rental_properties (o imóvel)
-- ============================================================================
create table if not exists public.rental_properties (
  id uuid primary key default uuid_generate_v4(),

  -- O CÓDIGO do imóvel, na ordem de cadastro. Quem gera é o banco: assim dois
  -- cadastros ao mesmo tempo nunca recebem o mesmo número.
  code serial not null unique,

  -- como a casa é chamada no dia a dia ("CASA DA FRENTE", "SALA 02")
  name text,

  -- casa, apartamento, ponto, galpao, terreno, outro
  kind text not null default 'casa',

  -- o endereço, separado porque é assim que ele entra no contrato
  street     text,
  number     text,
  complement text,
  district   text,
  city       text,
  state      text,
  zip        text,

  -- o que o contrato costuma pedir e ninguém acha na hora
  registration text,  -- matrícula do imóvel no cartório
  iptu_code    text,  -- inscrição do IPTU
  water_code   text,  -- instalação da água
  power_code   text,  -- instalação da luz

  notes  text,
  active boolean not null default true,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rental_properties_active
  on public.rental_properties(active);

comment on table public.rental_properties is
  'Imóvel para alugar, com código sequencial na ordem de cadastro.';

-- ============================================================================
-- TABELA: rental_contracts (o contrato de locação)
-- ============================================================================
-- Um imóvel pode ter vários contratos ao longo do tempo (inquilino que sai,
-- outro que entra). O ATIVO é o que manda na cobrança do mês.
create table if not exists public.rental_contracts (
  id uuid primary key default uuid_generate_v4(),

  property_id uuid not null references public.rental_properties(id) on delete cascade,

  -- ── o inquilino ───────────────────────────────────────────────────────────
  tenant_name           text not null,
  tenant_document       text,  -- CPF ou CNPJ
  tenant_rg             text,   -- com o órgão emissor: 326785949 SEJUSP MA
  tenant_birthplace     text,   -- naturalidade, que o contrato pede
  tenant_nationality    text,
  tenant_marital_status text,
  tenant_profession     text,
  tenant_phone          text,
  tenant_email          text,
  tenant_address        text,  -- onde ele morava antes

  -- ── o fiador (quando tem) ────────────────────────────────────────────────
  guarantor_name     text,
  guarantor_document text,
  guarantor_rg       text,
  guarantor_phone    text,
  guarantor_address  text,

  -- ── o dinheiro ───────────────────────────────────────────────────────────
  monthly_amount numeric(12, 2) not null default 0 check (monthly_amount >= 0),
  -- o dia do mês em que vence. 31 num mês curto cai no último dia — a conta é
  -- feita na tela.
  due_day int not null default 5 check (due_day between 1 and 31),
  deposit_amount   numeric(12, 2) not null default 0 check (deposit_amount >= 0),
  late_fee_percent numeric(5, 2),   -- multa por atraso
  interest_percent numeric(5, 2),   -- juros ao mês
  readjust_index   text,            -- IGP-M, IPCA...

  -- ── o prazo ──────────────────────────────────────────────────────────────
  start_date date not null default current_date,
  end_date   date,
  months     int,                   -- prazo em meses (30, 12...)

  purpose    text,                  -- residencial | comercial
  signed_at  date,                  -- data da assinatura
  forum_city text,                  -- foro eleito

  -- ativo = é ele que gera a cobrança do mês; encerrado = história
  status text not null default 'ativo',

  notes text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.rental_contracts drop constraint if exists rental_contracts_status_check;
alter table public.rental_contracts add constraint rental_contracts_status_check
  check (status in ('ativo', 'encerrado'));

create index if not exists idx_rental_contracts_property
  on public.rental_contracts(property_id);
create index if not exists idx_rental_contracts_status
  on public.rental_contracts(status);

comment on table public.rental_contracts is
  'Contrato de locação de um imóvel: inquilino, fiador, valor, vencimento e prazo.';

-- ============================================================================
-- TABELA: rental_payments (a baixa do aluguel de um mês)
-- ============================================================================
-- Uma linha por CONTRATO + MÊS DE REFERÊNCIA. A linha só existe quando há o
-- que registrar: o pagamento (ou um acerto anotado). O mês que ninguém pagou
-- não tem linha — ele aparece na tela como pendente/vencido, calculado do
-- contrato.
create table if not exists public.rental_payments (
  id uuid primary key default uuid_generate_v4(),

  contract_id uuid not null references public.rental_contracts(id) on delete cascade,

  -- o mês de referência, sempre no dia 1 ("o aluguel de setembro")
  competencia date not null,
  -- o vencimento daquele mês, do jeito que estava combinado
  due_date date not null,
  -- quanto era devido no mês (copiado do contrato: reajuste não muda o passado)
  amount numeric(12, 2) not null default 0 check (amount >= 0),

  -- a baixa
  paid_at     date,
  paid_amount numeric(12, 2) not null default 0 check (paid_amount >= 0),
  method      text,  -- PIX, DINHEIRO, TRANSFERÊNCIA, DEPÓSITO...

  notes text,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Um mês, um contrato, uma linha: dar baixa de novo CORRIGE, não duplica.
create unique index if not exists uq_rental_payments_mes
  on public.rental_payments(contract_id, competencia);

create index if not exists idx_rental_payments_venc
  on public.rental_payments(due_date desc);

comment on table public.rental_payments is
  'A baixa do aluguel de um mês: quando pagou, quanto e como.';

-- ============================================================================
-- TABELA: rental_contract_templates (o modelo do contrato de vocês)
-- ============================================================================
-- O texto do contrato com os campos entre chaves duplas. Na hora de imprimir,
-- cada campo é trocado pelo dado do contrato — é o que faz o contrato sair
-- preenchido em vez de ser digitado de novo a cada inquilino.
create table if not exists public.rental_contract_templates (
  id uuid primary key default uuid_generate_v4(),

  name text not null default 'Contrato de locação',
  body text not null default '',

  active boolean not null default true,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.rental_contract_templates is
  'Modelo do contrato de locação, com os campos {{ASSIM}} trocados na impressão.';

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Leitura: qualquer um logado. Escrita: quem manda no módulo Aluguéis.
alter table public.rental_properties         enable row level security;
alter table public.rental_contracts          enable row level security;
alter table public.rental_payments           enable row level security;
alter table public.rental_contract_templates enable row level security;

drop policy if exists "rental_properties_read"  on public.rental_properties;
drop policy if exists "rental_properties_write" on public.rental_properties;
create policy "rental_properties_read" on public.rental_properties
  for select using (auth.uid() is not null);
create policy "rental_properties_write" on public.rental_properties
  for all
  using (public.user_can_write_module('alugueis'))
  with check (public.user_can_write_module('alugueis'));

drop policy if exists "rental_contracts_read"  on public.rental_contracts;
drop policy if exists "rental_contracts_write" on public.rental_contracts;
create policy "rental_contracts_read" on public.rental_contracts
  for select using (auth.uid() is not null);
create policy "rental_contracts_write" on public.rental_contracts
  for all
  using (public.user_can_write_module('alugueis'))
  with check (public.user_can_write_module('alugueis'));

drop policy if exists "rental_payments_read"  on public.rental_payments;
drop policy if exists "rental_payments_write" on public.rental_payments;
create policy "rental_payments_read" on public.rental_payments
  for select using (auth.uid() is not null);
create policy "rental_payments_write" on public.rental_payments
  for all
  using (public.user_can_write_module('alugueis'))
  with check (public.user_can_write_module('alugueis'));

drop policy if exists "rental_contract_templates_read"  on public.rental_contract_templates;
drop policy if exists "rental_contract_templates_write" on public.rental_contract_templates;
create policy "rental_contract_templates_read" on public.rental_contract_templates
  for select using (auth.uid() is not null);
create policy "rental_contract_templates_write" on public.rental_contract_templates
  for all
  using (public.user_can_write_module('alugueis'))
  with check (public.user_can_write_module('alugueis'));

-- ============================================================================
-- VIEW: v_rental_contracts — o contrato com o imóvel e o que já foi recebido
-- ============================================================================
-- É o que a tela usa para montar a cobrança do mês sem precisar de três
-- consultas: o contrato, o endereço do imóvel e o resumo dos pagamentos.
-- ============================================================================
drop view if exists public.v_rental_contracts;

create view public.v_rental_contracts
with (security_invoker = on) as
select
  c.*,
  p.code                as property_code,
  p.name                as property_name,
  p.kind                as property_kind,
  p.street              as property_street,
  p.number              as property_number,
  p.complement          as property_complement,
  p.district            as property_district,
  p.city                as property_city,
  p.state               as property_state,
  p.zip                 as property_zip,
  p.registration        as property_registration,
  p.iptu_code           as property_iptu_code,
  p.water_code          as property_water_code,
  p.power_code          as property_power_code,
  p.active              as property_active,
  coalesce(r.pagos, 0)       as meses_pagos,
  coalesce(r.recebido, 0)    as total_recebido,
  r.ultimo_pagamento
from public.rental_contracts c
join public.rental_properties p on p.id = c.property_id
left join lateral (
  select
    count(*) filter (where x.paid_at is not null)::int as pagos,
    coalesce(sum(x.paid_amount), 0)                    as recebido,
    max(x.paid_at)                                     as ultimo_pagamento
  from public.rental_payments x
  where x.contract_id = c.id
) r on true;

-- ============================================================================
-- O MODELO DO CONTRATO DE VOCÊS
-- ============================================================================
-- O texto é o contrato que a PRODUMAR já usa, palavra por palavra. O que era
-- escrito à mão em vermelho virou CAMPO entre chaves duplas: na impressão cada
-- um é trocado pelo dado do contrato cadastrado.
--
--   {{INQUILINO_NOME}} {{INQUILINO_RG}} {{INQUILINO_CPF}}
--   {{INQUILINO_NATURALIDADE}} {{INQUILINO_ESTADO_CIVIL}} {{INQUILINO_PROFISSAO}}
--   {{INQUILINO_ENDERECO}}  {{IMOVEL_TIPO}}  {{IMOVEL_ENDERECO}}
--   {{PRAZO_MESES}} {{INICIO}} {{FIM}}  {{DIA_VENCIMENTO}}
--   {{ALUGUEL_VALOR}} {{ALUGUEL_EXTENSO}}  {{FINALIDADE}}
--   {{CIDADE_FORO}} {{ASSINATURA_DATA}}
--
-- A lista completa fica na própria tela (Aluguéis → Modelo do contrato), e o
-- texto pode ser corrigido por lá sem mexer no banco.
--
-- Duas coisas que ficaram como estavam no documento de vocês, para conferir:
--   • o CNPJ da locadora aparecia com dois números diferentes (…469/0001-27 no
--     cabeçalho e …489/0001-27 na cláusula terceira). Aqui os dois ficaram
--     …469/0001-27 — se o certo for o outro, é só corrigir na tela do modelo.
--   • a cláusula sexta falava em uso RESIDENCIAL mesmo num ponto comercial.
--     Ela virou {{FINALIDADE}}, que sai do próprio contrato cadastrado.
-- ============================================================================
insert into public.rental_contract_templates (name, body)
select
  'Contrato de locação',
  E'CONTRATO DE LOCAÇÃO\n\nLOCADOR: PRODUMAR SERVIÇOS LTDA, CNPJ nº 55.837.468/0001-27, situada na Av. Antônia Portela, Nº 40, Centro – São Mateus do Maranhão/MA, Cep.: 65470-000, neste ato representado pela sua sócia administradora Sra. Nilma Pereira da Costa portadora do RG nº 024907792003-6 SSPMA e CPF nº 022843973-60.\n\nLOCATÁRIO: {{INQUILINO_NOME}}, portador do RG n° {{INQUILINO_RG}}, e CPF n° {{INQUILINO_CPF}}, naturalidade {{INQUILINO_NATURALIDADE}}, {{INQUILINO_ESTADO_CIVIL}}, {{INQUILINO_PROFISSAO}}, residente e domiciliado na {{INQUILINO_ENDERECO}}.\n\nCLÁUSULA PRIMEIRA: O objeto deste contrato de locação é o imóvel, {{IMOVEL_TIPO}}, situado na {{IMOVEL_ENDERECO}}.\n\nCLÁUSULA SEGUNDA: O prazo da locação é de {{PRAZO_MESES}} meses, iniciando-se em {{INICIO}}, com término em {{FIM}}, independente de aviso, notificação ou interpelação judicial ou mesmo extrajudicial.\n\nPARÁGRAFO ÚNICO: Após 30 (trinta) dias, o LOCADOR pode pedir a desocupação do imóvel, e o locatário pode se retirar do imóvel sem que haja penalidades prevista na quebra de contrato, desde que cumprido o prazo mínimo de 30 (trinta) dias, sendo necessário o aviso prévio de 10 (dez) dias antes.\n\nCLÁUSULA TERCEIRA: O aluguel mensal, deverá ser pago até o dia {{DIA_VENCIMENTO}} de cada mês, via boleto bancário no valor de R$ {{ALUGUEL_VALOR}} ({{ALUGUEL_EXTENSO}}), fornecido pela LOCADORA favorecido PRODUMAR SERVIÇOS LTDA, CNPJ nº 55.837.468/0001-27, situada na Av. Antônia Portela, Nº 40, Centro – São Mateus do Maranhão/MA, Cep.: 65470-000.\n\nCLÁUSULA QUARTA: Em caso demora no pagamento do aluguel, será aplicada multa de 10% (dez por cento) sobre o valor devido e juros mensais de 2% (dois por cento) ao montante devido.\n\nCLÁUSULA QUINTA: Fica ao LOCATÁRIO, a responsabilidade em zelar pela conservação, limpeza do imóvel, efetuando as reformas necessárias para sua manutenção sendo que os gastos e pagamentos decorrentes da mesma correrão por conta do mesmo. O imóvel é locado com a mobília, eletrodomésticos e objetos descritos no Rol de Bens em Anexo, que fazem parte integrante deste contrato.\n\nO LOCATÁRIO está obrigado a devolver o imóvel em perfeitas condições de limpeza, conservação de pintura, parte hidráulica, pisos e azulejos, vidraças, trincos e fechaduras, quando finda ou rescindida esta avença.\n\nO LOCATÁRIO não poderá realizar obras que alterem ou modifiquem a estrutura do imóvel locado, sem prévia autorização por escrito do LOCADOR.\n\nCaso este consinta na realização das obras, estas ficarão desde logo, incorporadas ao imóvel, sem que assista ao LOCATÁRIO qualquer indenização pelas obras ou retenção por benfeitorias. As benfeitorias removíveis poderão ser retiradas, desde que não desfigurem o imóvel locado.\n\nPARÁGRAFO PRIMEIRO: O LOCATÁRIO declara receber o imóvel em perfeito estado de conservação, com pintura, parte hidráulica, pisos e azulejos, vidraças, trincos e fechaduras em perfeito estado e em perfeito funcionamento.\n\nPARÁGRAFO SEGUNDO: É de responsabilidade do LOCATÁRIO entregar o imóvel nas mesmas condições que o recebeu, pintado, sendo as despesas com a mão de obra de pintura e tinta de sua responsabilidade.\n\nPARÁGRAFO TERCEIRO: Resta acordado que, no ato da entrega das chaves do imóvel, o LOCATÁRIO efetuará a entrega, nas mesmas condições em que encontrou, de toda a mobília e eletrônicos elencados no rol em anexo, sob pena de indenização dos valores unitários de cada item que estiver em falta. O LOCADOR será também indenizado em relação aos móveis e eletrônicos que se encontrem danificado, salvo aqueles com desgastes pelo uso comum.\n\nCLÁUSULA SEXTA: O LOCATÁRIO declara que, o imóvel ora locado, destina-se única e exclusivamente para o seu uso {{FINALIDADE}}.\n\nCLÁUSULA SETIMA: O LOCATÁRIO não poderá sublocar, transferir ou ceder o imóvel, sendo nulo de pleno direito qualquer ato praticado com este fim sem o consentimento prévio e por escrito do LOCADOR.\n\nCLÁUSULA OITAVA: Em caso de sinistro parcial ou total do prédio, que impossibilite a habitação o imóvel locado, o presente contrato estará rescindido, independentemente de aviso ou interpelação judicial ou extrajudicial.\n\nCLÁUSULA NONA: É facultado ao LOCADOR vistoriar, por si ou seus procuradores, sempre que achar conveniente, para a certeza do cumprimento das obrigações assumidas neste contrato.\n\nCLÁUSULA DÉCIMA: A infração de qualquer das cláusulas do presente contrato, sujeita o infrator à multa de duas vezes o valor do aluguel, tomando-se por base, o último aluguel vencido.\n\nCLÁUSULA DÉCIMA PRIMEIRA: As partes contratantes obrigam-se por si, herdeiros e/ou sucessores, levando este Contrato para registro no Cartório de Títulos e Documentos, elegendo o Foro da Cidade de São Mateus do Maranhão/MA para a propositura de qualquer ação.\n\n{{CIDADE_FORO}}, {{ASSINATURA_DATA}}.\n\n[[ASSINATURAS]]'
where not exists (select 1 from public.rental_contract_templates);
