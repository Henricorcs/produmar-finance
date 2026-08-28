import { createClient } from "@/lib/supabase/server";
import { DiaristasPageClient } from "@/components/diaristas/diaristas-page-client";
import type {
  DiaristaAcerto,
  DiaristaAdiantamento,
  DiaristaDia,
  DiaristaResumo,
  SupplyObraSector,
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
  ]);

  return (
    <DiaristasPageClient
      diaristas={(diaristasRes.data as DiaristaResumo[]) ?? []}
      dias={(diasRes.data as DiaristaDia[]) ?? []}
      obras={(obrasRes.data as DiaristaObra[]) ?? []}
      sectors={(sectorsRes.data as SupplyObraSector[]) ?? []}
      adiantamentos={(valesRes.data as DiaristaAdiantamento[]) ?? []}
      acertos={(acertosRes.data as DiaristaAcerto[]) ?? []}
    />
  );
}
