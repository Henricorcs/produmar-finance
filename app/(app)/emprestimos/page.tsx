import { createClient } from "@/lib/supabase/server";
import { EmprestimosPageClient } from "@/components/emprestimos/emprestimos-page-client";
import type { Loan, LoanInstallment, LoanPayment } from "@/lib/types";

export const dynamic = "force-dynamic";

export type LoanWithDetails = Loan & {
  loan_payments: LoanPayment[];
  loan_installments: LoanInstallment[];
};

export default async function EmprestimosPage() {
  const supabase = createClient();

  const { data } = await supabase
    .from("loans")
    .select("*, loan_payments(*), loan_installments(*)")
    .order("loan_date", { ascending: false })
    .order("loan_number", { ascending: false });

  return <EmprestimosPageClient loans={(data as LoanWithDetails[]) ?? []} />;
}
