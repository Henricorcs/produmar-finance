import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OperadorClient } from "@/components/operador/operador-client";
import type {
  ServiceOrder,
  ServiceOrderAttachment,
  ServiceOrderItem,
  ServiceOrderTrip,
  ServiceOrderPause,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type OrderWithDetails = ServiceOrder & {
  machines: { name: string; plate: string | null } | null;
  pickup_locations: { name: string } | null;
  service_order_items: (ServiceOrderItem & { products: { name: string } | null })[];
  service_order_trips?: ServiceOrderTrip[];
  service_order_pauses?: ServiceOrderPause[];
  service_order_attachments?: ServiceOrderAttachment[];
};

export default async function OperadorPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Busca OS em aberto (pendente ou em andamento) ENVIADAS para este operador.
  // Isolamento estrito: cada operador só vê o que foi direcionado a ele — a OS
  // de um operador NÃO aparece para outro. OS sem dono (assigned_to NULL) não
  // aparecem em nenhum painel; o escritório precisa enviá-las a alguém.
  const select = `*, machines(name, plate, tracking_type), pickup_locations(name), service_order_items(*, products(name))`;
  const assigned = await supabase
    .from("service_orders")
    .select(select)
    .in("status", ["pendente", "em_andamento"])
    .eq("assigned_to", user.id)
    .order("created_at", { ascending: false });

  // Coluna assigned_to ausente (migration 023 não aplicada): mostra todas as OS
  // abertas — assim o painel não fica vazio antes da migration rodar.
  let orders = assigned.data;
  if (assigned.error) {
    const fallback = await supabase
      .from("service_orders")
      .select(select)
      .in("status", ["pendente", "em_andamento"])
      .order("created_at", { ascending: false });
    orders = fallback.data;
  }

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

    // Pausas/retomadas dos serviços internos (best-effort: não quebra o painel
    // caso a tabela ainda não exista — migration 025 não aplicada no Supabase).
    const { data: pauses } = await supabase
      .from("service_order_pauses")
      .select("*")
      .in("service_order_id", list.map((o) => o.id));
    for (const o of list) {
      o.service_order_pauses =
        (pauses as ServiceOrderPause[] | null)?.filter((p) => p.service_order_id === o.id) ?? [];
    }

    // Comprovantes anexados (best-effort: não quebra o painel caso a tabela
    // ainda não exista — migration 026 não aplicada no Supabase).
    const { data: attachments } = await supabase
      .from("service_order_attachments")
      .select("*")
      .in("service_order_id", list.map((o) => o.id));
    for (const o of list) {
      o.service_order_attachments =
        (attachments as ServiceOrderAttachment[] | null)?.filter(
          (a) => a.service_order_id === o.id
        ) ?? [];
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
