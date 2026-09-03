import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { RelatoriosClient } from "@/components/relatorios/relatorios-client";
import type { Profile, ServiceOrder, Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  const supabase = createClient();

  // Last 12 months window
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const endDate   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const startStr  = startDate.toISOString().split("T")[0];
  const endStr    = endDate.toISOString().split("T")[0];

  // Movimentos confirmados (pago / recebido) — base do DRE e fluxo de caixa.
  const txRes = await supabase
    .from("transactions")
    .select("*, categories(name, color), cost_centers(name)")
    .in("status", ["pago", "recebido"])
    .gte("due_date", startStr)
    .lte("due_date", endStr)
    .order("due_date", { ascending: true });

  // Ordens de serviço do período — base do relatório por operador. Usa
  // issue_date para a janela; a página agrupa por mês de entrega (ou emissão).
  const ordersRes = await supabase
    .from("service_orders")
    .select("*, machines(name, plate, category)")
    .gte("issue_date", startStr)
    .order("issue_date", { ascending: false });

  // Operadores (para nomear o assigned_to). A RLS de profiles só deixa o admin
  // ver os outros, então usamos o service-role. Best-effort: sem a key, segue
  // sem nomes (cai no id) — não quebra o relatório.
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
    <RelatoriosClient
      transactions={(txRes.data ?? []) as (Transaction & {
        categories: { name: string; color: string } | null;
        cost_centers: { name: string } | null;
      })[]}
      orders={(ordersRes.data ?? []) as (ServiceOrder & {
        machines: { name: string; plate: string | null; category: string | null } | null;
      })[]}
      operators={operators}
    />
  );
}
