import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/auth";
import { OrcamentoPrint } from "@/components/operacoes/orcamento-print";
import type {
  ServiceOrder,
  ServiceOrderAttachment,
  ServiceOrderForward,
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
  service_order_attachments?: ServiceOrderAttachment[];
  service_order_forwards?: ServiceOrderForward[];
};

interface Props {
  params: { id: string };
}

export default async function ImprimirOSPage({ params }: Props) {
  const supabase = createClient();

  // Id vem do header que o middleware preencheu — sem ida e volta ao Supabase.
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

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

  // Viagens, pausas, comprovantes e encaminhamentos. Nenhum depende do outro,
  // então saem na mesma leva — antes eram quatro esperas em fila só para montar
  // uma folha de impressão. Best-effort: se alguma tabela ainda não existe
  // (migrations 016/025/026/027), aquela lista volta vazia e a folha sai igual.
  const [tripsRes, pausesRes, attachmentsRes, forwardsRes] = await Promise.all([
    supabase.from("service_order_trips").select("*").eq("service_order_id", order.id),
    supabase.from("service_order_pauses").select("*").eq("service_order_id", order.id),
    supabase.from("service_order_attachments").select("*").eq("service_order_id", order.id),
    supabase
      .from("service_order_forwards")
      .select("*")
      .eq("service_order_id", order.id)
      .order("created_at", { ascending: true }),
  ]);

  order.service_order_trips = (tripsRes.data as ServiceOrderTrip[] | null) ?? [];
  order.service_order_pauses = (pausesRes.data as ServiceOrderPause[] | null) ?? [];
  order.service_order_attachments =
    (attachmentsRes.data as ServiceOrderAttachment[] | null) ?? [];
  order.service_order_forwards = (forwardsRes.data as ServiceOrderForward[] | null) ?? [];

  return <OrcamentoPrint order={order} />;
}
