import { createClient } from "@/lib/supabase/server";
import { FerramentasPageClient } from "@/components/ferramentas/ferramentas-page-client";
import type { Obra, ToolWithStatus } from "@/lib/types";
import type { LoanRow, MaintenanceRow } from "@/components/ferramentas/ferramentas-page-client";

export const dynamic = "force-dynamic";

export default async function FerramentasPage() {
  const supabase = createClient();

  const [toolsRes, loansRes, maintenanceRes, obrasRes] = await Promise.all([
    supabase
      .from("v_tool_status")
      .select("*")
      .order("name", { ascending: true }),
    supabase
      .from("tool_loans")
      .select("*, tools(name, code)")
      .order("checked_out_at", { ascending: false })
      .limit(200),
    supabase
      .from("tool_maintenance")
      .select("*, tools(name, code)")
      .order("started_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("obras").select("*").eq("active", true).order("name"),
  ]);

  return (
    <FerramentasPageClient
      tools={(toolsRes.data as ToolWithStatus[]) ?? []}
      loans={(loansRes.data as LoanRow[]) ?? []}
      maintenance={(maintenanceRes.data as MaintenanceRow[]) ?? []}
      obras={(obrasRes.data as Obra[]) ?? []}
    />
  );
}
