import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FrotaPageClient } from "@/components/frota/frota-page-client";
import type {
  Machine,
  MachineDespesa,
  MachineFichaLinha,
  MachineParceiro,
  MachineParceiroSaldo,
  MachineParceiroVeiculo,
  MachineResumo,
  MachineServico,
  MachineTroca,
  Profile,
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

  const [
    resumoRes,
    fichaRes,
    servicosRes,
    despesasRes,
    parceirosRes,
    trocasRes,
    saldosRes,
    veiculosParceiroRes,
  ] = await Promise.all([
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
    // A troca de diárias com o parceiro (migration 076). Best-effort: sem a
    // migration, a aba abre avisando o que fazer e o resto da tela segue igual.
    supabase.from("machine_parceiros").select("*").eq("active", true).order("name"),
    supabase
      .from("machine_trocas")
      .select("*")
      .gte("entry_date", startDate)
      .lte("entry_date", endDate),
    // o confronto é de SEMPRE: a dívida de diária não zera no fim do mês
    supabase.from("v_machine_parceiro_saldo").select("*"),
    // as placas das máquinas dele (migration 077)
    supabase.from("machine_parceiro_veiculos").select("*").order("plate"),
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

  // Operadores com login, para ENVIAR a OS ao celular deles. Usa o
  // service-role porque a RLS de profiles só deixa o admin ver os outros.
  // Best-effort: sem a service key, a tela segue sem a lista (a OS fica só no
  // escritório, como era antes).
  let operators: { id: string; name: string }[] = [];
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .eq("role", "operador")
      .order("full_name", { ascending: true });
    operators = ((data as Pick<Profile, "id" | "full_name" | "email">[]) ?? []).map((p) => ({
      id: p.id,
      name: p.full_name || p.email,
    }));
  } catch {
    operators = [];
  }

  return (
    <FrotaPageClient
      machines={machines}
      ficha={(fichaRes.data as MachineFichaLinha[]) ?? []}
      servicos={(servicosRes.data as MachineServico[]) ?? []}
      despesas={(despesasRes.data as MachineDespesa[]) ?? []}
      operators={operators}
      parceiros={(parceirosRes.data as MachineParceiro[]) ?? []}
      trocas={(trocasRes.data as MachineTroca[]) ?? []}
      saldos={(saldosRes.data as MachineParceiroSaldo[]) ?? []}
      veiculosDeParceiro={(veiculosParceiroRes.data as MachineParceiroVeiculo[]) ?? []}
      month={month}
      migrationPendente={migrationPendente}
      parceriaPendente={!!parceirosRes.error}
    />
  );
}
