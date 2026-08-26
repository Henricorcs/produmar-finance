import { createClient } from "@/lib/supabase/server";
import { ObrasPageClient } from "@/components/obras/obras-page-client";
import type {
  Contact,
  ObraItem,
  ObraSummary,
  SupplyFenceRunView,
  SupplyObraSector,
  SupplyObraUsage,
} from "@/lib/types";
import type {
  ObraTransactionRow,
  ObraServiceOrderRow,
  ObraToolLoanRow,
} from "@/components/obras/obras-page-client";
import type { SupplyItemCost } from "@/components/obras/estoque-obra-detail-dialog";

export const dynamic = "force-dynamic";

export default async function ObrasPage() {
  const supabase = createClient();

  const [
    obrasRes,
    contactsRes,
    itemsRes,
    transactionsRes,
    serviceOrdersRes,
    toolLoansRes,
    supplyObrasRes,
    supplySectorsRes,
    supplyCostsRes,
    supplyFenceRes,
  ] = await Promise.all([
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
    // ── Obras DO ESTOQUE (supply_obras) — a aba que veio do módulo Estoque ──
    // migration 051: sem ela a aba fica vazia e o resto da tela segue igual
    supabase.from("v_supply_obra_usage").select("*").order("name", { ascending: true }),
    // setores de cada obra (migration 057 — sem ela volta vazio e a tela segue igual)
    supabase.from("supply_obra_sectors").select("*").order("name", { ascending: true }),
    // só o custo médio de cada material: é ele que transforma a quantidade que
    // saiu em dinheiro. O catálogo inteiro não precisa vir para esta tela.
    supabase.from("v_supply_stock").select("id, avg_unit_cost"),
    // metros de cerca com o preço já resolvido (migration 063)
    supabase
      .from("v_supply_fence_runs")
      .select("*")
      .order("work_date", { ascending: false })
      .limit(1000),
  ]);

  return (
    <ObrasPageClient
      obras={(obrasRes.data as ObraSummary[]) ?? []}
      contacts={(contactsRes.data as Contact[]) ?? []}
      items={(itemsRes.data as ObraItem[]) ?? []}
      transactions={(transactionsRes.data as ObraTransactionRow[]) ?? []}
      serviceOrders={(serviceOrdersRes.data as ObraServiceOrderRow[]) ?? []}
      toolLoans={(toolLoansRes.data as unknown as ObraToolLoanRow[]) ?? []}
      supplyObras={(supplyObrasRes.data as SupplyObraUsage[]) ?? []}
      supplySectors={(supplySectorsRes.data as SupplyObraSector[]) ?? []}
      supplyCosts={(supplyCostsRes.data as SupplyItemCost[]) ?? []}
      supplyFenceRuns={(supplyFenceRes.data as SupplyFenceRunView[]) ?? []}
    />
  );
}
