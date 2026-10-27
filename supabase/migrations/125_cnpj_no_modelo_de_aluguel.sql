-- O modelo do contrato de aluguel saía com o CNPJ da PRODUMAR errado na
-- Cláusula Terceira (55.837.469/0001-27). O certo é 55.837.468/0001-27.
update public.rental_contract_templates
   set body = replace(body, '55.837.469/0001-27', '55.837.468/0001-27'),
       updated_at = now()
 where body like '%55.837.469/0001-27%';
