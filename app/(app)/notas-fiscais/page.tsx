import { createClient } from "@/lib/supabase/server";
import { NotasFiscaisClient } from "@/components/notas-fiscais/notas-fiscais-client";
import type { Category, CostCenter, Invoice, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NotasFiscaisPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [invoicesRes, categoriesRes, costCentersRes, profileRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("*")
      .order("issue_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("categories").select("*").order("name"),
    supabase.from("cost_centers").select("*").eq("active", true).order("name"),
    supabase
      .from("profiles")
      .select("role")
      .eq("id", user!.id)
      .single<Pick<Profile, "role">>(),
  ]);

  const canManage = profileRes.data?.role === "admin";

  return (
    <NotasFiscaisClient
      invoices={(invoicesRes.data as Invoice[]) ?? []}
      categories={(categoriesRes.data as Category[]) ?? []}
      costCenters={(costCentersRes.data as CostCenter[]) ?? []}
      canManage={canManage}
    />
  );
}
