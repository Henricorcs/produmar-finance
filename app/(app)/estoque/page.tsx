import { createClient } from "@/lib/supabase/server";
import { EstoquePageClient } from "@/components/estoque/estoque-page-client";
import type {
  PickupLocation,
  Product,
  ProductStockBalance,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function EstoquePage() {
  const supabase = createClient();

  const [balanceRes, productsRes, locationsRes, purchasesRes, movementsRes] =
    await Promise.all([
      supabase
        .from("product_stock_balance")
        .select("*")
        .order("name", { ascending: true }),
      supabase.from("products").select("*").eq("active", true).order("name"),
      supabase.from("pickup_locations").select("*").eq("active", true).order("name"),
      supabase
        .from("material_purchases")
        .select(
          "*, pickup_locations(name), material_purchase_items(*, products(name)), transactions(id, status)"
        )
        .order("purchase_date", { ascending: false })
        .order("purchase_number", { ascending: false })
        .limit(100),
      supabase
        .from("stock_movements")
        .select("*, products(name, unit), pickup_locations(name)")
        .order("movement_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

  return (
    <EstoquePageClient
      balance={(balanceRes.data as ProductStockBalance[]) ?? []}
      products={(productsRes.data as Product[]) ?? []}
      jazidas={(locationsRes.data as PickupLocation[]) ?? []}
      purchases={purchasesRes.data ?? []}
      movements={movementsRes.data ?? []}
    />
  );
}
