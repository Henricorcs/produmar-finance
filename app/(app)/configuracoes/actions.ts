"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AlertType } from "@/lib/types";

export async function saveAlertConfig(
  alertType: AlertType,
  enabled: boolean,
  daysBefore?: number | null
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { error } = await supabase.from("alert_configs").upsert(
    {
      user_id: user.id,
      alert_type: alertType,
      enabled,
      days_before: daysBefore ?? null,
    },
    { onConflict: "user_id,alert_type,days_before" }
  );

  if (error) return { error: error.message };

  revalidatePath("/configuracoes");
  return { ok: true };
}

export async function updateProfile(
  formData: FormData
): Promise<{ error: string } | { ok: true }> {
  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return { error: "Nome é obrigatório" };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { error } = await supabase
    .from("profiles")
    .update({ full_name })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/configuracoes");
  return { ok: true };
}
