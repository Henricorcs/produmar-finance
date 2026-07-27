import { createClient } from "@/lib/supabase/server";
import { AnimaisPageClient } from "@/components/animais/animais-page-client";
import type { AnimalType, AnimalVaccine, AnimalWithInfo } from "@/lib/types";
import type {
  BirthRow,
  TreatmentRow,
  VaccinationRow,
} from "@/components/animais/animais-page-client";

export const dynamic = "force-dynamic";

export default async function AnimaisPage() {
  const supabase = createClient();

  const [animalsRes, typesRes, vaccinesRes, vaccinationsRes, treatmentsRes, birthsRes] =
    await Promise.all([
      supabase.from("v_animals").select("*").order("tag", { ascending: true }),
      supabase.from("animal_types").select("*").order("name", { ascending: true }),
      supabase.from("animal_vaccines").select("*").order("name", { ascending: true }),
      supabase
        .from("animal_vaccinations")
        .select("*, animal_vaccines(name, recurrence_months), animals(tag)")
        .order("applied_at", { ascending: false })
        .limit(500),
      supabase
        .from("animal_treatments")
        .select("*, animals(tag)")
        .order("applied_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("animal_births")
        .select("*, animals!animal_births_mother_id_fkey(tag)")
        .order("birth_date", { ascending: false })
        .limit(300),
    ]);

  return (
    <AnimaisPageClient
      animals={(animalsRes.data as AnimalWithInfo[]) ?? []}
      types={(typesRes.data as AnimalType[]) ?? []}
      vaccines={(vaccinesRes.data as AnimalVaccine[]) ?? []}
      vaccinations={(vaccinationsRes.data as VaccinationRow[]) ?? []}
      treatments={(treatmentsRes.data as TreatmentRow[]) ?? []}
      births={(birthsRes.data as BirthRow[]) ?? []}
    />
  );
}
