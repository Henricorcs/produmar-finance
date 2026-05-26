import { createClient } from "@/lib/supabase/server";
import { ContasPageClient } from "@/components/contas/contas-page-client";
import type { Category, CostCenter } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ContasPage({
  searchParams,
}: {
  searchParams: { m?: string; filter?: string };
}) {
  const supabase = createClient();

  const today = new Date();
  const month =
    searchParams.m ??
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const [year, monthNum] = month.split("-").map(Number);
  const startDate = `${month}-01`;
  const endDate = new Date(year, monthNum, 0).toISOString().split("T")[0];

  const [transactionsRes, categoriesRes, costCentersRes] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "*, categories(name, color), transaction_attachments(id, transaction_id, file_name, file_size, mime_type, storage_path, created_by, created_at)"
      )
      .gte("due_date", startDate)
      .lte("due_date", endDate)
      .order("due_date", { ascending: false }),
    supabase.from("categories").select("*").order("name"),
    supabase.from("cost_centers").select("*").eq("active", true).order("name"),
  ]);

  return (
    <ContasPageClient
      transactions={transactionsRes.data ?? []}
      categories={(categoriesRes.data as Category[]) ?? []}
      costCenters={(costCentersRes.data as CostCenter[]) ?? []}
      month={month}
      initialFilter={searchParams.filter ?? ""}
    />
  );
}
