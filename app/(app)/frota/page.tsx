import { createClient } from "@/lib/supabase/server";
import { FrotaPageClient } from "@/components/frota/frota-page-client";
import type {
  Machine,
  MachineDespesa,
  MachineFichaLinha,
  MachineResumo,
  MachineServico,
} from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * FROTA — a ficha de cada máquina e de cada veículo.
 *
 * O mês manda na tela (como em Operações e Contas): a ficha e os números do
 * card são do mês escolhido. O que a máquina rendeu e custou DESDE SEMPRE vem
 * pronto da view v_machine_resumo.
 */
export default async function FrotaPage({
  searchParams,
}: {
  searchParams: { m?: string };
}) {
  // Quem entra aqui já passou pelo middleware: ele é que decide quem enxerga
  // o módulo (o operador com "frota" liberada também trabalha nesta tela).
  const supabase = createClient();

  const today = new Date();
  const month =
    searchParams.m ??
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const [year, monthNum] = month.split("-").map(Number);
  const startDate = `${month}-01`;
  const endDate = new Date(year, monthNum, 0).toISOString().split("T")[0];

  const [resumoRes, fichaRes, servicosRes, despesasRes] = await Promise.all([
    supabase.from("v_machine_resumo").select("*").order("name"),
    supabase
      .from("v_machine_ficha")
      .select("*")
      .gte("entry_date", startDate)
      .lte("entry_date", endDate)
      .order("entry_date", { ascending: false }),
    // os lançamentos crus: é por eles que a ficha abre um para corrigir
    supabase
      .from("machine_servicos")
      .select("*")
      .gte("service_date", startDate)
      .lte("service_date", endDate),
    supabase
      .from("machine_despesas")
      .select("*")
      .gte("expense_date", startDate)
      .lte("expense_date", endDate),
  ]);

  // Migration 073 ainda não rodou: a tela abre com o cadastro que já existe e
  // avisa o que fazer, em vez de parecer que a frota sumiu.
  let machines = (resumoRes.data as MachineResumo[]) ?? [];
  const migrationPendente = !!resumoRes.error;
  if (migrationPendente) {
    const { data } = await supabase.from("machines").select("*").order("name");
    machines = ((data as Machine[]) ?? []).map((m) => ({
      ...m,
      receitas: 0,
      despesas: 0,
      resultado: 0,
      internos: 0,
      a_receber: 0,
      servicos: 0,
      abertas: 0,
      ultimo_movimento: null,
    }));
  }

  return (
    <FrotaPageClient
      machines={machines}
      ficha={(fichaRes.data as MachineFichaLinha[]) ?? []}
      servicos={(servicosRes.data as MachineServico[]) ?? []}
      despesas={(despesasRes.data as MachineDespesa[]) ?? []}
      month={month}
      migrationPendente={migrationPendente}
    />
  );
}
