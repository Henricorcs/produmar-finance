import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/auth";
import { AnexoMobiliaPrint } from "@/components/alugueis/anexo-mobilia-print";
import { itensValidos } from "@/lib/anexo-mobilia";
import { documentoAssinado } from "@/lib/documentos-assinados";
import type { RentalContractTemplate, RentalContractView, RentalFurnitureAnnex } from "@/lib/types";

export const dynamic = "force-dynamic";

/** O ANEXO DE MOBÍLIA IMPRESSO — com os dados do contrato de aluguel dele. */
export default async function ImprimirAnexoMobiliaPage({ params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  const supabase = createClient();
  const { data, error } = await supabase.from("rental_furniture_annexes").select("*").eq("id", params.id).single();
  const anexo = data as RentalFurnitureAnnex | null;

  const [contratoRes, modeloRes] = anexo
    ? await Promise.all([
        supabase.from("v_rental_contracts").select("*").eq("id", anexo.contract_id).single(),
        supabase
          .from("rental_contract_templates")
          .select("*")
          .eq("active", true)
          .order("created_at")
          .limit(1),
      ])
    : [null, null];
  const contrato = (contratoRes?.data as RentalContractView | null) ?? null;
  const modelo = ((modeloRes?.data as RentalContractTemplate[] | null) ?? [])[0] ?? null;

  if (error || !anexo || !contrato) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <p className="text-lg font-semibold text-slate-700">Anexo não encontrado</p>
          <p className="text-sm text-slate-500 mt-1">
            Ele (ou o contrato dele) pode ter sido apagado — ou a migration 151 ainda não foi rodada.
          </p>
        </div>
      </div>
    );
  }

  const assinado = await documentoAssinado(supabase, "anexo_mobilia", anexo.id);

  return (
    <AnexoMobiliaPrint
      anexo={{ ...anexo, items: itensValidos(anexo.items) }}
      contrato={contrato}
      modeloAluguel={modelo?.body ?? null}
      anexoId={anexo.id}
      assinado={assinado}
    />
  );
}
