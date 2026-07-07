import { createClient } from "@/lib/supabase/server";
import { ObrasPageClient } from "@/components/obras/obras-page-client";
import type { Contact, ObraItem, ObraSummary } from "@/lib/types";
import type {
  ObraTransactionRow,
  ObraServiceOrderRow,
  ObraToolLoanRow,
} from "@/components/obras/obras-page-client";

export const dynamic = "force-dynamic";

export default async function ObrasPage() {
  const supabase = createClient();

  const [obrasRes, contactsRes, itemsRes, transactionsRes, serviceOrdersRes, toolLoansRes] =
    await Promise.all([
      supabase
        .from("v_obra_summary")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("contacts")
        .select("*")
        .eq("is_customer", true)
        .order("name"),
      supabase
        .from("obra_items")
        .select("*")
        .order("item_date", { ascending: false })
        .limit(2000),
      supabase
        .from("transactions")
        .select("id, type, description, amount, due_date, status, obra_id")
        .not("obra_id", "is", null)
        .order("due_date", { ascending: false })
        .limit(500),
      supabase
        .from("service_orders")
        .select("id, order_number, type, status, total_amount, client_name, obra_id")
        .not("obra_id", "is", null)
        .order("issue_date", { ascending: false })
        .limit(500),
      supabase
        .from("tool_loans")
        .select("id, borrower_name, destination, checked_out_at, returned_at, obra_id, tools(name, code)")
        .not("obra_id", "is", null)
        .order("checked_out_at", { ascending: false })
        .limit(500),
    ]);

  return (
    <ObrasPageClient
      obras={(obrasRes.data as ObraSummary[]) ?? []}
      contacts={(contactsRes.data as Contact[]) ?? []}
      items={(itemsRes.data as ObraItem[]) ?? []}
      transactions={(transactionsRes.data as ObraTransactionRow[]) ?? []}
      serviceOrders={(serviceOrdersRes.data as ObraServiceOrderRow[]) ?? []}
      toolLoans={(toolLoansRes.data as unknown as ObraToolLoanRow[]) ?? []}
    />
  );
}
