import { createClient } from "@/lib/supabase/server";
import { DevedoresPageClient } from "@/components/devedores/devedores-page-client";
import type { Loan, LoanInstallment, LoanPayment, LoanAttachment } from "@/lib/types";

export const dynamic = "force-dynamic";

export type LoanWithDetails = Loan & {
  loan_payments: LoanPayment[];
  loan_installments: LoanInstallment[];
  loan_attachments: LoanAttachment[];
};

export default async function DevedoresPage() {
  const supabase = createClient();

  const { data } = await supabase
    .from("loans")
    .select("*, loan_payments(*), loan_installments(*), loan_attachments(*)")
    .order("loan_date", { ascending: false })
    .order("loan_number", { ascending: false });

  return <DevedoresPageClient loans={(data as LoanWithDetails[]) ?? []} />;
}
