-- ============================================================================
-- Produmar Finance — Backfill: recebíveis dos empréstimos antigos
-- ============================================================================
-- Execute no SQL Editor do Supabase APÓS rodar 006, 007 e 008.
--
-- Gera os recebíveis (transações de entrada pendentes) dos empréstimos criados
-- ANTES da migration 008, para que apareçam em "A receber".
--
-- IDEMPOTENTE: pode rodar mais de uma vez sem duplicar.
--  • Parcela já paga no modelo antigo → reaproveita o recebimento existente
--    (não cria duplicado).
--  • Parcela em aberto → cria recebível pendente.
--  • Avulso → cria um recebível único = saldo em aberto.
-- ============================================================================

do $$
declare
  v_cat_id      uuid;
  v_loan        record;
  v_inst        record;
  v_total       numeric;
  v_paid        numeric;
  v_outstanding numeric;
  v_tx_id       uuid;
  v_existing_tx uuid;
  v_paid_date   date;
begin
  select id into v_cat_id
    from public.categories
    where name = 'Recebimento de empréstimo' and type = 'entrada'
    limit 1;

  for v_loan in
    select * from public.loans where status <> 'cancelado'
  loop
    if v_loan.repayment_type = 'parcelado' then
      ----------------------------------------------------------------------
      -- Parcelado: um recebível por parcela ainda sem vínculo
      ----------------------------------------------------------------------
      for v_inst in
        select * from public.loan_installments
        where loan_id = v_loan.id and transaction_id is null
        order by number
      loop
        if v_inst.paid then
          -- Reaproveita o recebimento que já existe (modelo antigo), se houver
          select transaction_id into v_existing_tx
            from public.loan_payments
            where installment_id = v_inst.id and transaction_id is not null
            limit 1;

          if v_existing_tx is not null then
            update public.loan_installments
              set transaction_id = v_existing_tx where id = v_inst.id;
          else
            select payment_date into v_paid_date
              from public.loan_payments where installment_id = v_inst.id
              order by payment_date limit 1;

            insert into public.transactions
              (type, description, amount, due_date, paid_date, status, category_id, created_by)
            values
              ('entrada',
               'A RECEBER EMPRÉSTIMO #' || v_loan.loan_number || ' - ' || v_loan.borrower_name
                 || ' (parcela ' || v_inst.number || '/' || coalesce(v_loan.installments_count, 0) || ')',
               v_inst.amount, v_inst.due_date, coalesce(v_paid_date, v_inst.due_date),
               'recebido', v_cat_id, v_loan.created_by)
            returning id into v_tx_id;

            update public.loan_installments set transaction_id = v_tx_id where id = v_inst.id;
          end if;
        else
          -- Parcela em aberto → recebível pendente
          insert into public.transactions
            (type, description, amount, due_date, status, category_id, created_by)
          values
            ('entrada',
             'A RECEBER EMPRÉSTIMO #' || v_loan.loan_number || ' - ' || v_loan.borrower_name
               || ' (parcela ' || v_inst.number || '/' || coalesce(v_loan.installments_count, 0) || ')',
             v_inst.amount, v_inst.due_date, 'pendente', v_cat_id, v_loan.created_by)
          returning id into v_tx_id;

          update public.loan_installments set transaction_id = v_tx_id where id = v_inst.id;
        end if;
      end loop;

    else
      ----------------------------------------------------------------------
      -- Avulso: recebível único = saldo em aberto (se ainda não tem)
      ----------------------------------------------------------------------
      if v_loan.receivable_transaction_id is null then
        v_total := v_loan.principal
          + v_loan.principal * (coalesce(v_loan.interest_rate, 0) / 100.0) * coalesce(v_loan.term_months, 0);

        select coalesce(sum(amount), 0) into v_paid
          from public.loan_payments where loan_id = v_loan.id;

        v_outstanding := greatest(0, v_total - v_paid);

        if v_outstanding > 0.005 then
          insert into public.transactions
            (type, description, amount, due_date, status, category_id, created_by)
          values
            ('entrada',
             'A RECEBER EMPRÉSTIMO #' || v_loan.loan_number || ' - ' || v_loan.borrower_name,
             v_outstanding, coalesce(v_loan.due_date, v_loan.loan_date), 'pendente', v_cat_id, v_loan.created_by)
          returning id into v_tx_id;

          update public.loans set receivable_transaction_id = v_tx_id where id = v_loan.id;
        end if;
      end if;
    end if;
  end loop;
end $$;
