import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { AnimaisPageClient } from "@/components/animais/animais-page-client";
import type {
  AnimalBirth,
  AnimalBirthRequest,
  ProtocoloPendencia,
  ProtocoloNascimentoItem,
  AnimalBreed,
  AnimalDespesa,
  AnimalFinanceiroLinha,
  AnimalGrupo,
  AnimalGrupoAnimal,
  AnimalLoteMovimento,
  AnimalMedicamento,
  AnimalProtocolo,
  AnimalProtocoloAplicacao,
  AnimalProtocoloAplicacaoAnimal,
  AnimalProtocoloItem,
  AnimalLoteResumo,
  AnimalTanque,
  AnimalTreatment,
  AnimalVaccine,
  AnimalVaccinePending,
  AnimalVenda,
  AnimalPesoFoto,
  AnimalWeight,
  AnimalWithInfo,
} from "@/lib/types";
import type { VaccinationRow } from "@/components/animais/animais-page-client";
import type { EtapaFeita } from "@/components/animais/protocolos-tab";
import type { Filiacao } from "@/components/animais/relatorio-rebanho";

export const dynamic = "force-dynamic";

/**
 * ?tipo=bovino&raca=<id> — o que está escolhido no menu de raças. Fica na URL
 * para a escolha sobreviver ao recarregar a página.
 * ?desmame=1 — veio do sino do topo: abre a lista das crias prontas para desmamar.
 */
export default async function AnimaisPage({
  searchParams,
}: {
  searchParams: { tipo?: string; raca?: string; desmame?: string };
}) {
  const supabase = createClient();

  // Vaqueiro nível 01 (migration 146): só bovino. O RLS já não manda outro
  // tipo nem o que é dinheiro (despesas, vendas, tanques); aqui a página nem
  // pede essas tabelas e apaga o valor da venda dos animais que saíram.
  const profile = await getProfile();
  const soBovinos = profile?.role === "vaqueiro_n1";
  const nada = Promise.resolve({ data: [] as unknown[] });

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
    protocoloRes,
    medicamentosRes,
    protocolosRes,
    protocoloItensRes,
    aplicacoesRes,
    aplicacaoAnimaisRes,
    etapasFeitasRes,
    pesosFotoRes,
    gruposRes,
    grupoAnimaisRes,
    filiacaoRes,
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
    // aba abre vazia e o resto da tela segue igual). O limite é folgado porque
    // o relatório por raça soma o ano inteiro a partir destas linhas.
    soBovinos
      ? nada
      : supabase
          .from("v_animal_financeiro")
          .select("*")
          .order("entry_date", { ascending: false })
          .limit(5000),
    // as despesas cruas: é por elas que a ficha abre uma na correção
    soBovinos
      ? nada
      : supabase
          .from("animal_despesas")
          .select("*")
          .order("expense_date", { ascending: false })
          .limit(2000),
    // as vendas de lote cruas — peixe e ave, que não têm brinco (migration 088
    // — sem ela a ficha segue igual, só sem essas linhas)
    soBovinos
      ? nada
      : supabase
          .from("animal_vendas")
          .select("*")
          .order("sale_date", { ascending: false })
          .limit(2000),
    // tanque, ciclo e movimento (migration 089 — sem ela a aba abre vazia e o
    // resto da tela segue igual)
    // (peixe e ave: nada disso é do vaqueiro nível 01)
    soBovinos
      ? nada
      : supabase.from("animal_tanques").select("*").order("name", { ascending: true }),
    soBovinos
      ? nada
      : supabase
          .from("v_animal_lotes")
          .select("*")
          .order("start_date", { ascending: false })
          .limit(500),
    soBovinos
      ? nada
      : supabase
          .from("animal_lote_movimentos")
          .select("*")
          .order("moved_on", { ascending: false })
          .limit(5000),
    // o protocolo do nascimento (migration 095 — sem ela a aba Nascimentos
    // abre igual, só com o protocolo vazio e o aviso de rodar a migration)
    supabase
      .from("animal_protocolo_nascimento")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    // protocolos de medicamento em etapas (migration 108 — sem ela a aba
    // Protocolos abre vazia e o resto da tela segue igual)
    supabase.from("animal_medicamentos").select("*").order("name", { ascending: true }),
    supabase.from("animal_protocolos").select("*").order("name", { ascending: true }),
    supabase
      .from("animal_protocolo_itens")
      .select("*")
      .order("dia", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase
      .from("animal_protocolo_aplicacoes")
      .select("*")
      .order("start_date", { ascending: false })
      .limit(300),
    supabase.from("animal_protocolo_aplicacao_animais").select("*").limit(20000),
    supabase
      .from("animal_treatments")
      .select("id, animal_id, medicine, dose, applied_at, protocolo_aplicacao_id, protocolo_dia")
      .not("protocolo_aplicacao_id", "is", null)
      .limit(20000),
    // peso estimado pela foto e a comparação com a balança (migration 109 —
    // sem ela a Pesagem abre igual, só sem o histórico da foto)
    supabase
      .from("animal_pesos_foto")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(2000),
    // lotes do rebanho e quem está em cada um (migration 134 — sem ela a aba
    // Lotes abre vazia e o resto da tela segue igual)
    supabase.from("animal_grupos").select("*").order("name", { ascending: true }),
    supabase
      .from("animal_grupo_animais")
      .select("*")
      .order("joined_on", { ascending: false })
      .limit(20000),
    // quem é filho de quem, pelo parto lançado — para o número da mãe no
    // relatório (a lista de partos acima vem só com os 500 mais novos)
    supabase
      .from("animal_births")
      .select("calf_animal_id, mother_id")
      .not("calf_animal_id", "is", null)
      .limit(20000),
  ]);

  // O protocolo que o vaqueiro deixou PENDENTE nos envios ainda não lançados
  // (migration 138 — sem ela a consulta falha e a conferência segue igual).
  const { data: pendenciasDoNascimento } = await supabase
    .from("animal_protocolo_pendencias")
    .select("*")
    .not("birth_request_id", "is", null)
    .limit(1000);

  // O valor da venda fica fora do que vai para o celular do vaqueiro nível 01.
  const animais = ((animalsRes.data as AnimalWithInfo[]) ?? []).map((a) =>
    soBovinos
      ? {
          ...a,
          exit_amount: 0,
          sale_weight_kg: 0,
          sale_price_per_kg: 0,
          exit_buyer: null,
          exit_notes: null,
          exit_transaction_id: null,
        }
      : a
  );

  return (
    <AnimaisPageClient
      soBovinos={soBovinos}
      pendenciasDoNascimento={(pendenciasDoNascimento as ProtocoloPendencia[] | null) ?? []}
      animals={animais}
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
      protocolo={(protocoloRes.data as ProtocoloNascimentoItem[]) ?? []}
      medicamentos={(medicamentosRes.data as AnimalMedicamento[]) ?? []}
      protocolos={(protocolosRes.data as AnimalProtocolo[]) ?? []}
      protocoloItens={(protocoloItensRes.data as AnimalProtocoloItem[]) ?? []}
      aplicacoes={(aplicacoesRes.data as AnimalProtocoloAplicacao[]) ?? []}
      aplicacaoAnimais={(aplicacaoAnimaisRes.data as AnimalProtocoloAplicacaoAnimal[]) ?? []}
      etapasFeitas={(etapasFeitasRes.data as EtapaFeita[]) ?? []}
      pesosFoto={(pesosFotoRes.data as AnimalPesoFoto[]) ?? []}
      grupos={(gruposRes.data as AnimalGrupo[]) ?? []}
      grupoAnimais={(grupoAnimaisRes.data as AnimalGrupoAnimal[]) ?? []}
      filiacao={(filiacaoRes.data as Filiacao[]) ?? []}
      tipoInicial={searchParams.tipo ?? null}
      racaInicial={searchParams.raca ?? null}
      desmameInicial={searchParams.desmame === "1"}
    />
  );
}
