import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/auth";
import { CompraVendaPrint } from "@/components/alugueis/compra-venda-print";
import { contratoEmBranco } from "@/lib/compra-venda-contrato";
import type { PropertyBuyer, PropertySaleContract, RentalContractTemplate } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * O CONTRATO DE COMPRA E VENDA IMPRESSO.
 *
 * Junta o contrato preenchido na tela com o modelo do contrato de aluguel, que
 * é de onde sai a qualificação da PRODUMAR (a compradora). O id "em-branco"
 * imprime o contrato só com as linhas, para preencher à caneta.
 */
export default async function ImprimirCompraVendaPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  const emBranco = params.id === "em-branco";

  const [contratoRes, modeloRes] = await Promise.all([
    emBranco
      ? Promise.resolve({ data: contratoEmBranco(), error: null })
      : supabase.from("property_sale_contracts").select("*").eq("id", params.id).single(),
    supabase
      .from("rental_contract_templates")
      .select("*")
      .eq("active", true)
      .order("created_at")
      .limit(1),
  ]);

  const contrato = contratoRes.data as PropertySaleContract | null;

  if (contratoRes.error || !contrato) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <p className="text-lg font-semibold text-slate-700">Contrato não encontrado</p>
          <p className="text-sm text-slate-500 mt-1">
            Ele pode ter sido apagado — ou a migration 110 ainda não foi rodada.
          </p>
        </div>
      </div>
    );
  }

  const modelo = ((modeloRes.data as RentalContractTemplate[]) ?? [])[0]?.body ?? null;

  // quem compra (115): sem comprador escolhido, é a PRODUMAR
  let comprador: PropertyBuyer | null = null;
  if (contrato.buyer_id) {
    const { data } = await supabase
      .from("property_buyers")
      .select("*")
      .eq("id", contrato.buyer_id)
      .maybeSingle();
    comprador = (data as PropertyBuyer | null) ?? null;
  }

  return <CompraVendaPrint contrato={contrato} modeloAluguel={modelo} comprador={comprador} />;
}
