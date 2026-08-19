import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RebanhoVacinasPrint } from "@/components/animais/rebanho-vacinas-print";
import { SPECIES_META, categoryPlural } from "@/components/animais/animal-shared";
import type {
  AnimalBirth,
  AnimalCategory,
  AnimalSpecies,
  AnimalVaccination,
  AnimalVaccine,
  AnimalWithInfo,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const CATEGORIES: AnimalCategory[] = ["boi", "vaca", "bezerro"];

interface Props {
  searchParams: { tipo?: string; categoria?: string; pendentes?: string };
}

/**
 * Guia de vacinação do rebanho — lista com uma linha por animal e uma coluna
 * por vacina. Aceita os mesmos filtros da tela: ?tipo=bovino|equino|caprino|
 * ovino|suino, ?categoria=vaca|boi|bezerro e ?pendentes=1 (só quem tem vacina
 * MARCADA NA MÃO como pendente).
 */
export default async function ImprimirRebanhoPage({ searchParams }: Props) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const categoria = searchParams.categoria as AnimalCategory | undefined;
  const tipo = searchParams.tipo as AnimalSpecies | undefined;
  const especie = tipo && tipo in SPECIES_META ? tipo : null;
  const onlyPending = searchParams.pendentes === "1";

  // só o rebanho de hoje: quem foi vendido ou morreu não vai para a guia
  let query = supabase
    .from("v_animals")
    .select("*")
    .eq("active", true)
    .order("tag", { ascending: true });
  if (categoria && CATEGORIES.includes(categoria)) query = query.eq("category", categoria);
  if (especie) query = query.eq("species", especie);

  const [animalsRes, vaccinesRes, vaccinationsRes, birthsRes, pendingRes] = await Promise.all([
    query,
    supabase.from("animal_vaccines").select("*").order("name", { ascending: true }),
    supabase
      .from("animal_vaccinations")
      .select("*")
      .order("applied_at", { ascending: false }),
    supabase
      .from("animal_births")
      .select("*")
      .order("birth_date", { ascending: false }),
    supabase.from("animal_vaccine_pending").select("animal_id"),
  ]);

  let animals = (animalsRes.data as AnimalWithInfo[]) ?? [];
  if (onlyPending) {
    // pendente = o que foi marcado na mão, não o que o sistema calculou
    const marked = new Set(
      ((pendingRes.data as { animal_id: string }[]) ?? []).map((p) => p.animal_id)
    );
    animals = animals.filter((a) => marked.has(a.id));
  }

  const filterLabel = [
    especie ? SPECIES_META[especie].plural : null,
    categoria && CATEGORIES.includes(categoria) ? categoryPlural(categoria, especie) : null,
    onlyPending ? "só os marcados como pendente" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <RebanhoVacinasPrint
      animals={animals}
      vaccines={(vaccinesRes.data as AnimalVaccine[]) ?? []}
      vaccinations={(vaccinationsRes.data as AnimalVaccination[]) ?? []}
      births={(birthsRes.data as AnimalBirth[]) ?? []}
      filterLabel={filterLabel || null}
    />
  );
}
