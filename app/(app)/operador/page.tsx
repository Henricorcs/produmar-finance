import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OperadorClient } from "@/components/operador/operador-client";
import type { Machine, PickupLocation, ServiceOrder, ServiceOrderItem } from "@/lib/types";

export const dynamic = "force-dynamic";

type OrderWithDetails = ServiceOrder & {
  machines: { name: string; plate: string | null } | null;
  pickup_locations: { name: string } | null;
  service_order_items: (ServiceOrderItem & { products: { name: string } | null })[];
};

export default async function OperadorPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Busca OS em aberto (pendente ou em andamento)
  const { data: orders } = await supabase
    .from("service_orders")
    .select(
      `*, machines(name, plate, tracking_type), pickup_locations(name), service_order_items(*, products(name))`
    )
    .in("status", ["pendente", "em_andamento"])
    .order("created_at", { ascending: false });

  // Máquinas ativas — para o técnico escolher ao lançar um serviço
  const { data: machines } = await supabase
    .from("machines")
    .select("id, name, plate")
    .eq("active", true)
    .order("name");

  // Clientes recentes — chips de toque rápido (evita digitação)
  const { data: clientRows } = await supabase
    .from("service_orders")
    .select("client_name")
    .eq("freight_type", "cliente")
    .not("client_name", "is", null)
    .order("created_at", { ascending: false })
    .limit(80);
  const recentClients = Array.from(
    new Set(
      (clientRows ?? [])
        .map((r) => (r.client_name ?? "").trim())
        .filter(Boolean)
    )
  ).slice(0, 12);

  return (
    <OperadorClient
      orders={(orders as OrderWithDetails[]) ?? []}
      operadorName={user.user_metadata?.name ?? user.email ?? "Operador"}
      machines={machines ?? []}
      recentClients={recentClients}
    />
  );
}
