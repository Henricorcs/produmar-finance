import { createClient } from "@/lib/supabase/server";
import { MedicoesClient } from "@/components/medicoes/medicoes-client";
import type { Medicao } from "@/lib/types";

export const dynamic = "force-dynamic";

/** MEDIÇÕES — os lotes medidos pelo GPS, do mais novo para o mais velho. */
export default async function MedicoesPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("medicoes")
    .select("*")
    .order("created_at", { ascending: false });

  return <MedicoesClient medicoes={(data as Medicao[]) ?? []} migrationPendente={!!error} />;
}
