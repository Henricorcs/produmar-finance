import { createClient } from "@/lib/supabase/server";
import { RelatoriosClient } from "@/components/relatorios/relatorios-client";
import type { Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RelatoriosPage() {
  const supabase = createClient();

  // Last 12 months window — only confirmed cash movements (pago / recebido)
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const endDate   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const startStr  = startDate.toISOString().split("T")[0];
  const endStr    = endDate.toISOString().split("T")[0];

  const { data: transactions } = await supabase
    .from("transactions")
    .select("*, categories(name, color)")
    .in("status", ["pago", "recebido"])
    .gte("due_date", startStr)
    .lte("due_date", endStr)
    .order("due_date", { ascending: true });

  return (
    <RelatoriosClient
      transactions={(transactions ?? []) as (Transaction & {
        categories: { name: string; color: string } | null;
      })[]}
    />
  );
}
