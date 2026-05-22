import { createClient } from "@/lib/supabase/server";
import { OperacoesPageClient } from "@/components/operacoes/operacoes-page-client";
import type {
  Category,
  CostCenter,
  Machine,
  PickupLocation,
  Product,
  ServiceOrder,
  ServiceOrderItem,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type ServiceOrderWithDetails = ServiceOrder & {
  machines: { name: string; plate: string | null } | null;
  pickup_locations: { name: string } | null;
  service_order_items: ServiceOrderItem[];
};

export default async function OperacoesPage({
  searchParams,
}: {
  searchParams: { m?: string; filter?: string };
}) {
  const supabase = createClient();

  const today = new Date();
  const month =
    searchParams.m ??
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const [year, monthNum] = month.split("-").map(Number);
  const startDate = `${month}-01`;
  const endDate = new Date(year, monthNum, 0).toISOString().split("T")[0];

  const [ordersRes, machinesRes, productsRes, locationsRes, categoriesRes, costCentersRes] =
    await Promise.all([
      supabase
        .from("service_orders")
        .select(
          "*, machines(name, plate), pickup_locations(name), service_order_items(*)"
        )
        .or(
          `and(delivery_date.gte.${startDate},delivery_date.lte.${endDate}),and(delivery_date.is.null,issue_date.gte.${startDate},issue_date.lte.${endDate})`
        )
        .order("delivery_date", { ascending: false, nullsFirst: false })
        .order("order_number", { ascending: false }),
      supabase.from("machines").select("*").eq("active", true).order("name"),
      supabase.from("products").select("*").eq("active", true).order("name"),
      supabase.from("pickup_locations").select("*").eq("active", true).order("name"),
      supabase.from("categories").select("*").order("name"),
      supabase.from("cost_centers").select("*").eq("active", true).order("name"),
    ]);

  return (
    <OperacoesPageClient
      orders={(ordersRes.data as ServiceOrderWithDetails[]) ?? []}
      machines={(machinesRes.data as Machine[]) ?? []}
      products={(productsRes.data as Product[]) ?? []}
      pickupLocations={(locationsRes.data as PickupLocation[]) ?? []}
      categories={(categoriesRes.data as Category[]) ?? []}
      costCenters={(costCentersRes.data as CostCenter[]) ?? []}
      month={month}
      initialFilter={searchParams.filter ?? ""}
    />
  );
}
