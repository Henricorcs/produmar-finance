import { createClient } from "@/lib/supabase/server";
import { CategoriasPageClient } from "@/components/categorias/categorias-page-client";
import type { Category } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CategoriasPage() {
  const supabase = createClient();

  const { data } = await supabase
    .from("categories")
    .select("*")
    .order("type", { ascending: true })
    .order("name", { ascending: true });

  return <CategoriasPageClient categories={(data as Category[]) ?? []} />;
}
