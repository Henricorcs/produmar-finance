import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PAPEIS_QUE_RECEBEM_OS, nomeComPapel } from "@/lib/module-access";
import { FrotaPageClient } from "@/components/frota/frota-page-client";
import type {
  Machine,
  OsDaFichaNoRelatorio,
  OsDeOperacoesNaMaquina,
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
    todasAsOsRes,
    osDeOperacoesRes,
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
    // ── O RELATÓRIO DE OS PEGA TUDO ─────────────────────────────────────────
    // Sem recorte de mês e sem recorte de status: a pergunta que ele responde
    // é "o que esta máquina já fez e o que ainda deve", e isso não cabe num
    // mês só. O resto da tela (ficha, calendário, somas) continua no mês.
    supabase
      .from("machine_servicos")
      .select("id, machine_id, service_date, status, started_at, total")
      .order("service_date", { ascending: false }),

    // E a OS de Operações que usou máquina entra junto: ela não está na ficha,
    // mas para quem olha a frota é OS da máquina do mesmo jeito.
    supabase
      .from("service_orders")
      .select("id, machine_id, status, issue_date, delivery_date, total_amount")
      .not("machine_id", "is", null)
      .order("issue_date", { ascending: false }),
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

  // Quem pode receber a OS no celular: operador, encarregado e também o outro
  // admin — o serviço às vezes é do chefe, e antes ele não aparecia na lista.
  // Usa o service-role porque a RLS de profiles só deixa o admin ver os outros.
  // Best-effort: sem a service key, a tela segue sem a lista (a OS fica só no
  // escritório, como era antes).
  let operators: { id: string; name: string }[] = [];
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, email, role")
      .in("role", [...PAPEIS_QUE_RECEBEM_OS])
      .order("full_name", { ascending: true });
    operators = ((data as Pick<Profile, "id" | "full_name" | "email" | "role">[]) ?? []).map(
      (p) => ({
        id: p.id,
        // A marca "admin" evita a troca de pessoa quando o nome se repete na
        // lista — o operador João e o admin João ficam distintos.
        name: nomeComPapel(p.full_name || p.email, p.role),
      })
    );
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
      todasAsOs={(todasAsOsRes.data as OsDaFichaNoRelatorio[]) ?? []}
      osDeOperacoes={
        (osDeOperacoesRes.data as OsDeOperacoesNaMaquina[]) ?? []
      }
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
