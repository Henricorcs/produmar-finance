import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PAPEIS_QUE_RECEBEM_OS } from "@/lib/module-access";
import { RelatoriosClient } from "@/components/relatorios/relatorios-client";
import { COLUNAS_OS_SEM_ASSINATURA } from "@/lib/os-colunas";
import type {
  OsAbertaDeServico,
  OsDeMaquinaResumo,
  Profile,
  ServiceOrder,
  Transaction,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  const supabase = createClient();

  // Last 12 months window
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const endDate   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const startStr  = startDate.toISOString().split("T")[0];
  const endStr    = endDate.toISOString().split("T")[0];

  const [txRes, ordersRes, abertasRes, abertasMaquinaRes, maquinaMesRes] =
    await Promise.all([
    // Movimentos confirmados (pago / recebido) — base do DRE e fluxo de caixa.
    supabase
      .from("transactions")
      .select("*, categories(name, color), cost_centers(name)")
      .in("status", ["pago", "recebido"])
      .gte("due_date", startStr)
      .lte("due_date", endStr)
      .order("due_date", { ascending: true }),

    // Ordens de serviço do período — base do relatório por operador. Usa
    // issue_date para a janela; a página agrupa por mês de entrega (ou emissão).
    // Sem a assinatura: ela é uma imagem por OS e o relatório não a mostra —
    // era 84% do peso desta tela (ver lib/os-colunas.ts).
    supabase
      .from("service_orders")
      .select(`${COLUNAS_OS_SEM_ASSINATURA}, machines(name, plate, category)`)
      .gte("issue_date", startStr)
      .order("issue_date", { ascending: false }),

    // ── OS EM ABERTO, DE SEMPRE ─────────────────────────────────────────────
    // Estas duas NÃO entram na janela de 12 meses de propósito: uma OS parada
    // desde o ano passado é justamente a que precisa aparecer no relatório.
    supabase
      .from("service_orders")
      .select(
        "id, order_number, type, status, assigned_to, machine_id, issue_date, client_name, service_description, total_amount, machines(name, plate)"
      )
      .in("status", ["pendente", "em_andamento"])
      .order("issue_date", { ascending: true }),

    // A OS da ficha do veículo. Best-effort: sem as migrations 073-075 a
    // consulta falha, e o relatório segue só com as OS de serviço.
    supabase
      .from("machine_servicos")
      .select(
        "id, machine_id, service_date, kind, status, contratante, description, total, assigned_to, started_at, machines(name, plate)"
      )
      .eq("status", "aberta")
      .order("service_date", { ascending: true }),

    // A OS da ficha do veículo NO PERÍODO — esta traz também as concluídas,
    // que é o que o relatório por máquina precisa mostrar. A de serviço já
    // vem completa na consulta de `orders` acima.
    supabase
      .from("machine_servicos")
      .select(
        "id, machine_id, service_date, kind, status, contratante, description, total, assigned_to, started_at, machines(name, plate)"
      )
      .gte("service_date", startStr)
      .order("service_date", { ascending: false }),
    ]);

  // Quem recebe OS (para nomear o assigned_to — inclusive quando ela foi para
  // um admin). A RLS de profiles só deixa o admin ver os outros, então usamos o
  // service-role. Best-effort: sem a key, segue sem nomes (cai no id) — não
  // quebra o relatório.
  let operators: Profile[] = [];
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("*")
      .in("role", [...PAPEIS_QUE_RECEBEM_OS])
      .order("full_name", { ascending: true });
    operators = (data as Profile[]) ?? [];
  } catch {
    operators = [];
  }

  return (
    <RelatoriosClient
      transactions={(txRes.data ?? []) as (Transaction & {
        categories: { name: string; color: string } | null;
        cost_centers: { name: string } | null;
      })[]}
      orders={(ordersRes.data ?? []) as unknown as (ServiceOrder & {
        machines: { name: string; plate: string | null; category: string | null } | null;
      })[]}
      osAbertas={(abertasRes.data ?? []) as unknown as OsAbertaDeServico[]}
      osAbertasMaquina={
        (abertasMaquinaRes.data ?? []) as unknown as OsDeMaquinaResumo[]
      }
      osMaquinaDoPeriodo={
        (maquinaMesRes.data ?? []) as unknown as OsDeMaquinaResumo[]
      }
      operators={operators}
    />
  );
}
