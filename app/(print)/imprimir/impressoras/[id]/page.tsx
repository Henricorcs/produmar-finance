import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/auth";
import { RelatorioImpressoesPrint } from "@/components/impressoras/relatorio-impressoes-print";
import type { Printer, PrinterBilling, PrinterContract, PrinterReading } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * O RELATÓRIO MENSAL DE IMPRESSÕES impresso — o mesmo desenho da planilha que
 * vai para o cliente junto com a cobrança.
 */
export default async function ImprimirRelatorioImpressoesPage({
  params,
}: {
  params: { id: string };
}) {
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  const supabase = createClient();
  const { data: fatura, error } = await supabase
    .from("printer_billings")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (error || !fatura) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <p className="text-lg font-semibold text-slate-700">Fatura não encontrada</p>
          <p className="text-sm text-slate-500 mt-1">
            Ela pode ter sido apagada — ou a migration 096 ainda não foi rodada.
          </p>
        </div>
      </div>
    );
  }

  const billing = fatura as PrinterBilling;

  const [contratoRes, leiturasRes] = await Promise.all([
    supabase.from("printer_contracts").select("*").eq("id", billing.contract_id).maybeSingle(),
    supabase.from("printer_readings").select("*").eq("billing_id", billing.id),
  ]);

  const leituras = (leiturasRes.data as PrinterReading[]) ?? [];
  let impressoras: Printer[] = [];
  if (leituras.length > 0) {
    const { data } = await supabase
      .from("printers")
      .select("*")
      .in(
        "id",
        leituras.map((l) => l.printer_id)
      );
    impressoras = (data as Printer[]) ?? [];
  }

  return (
    <RelatorioImpressoesPrint
      billing={billing}
      contract={contratoRes.data as PrinterContract | null}
      readings={leituras}
      printers={impressoras}
    />
  );
}
