import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { TecnicoDiaristasClient } from "@/components/tecnico/tecnico-diaristas-client";
import { localDateISO } from "@/lib/utils";
import type { Diarista, DiaristaDia, SupplyObraSector } from "@/lib/types";
import type { DiaristaObra } from "@/components/diaristas/lancar-dia-dialog";

export const dynamic = "force-dynamic";

export default async function TecnicoDiaristasPage() {
  const supabase = createClient();

  // Perfil já carregado pelo layout nesta mesma requisição — vem do cache, sem
  // nova consulta e sem segurar as buscas da tela.
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Mesma porta da tela de material: só o técnico (e o admin, para conferir).
  if (profile?.role !== "tecnico" && profile?.role !== "admin") redirect("/inicio");

  // O calendário só volta alguns meses: ninguém marca hoje um dia do ano
  // passado, e carregar a vida inteira no celular dele é peso à toa.
  const desde = localDateISO(
    new Date(new Date().getFullYear(), new Date().getMonth() - 6, 1)
  );

  const [diaristasRes, diasRes, obrasRes, sectorsRes] = await Promise.all([
    // só quem está ativo: o técnico escolhe da lista, nunca cadastra
    // (migration 059 — sem ela a tela avisa que não há ninguém cadastrado)
    supabase
      .from("diaristas")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true }),
    supabase
      .from("diarista_dias")
      .select("*")
      .gte("work_date", desde)
      .order("work_date", { ascending: false }),
    supabase.from("supply_obras").select("id, name, client").order("name", { ascending: true }),
    supabase
      .from("supply_obra_sectors")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true }),
  ]);

  return (
    <TecnicoDiaristasClient
      diaristas={(diaristasRes.data as Diarista[]) ?? []}
      dias={(diasRes.data as DiaristaDia[]) ?? []}
      obras={(obrasRes.data as DiaristaObra[]) ?? []}
      sectors={(sectorsRes.data as SupplyObraSector[]) ?? []}
      meId={profile.id}
    />
  );
}
