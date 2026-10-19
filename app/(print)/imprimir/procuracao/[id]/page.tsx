import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/auth";
import { ProcuracaoPrint } from "@/components/alugueis/procuracao-print";
import { procuracaoEmBranco } from "@/lib/procuracao";
import type { PowerOfAttorney } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * A PROCURAÇÃO IMPRESSA. O id "em-branco" imprime só com as linhas, para
 * preencher à caneta.
 */
export default async function ImprimirProcuracaoPage({ params }: { params: { id: string } }) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  const { data, error } =
    params.id === "em-branco"
      ? { data: procuracaoEmBranco(), error: null }
      : await createClient().from("power_of_attorneys").select("*").eq("id", params.id).single();

  const procuracao = data as PowerOfAttorney | null;

  if (error || !procuracao) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <p className="text-lg font-semibold text-slate-700">Procuração não encontrada</p>
          <p className="text-sm text-slate-500 mt-1">
            Ela pode ter sido apagada — ou a migration 121 ainda não foi rodada.
          </p>
        </div>
      </div>
    );
  }

  return <ProcuracaoPrint procuracao={procuracao} />;
}
