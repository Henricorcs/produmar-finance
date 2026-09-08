import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId, getProfile } from "@/lib/auth";
import { Topbar } from "@/components/layout/topbar";
import { TabsNav } from "@/components/layout/tabs-nav";
import { hasHubModules } from "@/lib/module-access";
import type { UserNote } from "@/lib/types";

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
  const [profile, notifRes, notaRes] = await Promise.all([
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
  ]);

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
        <TabsNav />
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
      <Topbar profile={profile} notifications={notifications} nota={nota} notaEm={notaEm} />
      <TabsNav />
      {/* pb-safe-nav limpa a nav fixa (64px) + área segura do dispositivo no mobile */}
      <main className="max-w-7xl mx-auto px-4 lg:px-6 pt-6 pb-safe-nav">{children}</main>
    </div>
  );
}
