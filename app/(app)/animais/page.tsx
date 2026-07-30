import { createClient } from "@/lib/supabase/server";
import { AnimaisPageClient } from "@/components/animais/animais-page-client";
import type { AnimalBreed, AnimalVaccine, AnimalWithInfo } from "@/lib/types";
import type { VaccinationRow } from "@/components/animais/animais-page-client";

export const dynamic = "force-dynamic";

export default async function AnimaisPage() {
  const supabase = createClient();

  const [animalsRes, breedsRes, vaccinesRes, vaccinationsRes] = await Promise.all([
    supabase.from("v_animals").select("*").order("tag", { ascending: true }),
    supabase.from("animal_breeds").select("*").order("name", { ascending: true }),
    supabase.from("animal_vaccines").select("*").order("name", { ascending: true }),
    supabase
      .from("animal_vaccinations")
      .select("*, animal_vaccines(name, recurrence_months), animals(tag)")
      .order("applied_at", { ascending: false })
      .limit(1000),
  ]);

  return (
    <AnimaisPageClient
      animals={(animalsRes.data as AnimalWithInfo[]) ?? []}
      breeds={(breedsRes.data as AnimalBreed[]) ?? []}
      vaccines={(vaccinesRes.data as AnimalVaccine[]) ?? []}
      vaccinations={(vaccinationsRes.data as VaccinationRow[]) ?? []}
    />
  );
}
