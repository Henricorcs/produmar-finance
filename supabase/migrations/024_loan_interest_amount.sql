-- Juros fixo em R$ para empréstimos sem prazo definido
-- Alternativa ao modelo de taxa % × meses: o usuário informa diretamente
-- o valor dos juros cobrado, sem precisar especificar taxa ou prazo.
alter table public.loans
  add column if not exists interest_amount numeric(14, 2);
