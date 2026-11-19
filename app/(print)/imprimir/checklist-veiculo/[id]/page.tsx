import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/auth";
import { ChecklistVeiculoPrint } from "@/components/devedores/checklist-veiculo-print";
import type { VehicleDeliveryChecklist } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * O CHECKLIST DE ENTREGA DE VEÍCULO IMPRESSO (migration 150) — uma folha A4
 * que o comprador confere, marca à caneta e assina junto com a PRODUMAR.
 */
export default async function ImprimirChecklistVeiculoPage({ params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("vehicle_delivery_checklists")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <p className="text-lg font-semibold text-slate-700">Checklist não encontrado</p>
          <p className="text-sm text-slate-500 mt-1">Ele pode ter sido apagado.</p>
        </div>
      </div>
    );
  }

  return <ChecklistVeiculoPrint checklist={data as VehicleDeliveryChecklist} />;
}
