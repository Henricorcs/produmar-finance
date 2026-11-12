import { createClient } from "@/lib/supabase/server";
import { DevedoresPageClient } from "@/components/devedores/devedores-page-client";
import type { Loan, LoanInstallment, LoanPayment, LoanAttachment, LoanBoleto } from "@/lib/types";

export const dynamic = "force-dynamic";

export type LoanWithDetails = Loan & {
  loan_payments: LoanPayment[];
  loan_installments: LoanInstallment[];
  loan_attachments: LoanAttachment[];
  /** Os boletos da dívida (migration 139) — vazio enquanto ela não roda. */
  loan_boletos: LoanBoleto[];
};

export default async function DevedoresPage() {
  const supabase = createClient();

  const [{ data }, boletosRes] = await Promise.all([
    supabase
      .from("loans")
      .select("*, loan_payments(*), loan_installments(*), loan_attachments(*)")
      .order("loan_date", { ascending: false })
      .order("loan_number", { ascending: false }),
    // À parte, e não no select de cima: sem a migration 139 a tabela não existe
    // e o select inteiro cairia — aqui só os boletos vêm vazios.
    supabase.from("loan_boletos").select("*").order("due_date", { ascending: true }),
  ]);

  const boletos = boletosRes.error ? [] : ((boletosRes.data as LoanBoleto[]) ?? []);
  const loans = ((data as Omit<LoanWithDetails, "loan_boletos">[]) ?? []).map((l) => ({
    ...l,
    loan_boletos: boletos.filter((b) => b.loan_id === l.id),
  }));

  return <DevedoresPageClient loans={loans} />;
}
