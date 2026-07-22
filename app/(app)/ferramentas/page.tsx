import { createClient } from "@/lib/supabase/server";
import { FerramentasPageClient } from "@/components/ferramentas/ferramentas-page-client";
import type { Obra, ToolUnit, ToolWithStatus } from "@/lib/types";
import type {
  LoanRow,
  MaintenanceRow,
  WriteoffRow,
} from "@/components/ferramentas/ferramentas-page-client";

export const dynamic = "force-dynamic";

export default async function FerramentasPage() {
  const supabase = createClient();

  const [toolsRes, loansRes, maintenanceRes, writeoffsRes, unitsRes, obrasRes] =
    await Promise.all([
      supabase.from("v_tool_status").select("*").order("name", { ascending: true }),
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
      supabase
        .from("tool_writeoffs")
        .select("*, tools(name, code, unit, unit_value, replacement_value)")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase.from("tool_units").select("*").order("name", { ascending: true }),
      supabase.from("obras").select("*").eq("active", true).order("name"),
    ]);

  return (
    <FerramentasPageClient
      tools={(toolsRes.data as ToolWithStatus[]) ?? []}
      loans={(loansRes.data as LoanRow[]) ?? []}
      maintenance={(maintenanceRes.data as MaintenanceRow[]) ?? []}
      writeoffs={(writeoffsRes.data as WriteoffRow[]) ?? []}
      units={(unitsRes.data as ToolUnit[]) ?? []}
      obras={(obrasRes.data as Obra[]) ?? []}
    />
  );
}
