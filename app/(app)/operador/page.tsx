import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OperadorClient } from "@/components/operador/operador-client";
import type { ServiceOrder, ServiceOrderItem, ServiceOrderTrip } from "@/lib/types";

export const dynamic = "force-dynamic";

type OrderWithDetails = ServiceOrder & {
  machines: { name: string; plate: string | null } | null;
  pickup_locations: { name: string } | null;
  service_order_items: (ServiceOrderItem & { products: { name: string } | null })[];
  service_order_trips?: ServiceOrderTrip[];
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

  const list = (orders as OrderWithDetails[]) ?? [];

  // Log de horários das viagens (best-effort: não quebra o painel caso a
  // tabela ainda não exista — migration 016 não aplicada no Supabase).
  if (list.length > 0) {
    const { data: trips } = await supabase
      .from("service_order_trips")
      .select("*")
      .in("service_order_id", list.map((o) => o.id));
    for (const o of list) {
      o.service_order_trips =
        (trips as ServiceOrderTrip[] | null)?.filter((t) => t.service_order_id === o.id) ?? [];
    }
  }

  // Último km conhecido de cada veículo (facilita o Iniciar: o técnico usa o
  // botão "Usar último km" em vez de digitar). Vem da OS mais recente daquele
  // veículo que tenha km anotado — preferindo o km de chegada.
  const machineIds = [...new Set(list.map((o) => o.machine_id).filter((id): id is string => !!id))];
  const lastKmByMachine: Record<string, number> = {};
  if (machineIds.length > 0) {
    const { data: kmRows } = await supabase
      .from("service_orders")
      .select("machine_id, km_start, km_end, updated_at")
      .in("machine_id", machineIds)
      .or("km_end.not.is.null,km_start.not.is.null")
      .order("updated_at", { ascending: false })
      .limit(200);
    for (const row of (kmRows as Pick<ServiceOrder, "machine_id" | "km_start" | "km_end">[]) ?? []) {
      if (!row.machine_id || lastKmByMachine[row.machine_id] != null) continue;
      const km = row.km_end ?? row.km_start;
      if (km != null) lastKmByMachine[row.machine_id] = Number(km);
    }
  }

  return (
    <OperadorClient
      orders={list}
      operadorName={user.user_metadata?.name ?? user.email ?? "Operador"}
      lastKmByMachine={lastKmByMachine}
    />
  );
}
