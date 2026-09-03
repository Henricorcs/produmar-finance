import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId, getProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { OperadorClient } from "@/components/operador/operador-client";
import { PreviewBanner } from "@/components/layout/preview-banner";
import type {
  MachineServicoDoOperador,
  Profile,
  ServiceOrder,
  ServiceOrderAttachment,
  ServiceOrderForward,
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
  service_order_forwards?: ServiceOrderForward[];
};

export default async function OperadorPage({
  searchParams,
}: {
  searchParams: { ver?: string };
}) {
  const supabase = createClient();

  // Id vem do header que o middleware preencheu — sem ida e volta ao Supabase.
  const meuId = await getCurrentUserId();
  if (!meuId) redirect("/login");

  // VER COMO O OPERADOR: o admin abre o painel de outra pessoa para conferir se
  // a OS chegou, sem precisar da senha dela. Só o admin, e só leitura — a faixa
  // no topo desliga o toque no que vem abaixo. (Iniciar e finalizar já são
  // travados no servidor pelo assigned_to, então nem por fora daria.)
  //
  // O perfil vem do cache da requisição: o layout já buscou.
  const eu = await getProfile();
  const vendoOutro = eu?.role === "admin" && !!searchParams.ver && searchParams.ver !== meuId;
  const userId = vendoOutro ? (searchParams.ver as string) : meuId;

  // Busca OS em aberto (pendente ou em andamento) ENVIADAS para este operador.
  // Isolamento estrito: cada operador só vê o que foi direcionado a ele — a OS
  // de um operador NÃO aparece para outro. OS sem dono (assigned_to NULL) não
  // aparecem em nenhum painel; o escritório precisa enviá-las a alguém.
  const select = `*, machines(name, plate, tracking_type), pickup_locations(name), service_order_items(*, products(name))`;

  // Histórico: OS que ESTE operador finalizou (somente leitura). Estrito a
  // finalized_by = ele — gravado ao clicar FINALIZAR. Best-effort: se a coluna
  // ainda não existe (migration 030 não aplicada), cai para as OS entregues que
  // estavam atribuídas a ele, que é o mesmo conjunto (encaminhar reatribui antes
  // do fechamento). Sem detalhes aninhados pesados — o toque abre o detalhe.
  const finishedSelect = `*, machines(name, plate, tracking_type), pickup_locations(name), service_order_items(*, products(name))`;

  // Outros operadores (para encaminhar a OS). Usa o service-role porque a RLS
  // de profiles só deixa o admin ver os outros. Best-effort: sem a service key,
  // segue sem a lista (o botão de encaminhar fica sem destinos).
  const operatorsPromise = (async () => {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("role", ["operador", "encarregado"])
        .order("full_name", { ascending: true });
      return ((data as Pick<Profile, "id" | "full_name" | "email">[]) ?? [])
        .filter((p) => p.id !== userId)
        .map((p) => ({ id: p.id, name: p.full_name || p.email }));
    } catch {
      return [] as { id: string; name: string }[];
    }
  })();

  // Nenhuma depende da outra — vão todas na mesma leva, em vez de uma
  // esperar a outra.
  const [assigned, finished, operators, perfilRes, frotaRes, frotaFeitasRes] =
    await Promise.all([
      supabase
        .from("service_orders")
        .select(select)
        .in("status", ["pendente", "em_andamento"])
        .eq("assigned_to", userId)
        .order("created_at", { ascending: false }),
      supabase
        .from("service_orders")
        .select(finishedSelect)
        .eq("status", "entregue")
        .eq("finalized_by", userId)
        .order("delivery_date", { ascending: false })
        .limit(100),
      operatorsPromise,
      // de quem é o painel: o meu, ou o de quem o admin está olhando
      vendoOutro
        ? supabase.from("profiles").select("*").eq("id", userId).maybeSingle()
        : Promise.resolve({ data: eu }),
      // A OS DE MÁQUINA da ficha do veículo (migrations 073-075), enviada para
      // este operador e ainda em aberto. Best-effort: sem as migrations, a
      // consulta falha e o painel segue igual, só sem esta lista.
      supabase
        .from("machine_servicos")
        .select("*, machines(name, plate, tracking_type)")
        .eq("assigned_to", userId)
        .eq("status", "aberta")
        .order("service_date", { ascending: true }),
      // e o histórico: o que ELE mesmo finalizou na máquina (só leitura)
      supabase
        .from("machine_servicos")
        .select("*, machines(name, plate, tracking_type)")
        .eq("finalized_by", userId)
        .order("finished_at", { ascending: false })
        .limit(50),
    ]);

  // De quem é o painel: o meu perfil, ou o de quem o admin está olhando.
  const profile = (perfilRes.data as Profile | null) ?? null;

  const frotaOS = (frotaRes.data as MachineServicoDoOperador[]) ?? [];
  const frotaFinalizadas = (frotaFeitasRes.data as MachineServicoDoOperador[]) ?? [];

  // A consulta da OS de máquina falha quando as migrations 073-075 ainda não
  // rodaram (tabela ou coluna que não existe). Sem este aviso o painel ficava
  // vazio sem dizer por quê — e quem está na rua achava que não tinha serviço.
  const frotaIndisponivel = !!frotaRes.error;

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

  let finishedRows = finished.data;
  if (finished.error) {
    const fallback = await supabase
      .from("service_orders")
      .select(finishedSelect)
      .eq("status", "entregue")
      .eq("assigned_to", userId)
      .order("delivery_date", { ascending: false })
      .limit(100);
    finishedRows = fallback.data;
  }
  const finalizedList = (finishedRows as OrderWithDetails[]) ?? [];

  // Detalhes das OS abertas. Nenhuma depende da outra, então saem todas na
  // mesma leva — antes eram cinco esperas em fila, uma para cada tabela.
  // Best-effort: se alguma tabela ainda não existe (migrations 016/025/026/027
  // não aplicadas), aquela lista volta vazia e o painel segue igual.
  const lastKmByMachine: Record<string, number> = {};

  if (list.length > 0) {
    const orderIds = list.map((o) => o.id);

    // Último km conhecido de cada veículo (facilita o Iniciar: o técnico usa o
    // botão "Usar último km" em vez de digitar). Vem da OS mais recente daquele
    // veículo que tenha km anotado — preferindo o km de chegada.
    const machineIds = [
      ...new Set(list.map((o) => o.machine_id).filter((id): id is string => !!id)),
    ];

    const [tripsRes, pausesRes, attachmentsRes, forwardsRes, kmRes] = await Promise.all([
      supabase.from("service_order_trips").select("*").in("service_order_id", orderIds),
      supabase.from("service_order_pauses").select("*").in("service_order_id", orderIds),
      supabase.from("service_order_attachments").select("*").in("service_order_id", orderIds),
      supabase
        .from("service_order_forwards")
        .select("*")
        .in("service_order_id", orderIds)
        .order("created_at", { ascending: true }),
      machineIds.length > 0
        ? supabase
            .from("service_orders")
            .select("machine_id, km_start, km_end, updated_at")
            .in("machine_id", machineIds)
            .or("km_end.not.is.null,km_start.not.is.null")
            .order("updated_at", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: null }),
    ]);

    // Agrupa por OS uma vez só, em vez de varrer a lista inteira por OS.
    const byOrder = <T extends { service_order_id: string }>(rows: T[] | null) => {
      const map = new Map<string, T[]>();
      for (const row of rows ?? []) {
        const bucket = map.get(row.service_order_id);
        if (bucket) bucket.push(row);
        else map.set(row.service_order_id, [row]);
      }
      return map;
    };

    const trips = byOrder(tripsRes.data as ServiceOrderTrip[] | null);
    const pauses = byOrder(pausesRes.data as ServiceOrderPause[] | null);
    const attachments = byOrder(attachmentsRes.data as ServiceOrderAttachment[] | null);
    const forwards = byOrder(forwardsRes.data as ServiceOrderForward[] | null);

    for (const o of list) {
      o.service_order_trips = trips.get(o.id) ?? [];
      o.service_order_pauses = pauses.get(o.id) ?? [];
      o.service_order_attachments = attachments.get(o.id) ?? [];
      o.service_order_forwards = forwards.get(o.id) ?? [];
    }

    for (const row of (kmRes.data as Pick<
      ServiceOrder,
      "machine_id" | "km_start" | "km_end"
    >[]) ?? []) {
      if (!row.machine_id || lastKmByMachine[row.machine_id] != null) continue;
      const km = row.km_end ?? row.km_start;
      if (km != null) lastKmByMachine[row.machine_id] = Number(km);
    }
  }

  const painel = (
    <OperadorClient
      orders={list}
      finalizedOrders={finalizedList}
      frotaOS={frotaOS}
      frotaFinalizadas={frotaFinalizadas}
      frotaIndisponivel={frotaIndisponivel}
      operadorName={profile?.full_name ?? profile?.email ?? "Operador"}
      lastKmByMachine={lastKmByMachine}
      operators={operators}
    />
  );

  if (!vendoOutro) return painel;

  return (
    <>
      <PreviewBanner
        nome={profile?.full_name ?? profile?.email ?? "operador"}
        tela="o painel"
      />
      {/* só leitura: nada aqui aceita toque */}
      <div className="pointer-events-none select-none">{painel}</div>
    </>
  );
}
