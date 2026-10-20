import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/auth";
import { ContratoPrint } from "@/components/alugueis/contrato-print";
import { documentoAssinado } from "@/lib/documentos-assinados";
import type { RentalContractTemplate, RentalContractView } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * O CONTRATO DE LOCAÇÃO IMPRESSO.
 *
 * Junta duas coisas: o contrato cadastrado (inquilino, valor, prazo) e o modelo
 * de texto de vocês. Os {{CAMPOS}} do modelo são trocados na hora — é o que
 * antes era escrito à mão em vermelho.
 */
export default async function ImprimirContratoPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  // Id vem do header que o middleware preencheu — sem ida e volta ao Supabase.
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  const [contratoRes, modeloRes] = await Promise.all([
    supabase.from("v_rental_contracts").select("*").eq("id", params.id).single(),
    supabase
      .from("rental_contract_templates")
      .select("*")
      .eq("active", true)
      .order("created_at")
      .limit(1),
  ]);

  const contrato = contratoRes.data as RentalContractView | null;

  if (contratoRes.error || !contrato) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <p className="text-lg font-semibold text-slate-700">Contrato não encontrado</p>
          <p className="text-sm text-slate-500 mt-1">
            Ele pode ter sido apagado — ou a migration 078 ainda não foi rodada.
          </p>
        </div>
      </div>
    );
  }

  const modelo = ((modeloRes.data as RentalContractTemplate[]) ?? [])[0]?.body ?? "";

  if (!modelo.trim()) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <p className="text-lg font-semibold text-slate-700">
            O modelo do contrato está vazio
          </p>
          <p className="text-sm text-slate-500 mt-1">
            Abra Aluguéis → Modelo do contrato e cole o texto do contrato de vocês.
          </p>
        </div>
      </div>
    );
  }

  // o PDF assinado com certificado, se já tiver (123)
  const assinado = await documentoAssinado(supabase, "aluguel", contrato.id);

  return <ContratoPrint contrato={contrato} modelo={modelo} assinado={assinado} />;
}
