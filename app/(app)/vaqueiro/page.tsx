import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VaqueiroClient } from "@/components/vaqueiro/vaqueiro-client";

export const dynamic = "force-dynamic";

export default async function VaqueiroPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // Tela fechada: só o vaqueiro (e o admin, para conferir/testar).
  if (profile?.role !== "vaqueiro" && profile?.role !== "admin") redirect("/inicio");

  return <VaqueiroClient />;
}
