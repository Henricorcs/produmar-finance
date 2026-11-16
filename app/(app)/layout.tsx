import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId, getProfile } from "@/lib/auth";
import { Topbar } from "@/components/layout/topbar";
import { TabsNav } from "@/components/layout/tabs-nav";
import { hasHubModules } from "@/lib/module-access";
import type { UserNote } from "@/lib/types";

/**
 * O dia de `meses` meses atrás (AAAA-MM-DD). Dia que não existe no mês de
 * destino cai no último dia dele (31/10 − 8 meses = 28/02), como o Postgres.
 */
function mesesAtras(base: Date, meses: number): string {
  const total = base.getFullYear() * 12 + base.getMonth() - meses;
  const ano = Math.floor(total / 12);
  const mes = total % 12;
  const ultimo = new Date(ano, mes + 1, 0).getDate();
  const dia = Math.min(base.getDate(), ultimo);
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();

  // Sem ida e volta: o middleware já conferiu a sessão e passou o id no header.
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  const today = new Date();
  const in7days = new Date(today);
  in7days.setDate(today.getDate() + 7);
  const todayStr = today.toISOString().split("T")[0];
  const in7daysStr = in7days.toISOString().split("T")[0];

  // Perfil e notificações saem na mesma leva. Antes o layout esperava o perfil
  // chegar para só então pedir as notificações — duas esperas em fila, em toda
  // tela aberta. As notificações só aparecem para admin/financeiro; para os
  // outros perfis o resultado é descartado, mas como vai junto não custa tempo.
  // O bloco de notas vai na mesma leva: é uma linha só, do próprio usuário, e
  // aparece no topo de toda tela. Sem a migration 090 a consulta dá erro e o
  // bloco abre em branco — quem tentar escrever recebe o recado de rodá-la.
  // Alerta de desmame (migration 145): crias bovinas no rebanho com 8 a 11
  // meses de nascidas, sem o desmame marcado — a mesma regra de
  // prontaParaDesmame, contada direto no banco (só o número, sem as linhas).
  // Sem a migration a consulta dá erro e o sino só não mostra a linha.
  const desmameAte = mesesAtras(today, 8);
  const desmameDesde = mesesAtras(today, 12);

  const [profile, notifRes, notaRes, desmameRes] = await Promise.all([
    getProfile(),
    supabase
      .from("transactions")
      .select("id, description, amount, due_date, status, type")
      .in("status", ["vencido", "pendente"])
      .lte("due_date", in7daysStr)
      .order("due_date", { ascending: true })
      .limit(10),
    supabase
      .from("user_notes")
      .select("content, updated_at")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("animals")
      .select("id", { count: "exact", head: true })
      .eq("species", "bovino")
      .eq("active", true)
      .is("desmame_em", null)
      .lte("birth_date", desmameAte)
      .gt("birth_date", desmameDesde),
  ]);
  const desmames = desmameRes.error ? 0 : desmameRes.count ?? 0;

  const notaRow = notaRes.data as Pick<UserNote, "content" | "updated_at"> | null;
  const nota = notaRow?.content ?? "";
  // A hora da última gravação aparece no rodapé do bloco ("Salvo às 11:33").
  const notaEm = notaRow?.updated_at ?? null;

  const isVisualizador = profile?.role === "visualizador";
  // O encarregado anda pelo mesmo caminho do operador: painel de OS + os
  // módulos liberados para ele (migration 079).
  const isOperador     = profile?.role === "operador" || profile?.role === "encarregado";
  const isVaqueiro     = profile?.role === "vaqueiro";
  const isTecnico      = profile?.role === "tecnico";
  const isPrefeitura   = profile?.role === "prefeitura";
  // Chácaras: a agenda das chácaras e mais nada, no mesmo molde (migration 143)
  const isChacaras     = profile?.role === "chacaras";

  // Prefeitura: a tela das notas e mais nada — sem nav de módulos, mas na
  // largura cheia, porque a tela é uma tabela (migration 104).
  if (isPrefeitura || isChacaras) {
    return (
      <div className="min-h-screen bg-produmar-50/40 dark:bg-slate-950">
        <Topbar profile={profile} notifications={[]} nota={nota} notaEm={notaEm} />
        <main className="max-w-7xl mx-auto px-4 lg:px-6 pt-6 pb-8">{children}</main>
      </div>
    );
  }

  // Layout simplificado para visualizador — sem nav, sem notificações
  if (isVisualizador) {
    return (
      <div className="min-h-screen bg-produmar-50/40 dark:bg-slate-950">
        <Topbar profile={profile} notifications={[]} nota={nota} notaEm={notaEm} />
        <main className="max-w-7xl mx-auto px-4 lg:px-6 pt-6 pb-8">{children}</main>
      </div>
    );
  }

  // Vaqueiro e técnico: uma tela só, um formulário — sem nav, sem notificações,
  // container estreito (é um formulário, não um painel).
  if (isVaqueiro || isTecnico) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <Topbar profile={profile} notifications={[]} nota={nota} notaEm={notaEm} />
        <main className="max-w-3xl mx-auto px-4 lg:px-6 pt-6 pb-8">{children}</main>
      </div>
    );
  }

  // Operador sem módulos → layout simplificado (painel de OS apenas).
  // Operador com módulos liberados → layout completo, com hub e nav dos módulos.
  if (isOperador) {
    // permissão avulsa (a aba de avisar material) não conta: quem só a tem
    // continua com o painel simples, sem hub e sem nav de módulos
    const hasModules = hasHubModules(profile?.allowed_modules);
    if (!hasModules) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
          <Topbar profile={profile} notifications={[]} nota={nota} notaEm={notaEm} />
          <main className="max-w-3xl mx-auto px-4 lg:px-6 pt-6 pb-8">{children}</main>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-produmar-50/40 dark:bg-slate-950">
        <Topbar profile={profile} notifications={[]} nota={nota} notaEm={notaEm} />
        <TabsNav role={profile?.role} />
        <main className="max-w-7xl mx-auto px-4 lg:px-6 pt-6 pb-safe-nav">{children}</main>
      </div>
    );
  }

  // Layout completo para admin / financeiro
  const notifications = (notifRes.data ?? []).map((t) => ({
    ...t,
    isOverdue: t.status === "vencido" || t.due_date < todayStr,
  }));

  return (
    <div className="min-h-screen bg-produmar-50/40 dark:bg-slate-950">
      <Topbar
        profile={profile}
        notifications={notifications}
        nota={nota}
        notaEm={notaEm}
        desmames={desmames}
      />
      <TabsNav />
      {/* pb-safe-nav limpa a nav fixa (64px) + área segura do dispositivo no mobile */}
      <main className="max-w-7xl mx-auto px-4 lg:px-6 pt-6 pb-safe-nav">{children}</main>
    </div>
  );
}
