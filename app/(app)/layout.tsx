import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/layout/topbar";
import { TabsNav } from "@/components/layout/tabs-nav";
import type { Profile } from "@/lib/types";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profileRes = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const profile = profileRes.data as Profile | null;
  const isVisualizador = profile?.role === "visualizador";
  const isOperador     = profile?.role === "operador";

  // Layout simplificado para visualizador — sem nav, sem notificações
  if (isVisualizador) {
    return (
      <div className="min-h-screen bg-produmar-50/40 dark:bg-slate-950">
        <Topbar profile={profile} notifications={[]} />
        <main className="max-w-7xl mx-auto px-4 lg:px-6 pt-6 pb-8">{children}</main>
      </div>
    );
  }

  // Layout simplificado para operador — painel de OS apenas
  if (isOperador) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <Topbar profile={profile} notifications={[]} />
        <main className="max-w-3xl mx-auto px-4 lg:px-6 pt-6 pb-8">{children}</main>
      </div>
    );
  }

  // Layout completo para admin / financeiro
  const today = new Date();
  const in7days = new Date(today);
  in7days.setDate(today.getDate() + 7);
  const todayStr = today.toISOString().split("T")[0];
  const in7daysStr = in7days.toISOString().split("T")[0];

  const notifRes = await supabase
    .from("transactions")
    .select("id, description, amount, due_date, status, type")
    .in("status", ["vencido", "pendente"])
    .lte("due_date", in7daysStr)
    .order("due_date", { ascending: true })
    .limit(10);

  const notifications = (notifRes.data ?? []).map((t) => ({
    ...t,
    isOverdue: t.status === "vencido" || t.due_date < todayStr,
  }));

  return (
    <div className="min-h-screen bg-produmar-50/40 dark:bg-slate-950">
      <Topbar profile={profile} notifications={notifications} />
      <TabsNav />
      {/* pb-safe-nav limpa a nav fixa (56px) + área segura do dispositivo no mobile */}
      <main className="max-w-7xl mx-auto px-4 lg:px-6 pt-6 pb-safe-nav">{children}</main>
    </div>
  );
}
