import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/auth";
import { AnimalFichaPrint } from "@/components/animais/animal-ficha-print";
import type {
  AnimalBirth,
  AnimalTreatment,
  AnimalVaccination,
  AnimalVaccine,
  AnimalWeight,
  AnimalWithInfo,
} from "@/lib/types";
import { urlDoArquivo } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
}

/** Ficha de um animal para levar impressa no curral. */
export default async function ImprimirFichaAnimalPage({ params }: Props) {
  const supabase = createClient();

  // Id vem do header que o middleware preencheu — sem ida e volta ao Supabase.
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  const { data: animal } = await supabase
    .from("v_animals")
    .select("*")
    .eq("id", params.id)
    .maybeSingle<AnimalWithInfo>();

  if (!animal) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-500">Animal não encontrado.</p>
      </div>
    );
  }

  const [vaccinesRes, vaccinationsRes, treatmentsRes, birthsRes, weightsRes] = await Promise.all([
    supabase.from("animal_vaccines").select("*").order("name", { ascending: true }),
    supabase
      .from("animal_vaccinations")
      .select("*")
      .eq("animal_id", animal.id)
      .order("applied_at", { ascending: false }),
    supabase
      .from("animal_treatments")
      .select("*")
      .eq("animal_id", animal.id)
      .order("applied_at", { ascending: false }),
    supabase
      .from("animal_births")
      .select("*")
      .eq("mother_id", animal.id)
      .order("birth_date", { ascending: false }),
    // pesagens (migration 046 — sem ela a ficha sai sem o quadro de ganho)
    supabase
      .from("animal_weights")
      .select("*")
      .eq("animal_id", animal.id)
      .order("weighed_at", { ascending: false }),
  ]);

  // Foto principal. O navegador de quem mandou imprimir busca a imagem em
  // /api/arquivo com a sessão dele — a impressão sai com a foto do animal.
  const photoUrl: string | null = animal.photo_path
    ? urlDoArquivo(animal.photo_path)
    : null;

  return (
    <AnimalFichaPrint
      animal={animal}
      vaccines={(vaccinesRes.data as AnimalVaccine[]) ?? []}
      vaccinations={(vaccinationsRes.data as AnimalVaccination[]) ?? []}
      treatments={(treatmentsRes.data as AnimalTreatment[]) ?? []}
      births={(birthsRes.data as AnimalBirth[]) ?? []}
      weights={(weightsRes.data as AnimalWeight[]) ?? []}
      photoUrl={photoUrl}
    />
  );
}
