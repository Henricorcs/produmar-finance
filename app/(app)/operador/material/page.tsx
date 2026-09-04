import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { OperadorMaterialClient } from "@/components/operador/material-obra-client";
import type {
  SupplyLocal,
  SupplyObraSector,
  SupplyRequestRow,
} from "@/lib/types";
import type {
  OperadorItem,
  OperadorObra,
} from "@/components/operador/material-obra-client";

export const dynamic = "force-dynamic";

/**
 * "LEVEI ESTE MATERIAL PARA ESTA OBRA" — a aba de quem descarrega na rua.
 *
 * É a mesma fila do técnico (supply_requests, migration 052): nada sai do
 * estoque aqui, o que nasce é um recado que o escritório confere e formaliza na
 * aba "Pendentes" do Estoque. A migration 080 é que deixa o operador mandar.
 */
export default async function OperadorMaterialPage() {
  const supabase = createClient();

  // O perfil já veio no layout desta mesma requisição — sai do cache.
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Quem descarrega material na obra: operador e encarregado. O admin entra
  // para conferir a tela; o resto do mundo tem o Estoque de verdade.
  if (
    profile.role !== "operador" &&
    profile.role !== "encarregado" &&
    profile.role !== "admin"
  )
    redirect("/inicio");

  const [itemsRes, obrasRes, locaisRes, sectorsRes, mineRes] = await Promise.all([
    // só o catálogo: nome e unidade. Ele não precisa (nem deve) ver saldo.
    supabase.from("supply_items").select("id, name, unit").order("name", { ascending: true }),
    // a obra já diz em que SETOR ela fica (o local, migration 066)
    supabase
      .from("supply_obras")
      .select("id, name, client, local_id")
      .order("name", { ascending: true }),
    // OS SETORES: Fazenda 01, Fazenda 02, Sítio — é assim que o pessoal fala
    supabase
      .from("supply_locais")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true }),
    // os pontos de cada obra ("ponto 01"), cadastrados pelo chefe (057)
    supabase
      .from("supply_obra_sectors")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true }),
    // os avisos dele que o escritório ainda não resolveu (sem a 052 volta vazio)
    supabase
      .from("supply_requests")
      .select("*, supply_items(name, unit), supply_obras(name)")
      .eq("created_by", profile.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <OperadorMaterialClient
      items={(itemsRes.data as OperadorItem[]) ?? []}
      obras={(obrasRes.data as OperadorObra[]) ?? []}
      locais={(locaisRes.data as SupplyLocal[]) ?? []}
      sectors={(sectorsRes.data as SupplyObraSector[]) ?? []}
      pending={(mineRes.data as SupplyRequestRow[]) ?? []}
    />
  );
}
