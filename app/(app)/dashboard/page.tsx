import { createClient } from "@/lib/supabase/server";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { CashflowChart } from "@/components/dashboard/cashflow-chart";
import { CashflowProjection } from "@/components/dashboard/cashflow-projection";
import { ExpenseBreakdown } from "@/components/dashboard/expense-breakdown";
import { UpcomingBills } from "@/components/dashboard/upcoming-bills";
import { RefreshCw, Wallet, TrendingUp, TrendingDown, Clock, Banknote } from "lucide-react";
import type {
  DashboardKPIs,
  ExpenseByCategory,
  CashflowMonth,
  CashflowProjectionDay,
  Transaction,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();

  // Marca contas vencidas em background (não bloqueia)
  void supabase.rpc("mark_overdue");

  const { data: { user } } = await supabase.auth.getUser();

  const [kpisRes, expensesRes, cashflowRes, projectionRes, billsRes, profileRes] = await Promise.all([
    supabase.from("v_dashboard_kpis").select("*").single(),
    supabase.from("v_expenses_by_category").select("*"),
    supabase.from("v_cashflow_6m").select("*"),
    supabase.from("v_cashflow_projection").select("*"),
    supabase
      .from("transactions")
      .select("*, contacts(name)")
      .eq("type", "saida")
      .in("status", ["pendente", "vencido"])
      .order("due_date", { ascending: true })
      .limit(5),
    user
      ? supabase.from("profiles").select("full_name").eq("id", user.id).single()
      : Promise.resolve({ data: null }),
  ]);

  const kpis = (kpisRes.data as DashboardKPIs | null) ?? {
    saldo_atual: 0,
    receitas_mes: 0,
    despesas_mes: 0,
    a_pagar_7dias: 0,
    a_receber_mes: 0,
    count_receitas_mes: 0,
    count_despesas_mes: 0,
    count_a_pagar_7dias: 0,
    count_a_receber_mes: 0,
  };

  const expenses = (expensesRes.data as ExpenseByCategory[]) ?? [];
  const cashflow = (cashflowRes.data as CashflowMonth[]) ?? [];
  const projection = (projectionRes.data as CashflowProjectionDay[]) ?? [];
  const bills = (billsRes.data as Transaction[]) ?? [];
  const firstName =
    (profileRes.data as { full_name?: string } | null)?.full_name?.split(" ")[0] ?? "";

  const month = new Date().toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric"
  });
  const monthCapitalized = month.charAt(0).toUpperCase() + month.slice(1);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">
            {firstName ? `Olá, ${firstName}` : "Bem-vindo"} — {monthCapitalized}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Visão geral das finanças da PRODUMAR</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-produmar-50 dark:bg-produmar-900/30 text-produmar-700 dark:text-produmar-400 rounded-full font-medium">
          <RefreshCw className="w-3 h-3" />
          Atualizado agora
        </div>
      </div>

      {/* KPI cards — Saldo em destaque full-width no mobile, depois 2×2; 5 em linha no desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Saldo atual"
          value={kpis.saldo_atual}
          caption="Receitas - despesas pagas"
          variant="primary"
          icon={Wallet}
          href="/para-onde-foi"
          wide
          className="col-span-2 lg:col-span-1"
        />
        <KpiCard
          label="Receitas (mês)"
          value={kpis.receitas_mes}
          caption={`${kpis.count_receitas_mes} lançamento(s)`}
          variant="success"
          icon={TrendingUp}
          href="/contas?filter=pagos"
        />
        <KpiCard
          label="Despesas (mês)"
          value={kpis.despesas_mes}
          caption={`${kpis.count_despesas_mes} lançamento(s)`}
          variant="danger"
          icon={TrendingDown}
          href="/para-onde-foi"
        />
        <KpiCard
          label="A receber (mês)"
          value={kpis.a_receber_mes}
          caption={`${kpis.count_a_receber_mes} pendente(s)`}
          variant="info"
          icon={Banknote}
          href="/contas?filter=a-receber"
        />
        <KpiCard
          label="A pagar (7 dias)"
          value={kpis.a_pagar_7dias}
          caption={`${kpis.count_a_pagar_7dias} conta(s)`}
          variant="warning"
          icon={Clock}
          href="/contas?filter=a-pagar"
        />
      </div>

      {/* Gráfico */}
      <CashflowChart data={cashflow} />

      {/* Projeção 90 dias */}
      <CashflowProjection data={projection} saldoAtual={kpis.saldo_atual} />

      {/* Bottom grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ExpenseBreakdown data={expenses} />
        <UpcomingBills bills={bills} />
      </div>
    </div>
  );
}
