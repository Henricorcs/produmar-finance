-- ============================================================================
-- ILNET Finance — Sincroniza pagamento da conta a pagar com a compra de material
-- ============================================================================
-- Execute no SQL Editor do Supabase (Dashboard → SQL Editor → New Query → Run)
-- ============================================================================
-- Problema: ao quitar a conta a pagar de uma compra DIRETO no módulo Contas,
-- o "amount_paid" da compra não atualizava — o estoque continuava mostrando
-- saldo devedor. Este gatilho mantém os dois lados em sincronia.
--
-- Regra: quando uma transação vinculada a uma compra muda de status/valor:
--   • status = 'pago'  → compra fica totalmente paga (amount_paid = total)
--   • caso contrário   → amount_paid = total − valor ainda em aberto
-- ============================================================================

create or replace function public.sync_material_purchase_payment()
returns trigger
language plpgsql
as $$
begin
  update public.material_purchases mp
  set amount_paid = case
        when new.status = 'pago' then mp.total_amount
        else greatest(0, mp.total_amount - coalesce(new.amount, 0))
      end
  where mp.transaction_id = new.id;
  return null;
end;
$$;

drop trigger if exists trg_sync_material_purchase_payment on public.transactions;
create trigger trg_sync_material_purchase_payment
  after update of status, amount on public.transactions
  for each row execute function public.sync_material_purchase_payment();

-- ----------------------------------------------------------------------------
-- BACKFILL — alinha compras cujas contas já foram pagas/alteradas no passado
-- ----------------------------------------------------------------------------
update public.material_purchases mp
set amount_paid = case
      when t.status = 'pago' then mp.total_amount
      else greatest(0, mp.total_amount - coalesce(t.amount, 0))
    end
from public.transactions t
where mp.transaction_id = t.id;
