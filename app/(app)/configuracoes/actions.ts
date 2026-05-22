"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AlertType, UserRole } from "@/lib/types";

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

// ── Admin: user management ────────────────────────────────────────────────────

export async function inviteUser(
  formData: FormData
): Promise<{ error: string } | { ok: true }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { error: "Acesso restrito a administradores" };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "financeiro") as UserRole;
  const password = String(formData.get("password") ?? "").trim();

  if (!email) return { error: "Email obrigatório" };
  if (!password || password.length < 6) return { error: "Senha deve ter no mínimo 6 caracteres" };
  if (!["admin", "financeiro", "visualizador", "operador"].includes(role))
    return { error: "Perfil de acesso inválido" };

  const admin = createAdminClient();

  const { data, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName || null, role },
  });

  if (createError) return { error: createError.message };

  await admin.from("profiles").upsert({
    id: data.user.id,
    email,
    full_name: fullName || null,
    role,
  });

  revalidatePath("/configuracoes");
  return { ok: true };
}

export async function removeUser(
  targetUserId: string
): Promise<{ error: string } | { ok: true }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (targetUserId === user.id)
    return { error: "Você não pode remover sua própria conta" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { error: "Acesso restrito a administradores" };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(targetUserId);
  if (error) return { error: error.message };

  revalidatePath("/configuracoes");
  return { ok: true };
}
