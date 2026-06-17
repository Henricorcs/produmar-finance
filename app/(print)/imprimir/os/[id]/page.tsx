import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OrcamentoPrint } from "@/components/operacoes/orcamento-print";
import type {
  ServiceOrder,
  ServiceOrderItem,
  ServiceOrderTrip,
  ServiceOrderPause,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type PrintOrder = ServiceOrder & {
  machines: {
    name: string;
    plate: string | null;
    type: string | null;
    tracking_type?: "hourmeter" | "km";
  } | null;
  pickup_locations: { name: string; address: string | null } | null;
  service_order_items: (ServiceOrderItem & { products: { name: string } | null })[];
  service_order_trips?: ServiceOrderTrip[];
  service_order_pauses?: ServiceOrderPause[];
};

interface Props {
  params: { id: string };
}

export default async function ImprimirOSPage({ params }: Props) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: order, error } = await supabase
    .from("service_orders")
    .select(
      `*, machines(name, plate, type, tracking_type), pickup_locations(name, address), service_order_items(*, products(name))`
    )
    .eq("id", params.id)
    .single<PrintOrder>();

  if (error || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Ordem de serviço não encontrada.</p>
      </div>
    );
  }

  // Log de horários das viagens (best-effort: não quebra a impressão caso a
  // tabela ainda não exista — migration 016 não aplicada no Supabase).
  const { data: trips } = await supabase
    .from("service_order_trips")
    .select("*")
    .eq("service_order_id", order.id);
  order.service_order_trips = (trips as ServiceOrderTrip[] | null) ?? [];

  // Diário de pausas/retomadas do serviço interno (best-effort: migration 025).
  const { data: pauses } = await supabase
    .from("service_order_pauses")
    .select("*")
    .eq("service_order_id", order.id);
  order.service_order_pauses = (pauses as ServiceOrderPause[] | null) ?? [];

  return <OrcamentoPrint order={order} />;
}
