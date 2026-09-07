import { createClient } from "@/lib/supabase/server";
import { AnimaisPageClient } from "@/components/animais/animais-page-client";
import type {
  AnimalBirth,
  AnimalBirthRequest,
  AnimalBreed,
  AnimalDespesa,
  AnimalFinanceiroLinha,
  AnimalLoteMovimento,
  AnimalLoteResumo,
  AnimalTanque,
  AnimalTreatment,
  AnimalVaccine,
  AnimalVaccinePending,
  AnimalVenda,
  AnimalWeight,
  AnimalWithInfo,
} from "@/lib/types";
import type { VaccinationRow } from "@/components/animais/animais-page-client";

export const dynamic = "force-dynamic";

export default async function AnimaisPage() {
  const supabase = createClient();

  const [
    animalsRes,
    breedsRes,
    vaccinesRes,
    vaccinationsRes,
    treatmentsRes,
    birthsRes,
    pendingRes,
    weightsRes,
    birthRequestsRes,
    financeiroRes,
    despesasRes,
    vendasRes,
    tanquesRes,
    lotesRes,
    movimentosRes,
  ] = await Promise.all([
    supabase.from("v_animals").select("*").order("tag", { ascending: true }),
    supabase.from("animal_breeds").select("*").order("name", { ascending: true }),
    supabase.from("animal_vaccines").select("*").order("name", { ascending: true }),
    supabase
      .from("animal_vaccinations")
      .select("*, animal_vaccines(name, recurrence_months), animals(tag)")
      .order("applied_at", { ascending: false })
      .limit(1000),
    supabase
      .from("animal_treatments")
      .select("*")
      .order("applied_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("animal_births")
      .select("*")
      .order("birth_date", { ascending: false })
      .limit(500),
    // pendências marcadas na mão (migration 044 — sem ela a tela segue funcionando)
    supabase.from("animal_vaccine_pending").select("*").limit(2000),
    // pesagens (migration 046 — sem ela a tela segue funcionando, só sem ganho)
    supabase
      .from("animal_weights")
      .select("*")
      .order("weighed_at", { ascending: false })
      .limit(3000),
    // nascimentos enviados pelo vaqueiro, aguardando o patrão conferir (migration
    // 048 — sem ela a tela segue funcionando, só sem a aba Nascimentos)
    supabase
      .from("animal_birth_requests")
      .select("*")
      .order("created_at", { ascending: true }),
    // a ficha de receitas e despesas por espécie (migration 072 — sem ela a
    // aba abre vazia e o resto da tela segue igual)
    supabase
      .from("v_animal_financeiro")
      .select("*")
      .order("entry_date", { ascending: false })
      .limit(2000),
    // as despesas cruas: é por elas que a ficha abre uma na correção
    supabase
      .from("animal_despesas")
      .select("*")
      .order("expense_date", { ascending: false })
      .limit(2000),
    // as vendas de lote cruas — peixe e ave, que não têm brinco (migration 088
    // — sem ela a ficha segue igual, só sem essas linhas)
    supabase
      .from("animal_vendas")
      .select("*")
      .order("sale_date", { ascending: false })
      .limit(2000),
    // tanque, ciclo e movimento (migration 089 — sem ela a aba abre vazia e o
    // resto da tela segue igual)
    supabase.from("animal_tanques").select("*").order("name", { ascending: true }),
    supabase
      .from("v_animal_lotes")
      .select("*")
      .order("start_date", { ascending: false })
      .limit(500),
    supabase
      .from("animal_lote_movimentos")
      .select("*")
      .order("moved_on", { ascending: false })
      .limit(5000),
  ]);

  return (
    <AnimaisPageClient
      animals={(animalsRes.data as AnimalWithInfo[]) ?? []}
      breeds={(breedsRes.data as AnimalBreed[]) ?? []}
      vaccines={(vaccinesRes.data as AnimalVaccine[]) ?? []}
      vaccinations={(vaccinationsRes.data as VaccinationRow[]) ?? []}
      treatments={(treatmentsRes.data as AnimalTreatment[]) ?? []}
      births={(birthsRes.data as AnimalBirth[]) ?? []}
      pendings={(pendingRes.data as AnimalVaccinePending[]) ?? []}
      weights={(weightsRes.data as AnimalWeight[]) ?? []}
      birthRequests={(birthRequestsRes.data as AnimalBirthRequest[]) ?? []}
      financeiro={(financeiroRes.data as AnimalFinanceiroLinha[]) ?? []}
      despesas={(despesasRes.data as AnimalDespesa[]) ?? []}
      vendas={(vendasRes.data as AnimalVenda[]) ?? []}
      tanques={(tanquesRes.data as AnimalTanque[]) ?? []}
      lotes={(lotesRes.data as AnimalLoteResumo[]) ?? []}
      movimentos={(movimentosRes.data as AnimalLoteMovimento[]) ?? []}
    />
  );
}
