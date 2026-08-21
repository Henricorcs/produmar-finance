import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { TecnicoCercaClient } from "@/components/tecnico/tecnico-cerca-client";
import { localDateISO } from "@/lib/utils";
import type { SupplyFenceRun, SupplyObraSector } from "@/lib/types";
import type { TecnicoObra } from "@/components/tecnico/tecnico-client";

export const dynamic = "force-dynamic";

export default async function TecnicoCercaPage() {
  const supabase = createClient();

  // Perfil já carregado pelo layout nesta mesma requisição — vem do cache, sem
  // nova consulta e sem segurar as buscas da tela.
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Mesma porta das outras telas dele: só o técnico (e o admin, para conferir).
  if (profile?.role !== "tecnico" && profile?.role !== "admin") redirect("/inicio");

  // Alguns meses para trás bastam: o que interessa na rua é o que está andando.
  const desde = localDateISO(
    new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1)
  );

  const [obrasRes, sectorsRes, runsRes] = await Promise.all([
    supabase.from("supply_obras").select("id, name, client").order("name", { ascending: true }),
    supabase
      .from("supply_obra_sectors")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true }),
    // A TABELA, não a view: aqui não entra preço nenhum. O técnico manda metro
    // e ponto — o valor é assunto do chefe (migration 063).
    supabase
      .from("supply_fence_runs")
      .select("*")
      .gte("work_date", desde)
      .order("work_date", { ascending: false })
      .limit(500),
  ]);

  return (
    <TecnicoCercaClient
      obras={(obrasRes.data as TecnicoObra[]) ?? []}
      sectors={(sectorsRes.data as SupplyObraSector[]) ?? []}
      runs={(runsRes.data as SupplyFenceRun[]) ?? []}
      meId={profile.id}
    />
  );
}
