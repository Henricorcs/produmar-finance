import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TecnicoClient } from "@/components/tecnico/tecnico-client";
import type { SupplyObraSector, SupplyRequestRow } from "@/lib/types";
import type {
  TecnicoItem,
  TecnicoMachine,
  TecnicoObra,
} from "@/components/tecnico/tecnico-client";

export const dynamic = "force-dynamic";

export default async function TecnicoPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .single();

  // Tela fechada: só o técnico (e o admin, para conferir/testar).
  if (profile?.role !== "tecnico" && profile?.role !== "admin") redirect("/inicio");

  const [itemsRes, obrasRes, sectorsRes, machinesRes, mineRes] = await Promise.all([
    // só o catálogo: nome e unidade. O técnico não precisa (nem deve) ver saldo.
    supabase.from("supply_items").select("id, name, unit").order("name", { ascending: true }),
    supabase.from("supply_obras").select("id, name, client").order("name", { ascending: true }),
    // setores de cada obra, cadastrados pelo chefe (migration 057 — sem ela a
    // lista volta vazia e o técnico continua escrevendo o lugar na mão)
    supabase
      .from("supply_obra_sectors")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true }),
    // a frota, para o técnico dizer qual máquina usou
    supabase
      .from("machines")
      .select("id, name, plate, tracking_type")
      .eq("active", true)
      .order("name", { ascending: true }),
    // os recados dele que o chefe ainda não resolveu (sem a 052 volta vazio)
    supabase
      .from("supply_requests")
      .select("*, supply_items(name, unit), supply_obras(name)")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <TecnicoClient
      items={(itemsRes.data as TecnicoItem[]) ?? []}
      obras={(obrasRes.data as TecnicoObra[]) ?? []}
      sectors={(sectorsRes.data as SupplyObraSector[]) ?? []}
      machines={(machinesRes.data as TecnicoMachine[]) ?? []}
      pending={(mineRes.data as SupplyRequestRow[]) ?? []}
    />
  );
}
