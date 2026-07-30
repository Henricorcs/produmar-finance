import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RebanhoVacinasPrint } from "@/components/animais/rebanho-vacinas-print";
import type {
  AnimalBirth,
  AnimalCategory,
  AnimalVaccination,
  AnimalVaccine,
  AnimalWithInfo,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<AnimalCategory, string> = {
  boi: "Bois",
  vaca: "Vacas",
  bezerro: "Bezerros",
};

interface Props {
  searchParams: { categoria?: string; pendentes?: string };
}

/**
 * Guia de vacinação do rebanho — lista com uma linha por animal e uma coluna
 * por vacina. Aceita os mesmos filtros da tela: ?categoria=vaca|boi|bezerro e
 * ?pendentes=1 (só quem tem vacina atrasada ou nunca aplicada).
 */
export default async function ImprimirRebanhoPage({ searchParams }: Props) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const categoria = searchParams.categoria as AnimalCategory | undefined;
  const onlyPending = searchParams.pendentes === "1";

  let query = supabase.from("v_animals").select("*").order("tag", { ascending: true });
  if (categoria && categoria in CATEGORY_LABELS) query = query.eq("category", categoria);

  const [animalsRes, vaccinesRes, vaccinationsRes, birthsRes] = await Promise.all([
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
  ]);

  let animals = (animalsRes.data as AnimalWithInfo[]) ?? [];
  if (onlyPending) animals = animals.filter((a) => a.vaccines_due > 0);

  const filterLabel = [
    categoria && categoria in CATEGORY_LABELS ? CATEGORY_LABELS[categoria] : null,
    onlyPending ? "só pendentes" : null,
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
