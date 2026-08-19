import { createClient } from "@/lib/supabase/server";
import { AlmoxarifadoPageClient } from "@/components/almoxarifado/almoxarifado-page-client";
import type {
  Machine,
  SupplyCategory,
  SupplyItemWithStock,
  SupplyObraSector,
  SupplyObraUsage,
  SupplyRequestRow,
} from "@/lib/types";
import type { MovementRow } from "@/components/almoxarifado/almoxarifado-page-client";

export const dynamic = "force-dynamic";

export default async function AlmoxarifadoPage() {
  const supabase = createClient();

  const [
    itemsRes,
    movementsRes,
    categoriesRes,
    obrasRes,
    sectorsRes,
    machinesRes,
    requestsRes,
  ] = await Promise.all([
    supabase.from("v_supply_stock").select("*").order("name", { ascending: true }),
    supabase
      .from("supply_movements")
      // sem join com supply_obras: o nome da obra sai do id, já que a lista de
      // obras vem junto — assim a consulta não quebra se a 051 não tiver rodado
      .select("*, supply_items(name, unit)")
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("supply_categories").select("*").order("name", { ascending: true }),
    // obras do módulo (migration 051 — sem ela a tela segue funcionando)
    supabase.from("v_supply_obra_usage").select("*").order("name", { ascending: true }),
    // setores das obras (migration 057 — sem ela volta vazio e a tela segue igual)
    supabase.from("supply_obra_sectors").select("*").order("name", { ascending: true }),
    // frota: o envio do técnico pode ter vindo com máquina, e o nome sai do id
    supabase.from("machines").select("*").order("name", { ascending: true }),
    // o que os técnicos avisaram que usaram, esperando baixa (migration 052 —
    // sem ela a aba fica vazia e o resto da tela continua igual). Mais antigo
    // primeiro: quem mandou primeiro é conferido primeiro.
    supabase
      .from("supply_requests")
      .select("*, supply_items(name, unit), supply_obras(name)")
      .order("created_at", { ascending: true })
      .limit(100),
  ]);

  return (
    <AlmoxarifadoPageClient
      items={(itemsRes.data as SupplyItemWithStock[]) ?? []}
      movements={(movementsRes.data as MovementRow[]) ?? []}
      categories={(categoriesRes.data as SupplyCategory[]) ?? []}
      obras={(obrasRes.data as SupplyObraUsage[]) ?? []}
      sectors={(sectorsRes.data as SupplyObraSector[]) ?? []}
      machines={(machinesRes.data as Machine[]) ?? []}
      requests={(requestsRes.data as SupplyRequestRow[]) ?? []}
    />
  );
}
