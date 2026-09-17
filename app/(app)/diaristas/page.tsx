import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DiaristasPageClient } from "@/components/diaristas/diaristas-page-client";
import type {
  DiaristaAcerto,
  DiaristaAdiantamento,
  DiaristaDia,
  DiaristaResumo,
  DiaristaTecnico,
  EncarregadoDeObra,
  SupplyObraSector,
  SupplyObraServicoView,
} from "@/lib/types";
import type { DiaristaObra } from "@/components/diaristas/lancar-dia-dialog";

export const dynamic = "force-dynamic";

export default async function DiaristasPage() {
  const supabase = createClient();

  const [
    diaristasRes,
    diasRes,
    obrasRes,
    sectorsRes,
    valesRes,
    acertosRes,
    servicosRes,
    vinculosRes,
    encarregados,
  ] = await Promise.all([
    // cadastro + quanto cada um já trabalhou (migration 059 — sem ela a tela
    // abre vazia com o aviso, em vez de quebrar)
    supabase.from("v_diaristas").select("*").order("name", { ascending: true }),
    // o mês é escolhido na tela, então os dias vêm de uma vez e o filtro é lá
    supabase
      .from("diarista_dias")
      .select("*")
      .order("work_date", { ascending: false })
      .limit(2000),
    supabase.from("supply_obras").select("id, name, client").order("name", { ascending: true }),
    supabase.from("supply_obra_sectors").select("*").order("name", { ascending: true }),
    // vales e acertos (migration 068 — sem ela voltam vazios e a tela segue igual)
    supabase
      .from("diarista_adiantamentos")
      .select("*")
      .order("advance_date", { ascending: false })
      .limit(1000),
    supabase
      .from("diarista_acertos")
      .select("*")
      .order("settled_on", { ascending: false })
      .limit(500),
    // serviços por empreita / por metro que caem na conta do colaborador
    // (migration 069 — sem ela volta vazio e a tela segue igual)
    supabase
      .from("v_supply_obra_servicos")
      .select("*")
      .order("service_date", { ascending: false })
      .limit(1000),
    // quem cuida de quem (migration 099 — sem ela volta vazio, e liberar
    // alguém avisa para rodar a migration)
    supabase.from("diarista_tecnicos").select("diarista_id, tecnico_id"),
    listarEncarregadosDeObra(supabase),
  ]);

  return (
    <DiaristasPageClient
      diaristas={(diaristasRes.data as DiaristaResumo[]) ?? []}
      dias={(diasRes.data as DiaristaDia[]) ?? []}
      obras={(obrasRes.data as DiaristaObra[]) ?? []}
      sectors={(sectorsRes.data as SupplyObraSector[]) ?? []}
      adiantamentos={(valesRes.data as DiaristaAdiantamento[]) ?? []}
      acertos={(acertosRes.data as DiaristaAcerto[]) ?? []}
      servicos={(servicosRes.data as SupplyObraServicoView[]) ?? []}
      vinculos={(vinculosRes.data as DiaristaTecnico[]) ?? []}
      encarregados={encarregados}
    />
  );
}

/**
 * Os usuários com o papel de encarregado de obra (`tecnico` no banco), para o
 * chefe escolher quem cuida de cada colaborador.
 *
 * A RLS de profiles só deixa o admin ver os outros usuários: o service-role
 * abre a lista para o financeiro e para quem tem o módulo. Sem a chave, tenta
 * com o login de quem abriu — o admin enxerga do mesmo jeito.
 */
async function listarEncarregadosDeObra(
  supabase: ReturnType<typeof createClient>
): Promise<EncarregadoDeObra[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .eq("role", "tecnico")
      .order("full_name", { ascending: true });
    if (!error) return (data as EncarregadoDeObra[]) ?? [];
  } catch {
    // sem a service key: cai no login de quem abriu
  }
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .eq("role", "tecnico")
    .order("full_name", { ascending: true });
  return (data as EncarregadoDeObra[]) ?? [];
}
