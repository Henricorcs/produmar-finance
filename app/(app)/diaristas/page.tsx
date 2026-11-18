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
  Medicao,
  SupplyObraSector,
  SupplyObraServicoView,
} from "@/lib/types";
import type {
  DiaristaMaquina,
  DiaristaObra,
} from "@/components/diaristas/lancar-dia-dialog";
import { juntarServicosDeMaquina, lerServicosDeMaquina } from "@/lib/maquina-na-diaria-db";

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
    maquinasRes,
    servicosDeMaquina,
    medicoesRes,
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
    // a máquina pesada que trabalhou junto na diária (migration 132)
    supabase.from("machines").select("*").order("name", { ascending: true }),
    lerServicosDeMaquina(supabase),
    // as cercas medidas pelo GPS na aba Medir cerca (148): a metragem entra com
    // um toque no serviço por metro lançado do pagamento. select("*") e filtro
    // aqui: antes da 148 não há a coluna tipo, e a tela segue funcionando
    supabase
      .from("medicoes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  return (
    <DiaristasPageClient
      diaristas={(diaristasRes.data as DiaristaResumo[]) ?? []}
      dias={juntarServicosDeMaquina(
        (diasRes.data as DiaristaDia[]) ?? [],
        servicosDeMaquina.servicos
      )}
      obras={(obrasRes.data as DiaristaObra[]) ?? []}
      sectors={(sectorsRes.data as SupplyObraSector[]) ?? []}
      maquinas={(maquinasRes.data as DiaristaMaquina[]) ?? []}
      maquinaPronta={servicosDeMaquina.pronta}
      adiantamentos={(valesRes.data as DiaristaAdiantamento[]) ?? []}
      acertos={(acertosRes.data as DiaristaAcerto[]) ?? []}
      servicos={(servicosRes.data as SupplyObraServicoView[]) ?? []}
      vinculos={(vinculosRes.data as DiaristaTecnico[]) ?? []}
      encarregados={encarregados}
      cercasSalvas={((medicoesRes.data as Medicao[]) ?? []).filter((m) => m.tipo === "cerca")}
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
