import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { NotasFiscaisClient } from "@/components/notas-fiscais/notas-fiscais-client";
import type { Category, CostCenter, Invoice } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function NotasFiscaisPage() {
  const supabase = createClient();

  const [invoicesRes, categoriesRes, costCentersRes, profile] = await Promise.all([
    supabase
      .from("invoices")
      // Tudo menos raw_data: ali dentro fica o XML inteiro da nota, que a tela
      // nunca mostra. Com "*" cada abertura baixava o XML de TODAS as notas já
      // enviadas — megabytes trafegados à toa.
      .select(
        "id, source, access_key, number, series, issue_date, emitter_document, emitter_name, receiver_document, receiver_name, total_amount, direction, file_url, processed, transaction_id"
      )
      .order("issue_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("categories").select("*").order("name"),
    supabase.from("cost_centers").select("*").eq("active", true).order("name"),
    // perfil do cache da requisição (o layout já buscou) — não consulta de novo
    getProfile(),
  ]);

  const canManage = profile?.role === "admin";

  return (
    <NotasFiscaisClient
      invoices={(invoicesRes.data as Invoice[]) ?? []}
      categories={(categoriesRes.data as Category[]) ?? []}
      costCenters={(costCentersRes.data as CostCenter[]) ?? []}
      canManage={canManage}
    />
  );
}
