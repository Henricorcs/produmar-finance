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

  // as medidas de cerca (148) ficam na aba Medir cerca, não na lista de lotes
  const lotes = ((data as Medicao[]) ?? []).filter((m) => m.tipo !== "cerca");
  return <MedicoesClient medicoes={lotes} migrationPendente={!!error} />;
}
