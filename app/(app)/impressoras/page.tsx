import { createClient } from "@/lib/supabase/server";
import { ImpressorasPageClient } from "@/components/impressoras/impressoras-page-client";
import type { Printer, PrinterBilling, PrinterContract, PrinterReading } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Quantos meses para trás a tela carrega — é a janela da evolução. */
const MESES_DE_HISTORICO = 24;

/**
 * IMPRESSORAS — o aluguel de impressoras, dentro do módulo Aluguéis.
 *
 * O mês manda na tela, como no aluguel dos imóveis. A fatura de cada mês é
 * fechada com a leitura do contador de cada impressora; a leitura anterior sai
 * da fatura do mês passado, que por isso vem junto (a janela de 24 meses é
 * também o que a aba Evolução mostra).
 */
export default async function ImpressorasPage({
  searchParams,
}: {
  searchParams: { m?: string; c?: string };
}) {
  const supabase = createClient();

  const hoje = new Date();
  const month =
    searchParams.m && /^\d{4}-\d{2}$/.test(searchParams.m)
      ? searchParams.m
      : `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  const [ano, mes] = month.split("-").map(Number);
  const inicio = new Date(ano, mes - 1 - MESES_DE_HISTORICO, 1);
  const desde = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, "0")}-01`;

  const [contratosRes, impressorasRes, faturasRes] = await Promise.all([
    supabase.from("printer_contracts").select("*").order("client_name"),
    supabase.from("printers").select("*").order("unit"),
    supabase
      .from("printer_billings")
      .select("*")
      .gte("competencia", desde)
      .order("competencia", { ascending: false }),
  ]);

  const faturas = (faturasRes.data as PrinterBilling[]) ?? [];

  // As leituras das faturas da janela: o mês da tela, o anterior (de onde sai
  // a leitura anterior) e o histórico da evolução.
  let leituras: PrinterReading[] = [];
  if (faturas.length > 0) {
    const { data } = await supabase
      .from("printer_readings")
      .select("*")
      .in(
        "billing_id",
        faturas.map((f) => f.id)
      );
    leituras = (data as PrinterReading[]) ?? [];
  }

  return (
    <ImpressorasPageClient
      contracts={(contratosRes.data as PrinterContract[]) ?? []}
      printers={(impressorasRes.data as Printer[]) ?? []}
      billings={faturas}
      readings={leituras}
      month={month}
      contractId={searchParams.c ?? null}
      migrationPendente={!!contratosRes.error}
    />
  );
}
