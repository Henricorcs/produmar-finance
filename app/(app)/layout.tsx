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

  const today = new Date();
  const in7days = new Date(today);
  in7days.setDate(today.getDate() + 7);
  const todayStr = today.toISOString().split("T")[0];
  const in7daysStr = in7days.toISOString().split("T")[0];

  const [profileRes, notifRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    supabase
      .from("transactions")
      .select("id, description, amount, due_date, status, type")
      .in("status", ["vencido", "pendente"])
      .lte("due_date", in7daysStr)
      .order("due_date", { ascending: true })
      .limit(10),
  ]);

  const profile = profileRes.data;
  const notifications = (notifRes.data ?? []).map((t) => ({
    ...t,
    isOverdue: t.status === "vencido" || t.due_date < todayStr,
  }));

  return (
    <div className="min-h-screen bg-produmar-50/40 dark:bg-slate-950">
      <Topbar profile={profile as Profile | null} notifications={notifications} />
      <TabsNav />
      {/* pb-20 on mobile clears the fixed bottom nav (56 px + buffer) */}
      <main className="max-w-7xl mx-auto px-4 lg:px-6 pt-6 pb-20 sm:pb-6">{children}</main>
    </div>
  );
}
