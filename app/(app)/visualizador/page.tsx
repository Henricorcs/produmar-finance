import { createClient } from "@/lib/supabase/server";
import { VisualizadorClient } from "@/components/visualizador/visualizador-client";

export const dynamic = "force-dynamic";

export default async function VisualizadorPage({
  searchParams,
}: {
  searchParams: { m?: string };
}) {
  const supabase = createClient();

  const today = new Date();
  const month =
    searchParams.m ??
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const [year, monthNum] = month.split("-").map(Number);
  const startDate = `${month}-01`;
  const endDate = new Date(year, monthNum, 0).toISOString().split("T")[0];

  const { data } = await supabase
    .from("transactions")
    .select(
      "*, categories(name, color), cost_centers(name), transaction_attachments(id, transaction_id, file_name, file_size, mime_type, storage_path, created_by, created_at)"
    )
    // Lançamentos de OS contam nas finanças, mas não aparecem nesta lista.
    .is("service_order_id", null)
    .gte("due_date", startDate)
    .lte("due_date", endDate)
    .neq("status", "cancelado")
    .order("due_date", { ascending: false });

  return (
    <VisualizadorClient
      transactions={(data as any[]) ?? []}
      month={month}
    />
  );
}
