import { createClient } from "@/lib/supabase/server";
import { AlmoxarifadoPageClient } from "@/components/almoxarifado/almoxarifado-page-client";
import type { SupplyCategory, SupplyItemWithStock } from "@/lib/types";
import type { MovementRow } from "@/components/almoxarifado/almoxarifado-page-client";

export const dynamic = "force-dynamic";

export default async function AlmoxarifadoPage() {
  const supabase = createClient();

  const [itemsRes, movementsRes, categoriesRes] = await Promise.all([
    supabase.from("v_supply_stock").select("*").order("name", { ascending: true }),
    supabase
      .from("supply_movements")
      .select("*, supply_items(name, unit)")
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("supply_categories").select("*").order("name", { ascending: true }),
  ]);

  return (
    <AlmoxarifadoPageClient
      items={(itemsRes.data as SupplyItemWithStock[]) ?? []}
      movements={(movementsRes.data as MovementRow[]) ?? []}
      categories={(categoriesRes.data as SupplyCategory[]) ?? []}
    />
  );
}
