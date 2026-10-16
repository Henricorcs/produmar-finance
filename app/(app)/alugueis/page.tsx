import { createClient } from "@/lib/supabase/server";
import { AlugueisPageClient } from "@/components/alugueis/alugueis-page-client";
import type {
  PropertySaleContract,
  RentalContractTemplate,
  RentalContractView,
  RentalPayment,
  RentalProperty,
} from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * ALUGUÉIS — os imóveis, os contratos e o aluguel de cada mês.
 *
 * O mês manda na tela (como em Contas e Operações). A cobrança do mês não vem
 * do banco: ela nasce da conta do contrato, e o que se carrega daqui são as
 * BAIXAS já feitas.
 */
export default async function AlugueisPage({
  searchParams,
}: {
  searchParams: { m?: string };
}) {
  const supabase = createClient();

  const today = new Date();
  const month =
    searchParams.m ??
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const [year, monthNum] = month.split("-").map(Number);
  const startDate = `${month}-01`;
  const endDate = new Date(year, monthNum, 0).toISOString().split("T")[0];

  const [propertiesRes, contractsRes, paymentsRes, templateRes, vendasRes] = await Promise.all([
    supabase.from("rental_properties").select("*").order("code"),
    supabase.from("v_rental_contracts").select("*").order("property_code"),
    // as baixas do mês da tela — é o que diz quem já pagou
    supabase
      .from("rental_payments")
      .select("*")
      .gte("competencia", startDate)
      .lte("competencia", endDate),
    supabase
      .from("rental_contract_templates")
      .select("*")
      .eq("active", true)
      .order("created_at")
      .limit(1),
    // contratos de compra e venda (migration 110 — sem ela a aba abre vazia
    // e o resto da tela segue igual)
    supabase
      .from("property_sale_contracts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const templates = (templateRes.data as RentalContractTemplate[]) ?? [];

  return (
    <AlugueisPageClient
      properties={(propertiesRes.data as RentalProperty[]) ?? []}
      contracts={(contractsRes.data as RentalContractView[]) ?? []}
      payments={(paymentsRes.data as RentalPayment[]) ?? []}
      template={templates[0] ?? null}
      compras={(vendasRes.data as PropertySaleContract[]) ?? []}
      compraVendaPendente={!!vendasRes.error}
      month={month}
      migrationPendente={!!propertiesRes.error}
    />
  );
}
