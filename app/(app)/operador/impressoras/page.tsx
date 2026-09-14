import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { canLerImpressoras } from "@/lib/module-access";
import { OperadorImpressorasClient } from "@/components/operador/impressoras-leitura-client";
import type { Printer, PrinterBilling, PrinterContract, PrinterReading } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * A LEITURA DAS IMPRESSORAS, no painel de quem lê os contadores.
 *
 * O operador vai de impressora em impressora, anota o contador e fecha a fatura
 * do mês por aqui — e o relatório em PDF sai no fim, para mandar ao cliente. É
 * a mesma tela de leituras do módulo Aluguéis; o que ele NÃO tem daqui é
 * contrato, cadastro de impressora, baixa ou exclusão.
 *
 * Liberada por pessoa: só entra quem tem "Leitura das impressoras" marcada no
 * cadastro (migration 097 guarda a mesma regra no banco).
 */
export default async function OperadorImpressorasPage({
  searchParams,
}: {
  searchParams: { m?: string };
}) {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!canLerImpressoras(profile.role, profile.allowed_modules))
    redirect(profile.role === "operador" || profile.role === "encarregado" ? "/operador" : "/inicio");

  const hoje = new Date();
  const month =
    searchParams.m && /^\d{4}-\d{2}$/.test(searchParams.m)
      ? searchParams.m
      : `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  // A leitura anterior sai da fatura mais recente antes do mês — alguns meses
  // para trás bastam, e mantêm a tela leve no 4G.
  const [ano, mes] = month.split("-").map(Number);
  const inicio = new Date(ano, mes - 1 - 6, 1);
  const desde = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, "0")}-01`;

  const supabase = createClient();
  const [contratosRes, impressorasRes, faturasRes] = await Promise.all([
    supabase.from("printer_contracts").select("*").eq("status", "ativo").order("client_name"),
    supabase.from("printers").select("*").order("unit"),
    supabase
      .from("printer_billings")
      .select("*")
      .gte("competencia", desde)
      .order("competencia", { ascending: false }),
  ]);

  const faturas = (faturasRes.data as PrinterBilling[]) ?? [];
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
    <OperadorImpressorasClient
      contracts={(contratosRes.data as PrinterContract[]) ?? []}
      printers={(impressorasRes.data as Printer[]) ?? []}
      billings={faturas}
      readings={leituras}
      month={month}
      migrationPendente={!!contratosRes.error}
    />
  );
}
