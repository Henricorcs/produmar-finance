-- A conta contrato da energia do imóvel (Equatorial). Não é o número da
-- instalação (power_code): é o número que a procuração de troca de titularidade
-- pede. Guardado aqui, a procuração feita de um contrato de aluguel já vem com ele.
alter table public.rental_properties add column if not exists power_account text;

comment on column public.rental_properties.power_account is
  'Conta contrato da energia (Equatorial) — vai na procuração de titularidade.';
