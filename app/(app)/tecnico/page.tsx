import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TecnicoClient } from "@/components/tecnico/tecnico-client";
import type { SupplyRequestRow } from "@/lib/types";
import type { TecnicoItem, TecnicoObra } from "@/components/tecnico/tecnico-client";

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

  const [itemsRes, obrasRes, mineRes] = await Promise.all([
    // só o catálogo: nome e unidade. O técnico não precisa (nem deve) ver saldo.
    supabase.from("supply_items").select("id, name, unit").order("name", { ascending: true }),
    supabase.from("supply_obras").select("id, name, client").order("name", { ascending: true }),
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
      pending={(mineRes.data as SupplyRequestRow[]) ?? []}
    />
  );
}
