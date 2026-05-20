import { createClient } from "@/lib/supabase/server";
import { NotasFiscaisClient } from "@/components/notas-fiscais/notas-fiscais-client";
import type { Category, CostCenter, Invoice } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NotasFiscaisPage() {
  const supabase = createClient();

  const [invoicesRes, categoriesRes, costCentersRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.from("categories").select("*").order("name"),
    supabase.from("cost_centers").select("*").eq("active", true).order("name"),
  ]);

  return (
    <NotasFiscaisClient
      invoices={(invoicesRes.data as Invoice[]) ?? []}
      categories={(categoriesRes.data as Category[]) ?? []}
      costCenters={(costCentersRes.data as CostCenter[]) ?? []}
    />
  );
}
