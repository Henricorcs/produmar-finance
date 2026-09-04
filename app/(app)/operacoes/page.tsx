import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { OperacoesPageClient } from "@/components/operacoes/operacoes-page-client";
import type { MaterialPickerItem } from "@/components/tecnico/material-picker-dialog";
import type {
  Category,
  CostCenter,
  Machine,
  Obra,
  PickupLocation,
  Product,
  Profile,
  ProductStockBalance,
  ServiceOrder,
  ServiceOrderItem,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type ServiceOrderWithDetails = ServiceOrder & {
  machines: { name: string; plate: string | null } | null;
  pickup_locations: { name: string } | null;
  service_order_items: (ServiceOrderItem & { products: { name: string } | null })[];
};

export default async function OperacoesPage({
  searchParams,
}: {
  searchParams: { m?: string; filter?: string };
}) {
  const supabase = createClient();

  // Técnico (operador) não gerencia OS — só executa pelo painel /operador.
  // O menu já esconde esta rota; aqui garantimos no servidor (acesso por URL).
  // Perfil do cache da requisição (o layout já buscou) — a conferência não
  // custa mais duas esperas antes das buscas da tela.
  const profile = await getProfile();
  if (profile?.role === "operador") redirect("/operador");

  const today = new Date();
  const month =
    searchParams.m ??
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const [year, monthNum] = month.split("-").map(Number);
  const startDate = `${month}-01`;
  const endDate = new Date(year, monthNum, 0).toISOString().split("T")[0];

  const [ordersRes, machinesRes, productsRes, locationsRes, categoriesRes, costCentersRes, stockBalanceRes, obrasRes, supplyItemsRes] =
    await Promise.all([
      supabase
        .from("service_orders")
        .select(
          "*, machines(name, plate), pickup_locations(name), service_order_items(*, products(name))"
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
      supabase.from("product_stock_balance").select("*"),
      supabase.from("obras").select("*").eq("active", true).order("name"),
      // o catálogo do Estoque: a OS de serviço manda buscar material daqui
      supabase.from("supply_items").select("id, name, unit").order("name"),
    ]);

  // Inclui máquinas inativas que estão em uso por alguma OS do período — senão
  // a edição perde a máquina e, com ela, o modo de precificação (horímetro/km).
  const activeMachines = (machinesRes.data as Machine[]) ?? [];
  const orders = (ordersRes.data as ServiceOrderWithDetails[]) ?? [];
  const activeIds = new Set(activeMachines.map((m) => m.id));
  const missingIds = [
    ...new Set(
      orders.map((o) => o.machine_id).filter((id): id is string => !!id && !activeIds.has(id))
    ),
  ];
  let machines = activeMachines;
  if (missingIds.length > 0) {
    const { data: extra } = await supabase.from("machines").select("*").in("id", missingIds);
    machines = [...activeMachines, ...((extra as Machine[]) ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }

  // Operadores (para direcionar a OS). Usa o service-role para listar os
  // perfis 'operador' (a RLS de profiles só deixa o admin ver os outros).
  // Best-effort: se a service key não estiver configurada, segue sem a lista.
  let operators: Profile[] = [];
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("*")
      .in("role", ["operador", "encarregado"])
      .order("full_name", { ascending: true });
    operators = (data as Profile[]) ?? [];
  } catch {
    operators = [];
  }

  return (
    <OperacoesPageClient
      orders={orders}
      machines={machines}
      operators={operators}
      products={(productsRes.data as Product[]) ?? []}
      pickupLocations={(locationsRes.data as PickupLocation[]) ?? []}
      categories={(categoriesRes.data as Category[]) ?? []}
      costCenters={(costCentersRes.data as CostCenter[]) ?? []}
      stockBalances={(stockBalanceRes.data as ProductStockBalance[]) ?? []}
      obras={(obrasRes.data as Obra[]) ?? []}
      supplyItems={(supplyItemsRes.data as MaterialPickerItem[]) ?? []}
      month={month}
      initialFilter={searchParams.filter ?? ""}
    />
  );
}
