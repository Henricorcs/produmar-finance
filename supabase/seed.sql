-- ============================================================================
-- SEED de dados de exemplo (opcional - rode depois do schema.sql)
-- ============================================================================
-- Útil pra testar com dados parecidos com os do mockup
-- ============================================================================

-- Contatos exemplo
insert into public.contacts (name, document, is_supplier, is_customer) values
  ('Telxius', '11111111000111', true, false),
  ('Energisa Maranhão', '22222222000122', true, false),
  ('Imobiliária Santos', '33333333000133', true, false),
  ('Cliente Exemplo 1', '44444444000144', false, true),
  ('Cliente Exemplo 2', '55555555000155', false, true)
on conflict (document) do nothing;

-- Transações exemplo (próximos vencimentos)
do $$
declare
  cat_infra uuid := (select id from public.categories where name = 'Infraestrutura de rede');
  cat_aluguel uuid := (select id from public.categories where name = 'Aluguel e energia');
  cat_folha uuid := (select id from public.categories where name = 'Folha de pagamento');
  cat_mensal uuid := (select id from public.categories where name = 'Mensalidades clientes');
  cc_oper uuid := (select id from public.cost_centers where name = 'Operacional');
  cc_adm uuid := (select id from public.cost_centers where name = 'Administrativo');
  c_telxius uuid := (select id from public.contacts where name = 'Telxius');
  c_energisa uuid := (select id from public.contacts where name = 'Energisa Maranhão');
  c_imob uuid := (select id from public.contacts where name = 'Imobiliária Santos');
begin
  -- Despesas pendentes
  insert into public.transactions (type, description, amount, due_date, status, category_id, cost_center_id, contact_id)
  values
    ('saida', 'Link IP dedicado', 8200.00, current_date + 1, 'pendente', cat_infra, cc_oper, c_telxius),
    ('saida', 'Conta de energia - sede', 4890.00, current_date + 3, 'pendente', cat_aluguel, cc_adm, c_energisa),
    ('saida', 'Aluguel sede', 6500.00, current_date + 7, 'pendente', cat_aluguel, cc_adm, c_imob),
    ('saida', 'Folha quinzena', 18450.00, current_date + 12, 'pendente', cat_folha, cc_adm, null);

  -- Despesas pagas no mês (pra alimentar os KPIs)
  insert into public.transactions (type, description, amount, due_date, paid_date, status, category_id, cost_center_id)
  select 'saida', 'Despesa exemplo infra ' || g, 5000 + random()*3000, current_date - g, current_date - g, 'pago', cat_infra, cc_oper
  from generate_series(1, 8) g;

  -- Receitas recebidas no mês
  insert into public.transactions (type, description, amount, due_date, paid_date, status, category_id, cost_center_id)
  select 'entrada', 'Mensalidade lote ' || g, 15000 + random()*5000, current_date - g, current_date - g, 'recebido', cat_mensal, cc_oper
  from generate_series(1, 20) g;
end $$;
