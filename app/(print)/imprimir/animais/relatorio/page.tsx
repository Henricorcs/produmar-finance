import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/auth";
import {
  RelatorioRebanhoPrint,
  type Filiacao,
  type Ordem,
} from "@/components/animais/relatorio-rebanho";
import type { AnimalBreed, AnimalWithInfo } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: { tipo?: string; raca?: string; situacao?: string; ordem?: string; q?: string };
}

const ORDENS: Ordem[] = ["numero", "nascimento", "mae"];

/**
 * Relatório do rebanho impresso — número do animal, número da mãe, data de
 * nascimento e raça. Os mesmos filtros da aba Relatório: ?tipo=, ?raca= (id,
 * "sem" ou "po"), ?situacao=todos (inclusive quem saiu), ?ordem= e ?q=.
 */
export default async function ImprimirRelatorioRebanhoPage({ searchParams }: Props) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  const supabase = createClient();
  const [animalsRes, breedsRes, filiacaoRes] = await Promise.all([
    supabase.from("v_animals").select("*").order("tag", { ascending: true }),
    supabase.from("animal_breeds").select("*").order("name", { ascending: true }),
    supabase
      .from("animal_births")
      .select("calf_animal_id, mother_id")
      .not("calf_animal_id", "is", null)
      .limit(20000),
  ]);

  const ordem = ORDENS.includes(searchParams.ordem as Ordem)
    ? (searchParams.ordem as Ordem)
    : "numero";

  return (
    <RelatorioRebanhoPrint
      animals={(animalsRes.data as AnimalWithInfo[]) ?? []}
      breeds={(breedsRes.data as AnimalBreed[]) ?? []}
      filiacao={(filiacaoRes.data as Filiacao[]) ?? []}
      tipo={searchParams.tipo ?? null}
      raca={searchParams.raca ?? null}
      situacao={searchParams.situacao === "todos" ? "todos" : "rebanho"}
      ordem={ordem}
      busca={searchParams.q ?? ""}
    />
  );
}
