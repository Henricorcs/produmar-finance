import { createClient } from "@/lib/supabase/server";
import { PrefeituraClient } from "@/components/prefeitura/prefeitura-client";
import type { PrefeituraNota, PrefeituraSecretaria } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PrefeituraPage() {
  const supabase = createClient();

  const [{ data: secretarias }, { data: notas }] = await Promise.all([
    supabase
      .from("prefeitura_secretarias")
      .select("*")
      .order("grupo")
      .order("ordem")
      .order("nome"),
    supabase
      .from("prefeitura_notas")
      .select("*")
      .order("data_emissao", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  return (
    <PrefeituraClient
      secretarias={(secretarias as PrefeituraSecretaria[]) ?? []}
      notas={(notas as PrefeituraNota[]) ?? []}
    />
  );
}
