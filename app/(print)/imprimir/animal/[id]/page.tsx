import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AnimalFichaPrint } from "@/components/animais/animal-ficha-print";
import type { AnimalVaccination, AnimalVaccine, AnimalWithInfo } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Props {
  params: { id: string };
}

/** Ficha de um animal para levar impressa no curral. */
export default async function ImprimirFichaAnimalPage({ params }: Props) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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

  const [vaccinesRes, vaccinationsRes] = await Promise.all([
    supabase.from("animal_vaccines").select("*").order("name", { ascending: true }),
    supabase
      .from("animal_vaccinations")
      .select("*")
      .eq("animal_id", animal.id)
      .order("applied_at", { ascending: false }),
  ]);

  // foto principal com URL assinada (a impressão precisa da imagem acessível)
  let photoUrl: string | null = null;
  if (animal.photo_path) {
    const { data: signed } = await supabase.storage
      .from("attachments")
      .createSignedUrl(animal.photo_path, 60 * 60);
    photoUrl = signed?.signedUrl ?? null;
  }

  return (
    <AnimalFichaPrint
      animal={animal}
      vaccines={(vaccinesRes.data as AnimalVaccine[]) ?? []}
      vaccinations={(vaccinationsRes.data as AnimalVaccination[]) ?? []}
      photoUrl={photoUrl}
    />
  );
}
