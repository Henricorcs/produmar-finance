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
  // Categorias liberadas (só faz sentido p/ operador) — enviado como JSON.
  let allowedCategories: string[] = [];
  try {
    const raw = formData.get("allowed_categories");
    if (typeof raw === "string" && raw.trim()) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) allowedCategories = parsed.map(String);
    }
  } catch {
    allowedCategories = [];
  }
  if (role !== "operador") allowedCategories = [];

  // Módulos liberados (só faz sentido p/ financeiro) — enviado como JSON.
  let allowedModules: string[] = [];
  try {
    const raw = formData.get("allowed_modules");
    if (typeof raw === "string" && raw.trim()) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) allowedModules = parsed.map(String);
    }
  } catch {
    allowedModules = [];
  }
  if (role !== "financeiro" && role !== "operador") allowedModules = [];

  if (!email) return { error: "Email obrigatório" };
  if (!password || password.length < 6) return { error: "Senha deve ter no mínimo 6 caracteres" };
  if (!["admin", "financeiro", "visualizador", "operador"].includes(role))
    return { error: "Perfil de acesso inválido" };

  const admin = createAdminClient();

  const { data, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    // allowed_modules vai no metadata p/ o middleware bloquear rotas sem consultar o banco.
    user_metadata: { full_name: fullName || null, role, allowed_modules: allowedModules },
  });

  if (createError) return { error: createError.message };

  await admin.from("profiles").upsert({
    id: data.user.id,
    email,
    full_name: fullName || null,
    role,
    allowed_categories: allowedCategories,
    allowed_modules: allowedModules,
  });

  revalidatePath("/configuracoes");
  return { ok: true };
}

/** Admin atualiza as categorias de máquina liberadas para um operador. */
export async function updateOperatorCategories(
  targetUserId: string,
  categories: string[]
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

  const clean = Array.isArray(categories)
    ? [...new Set(categories.map((c) => String(c).trim()).filter(Boolean))]
    : [];

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ allowed_categories: clean })
    .eq("id", targetUserId);
  if (error) return { error: error.message };

  revalidatePath("/configuracoes");
  return { ok: true };
}

/** Admin atualiza os módulos liberados para um usuário (vazio = todos). */
export async function updateUserModules(
  targetUserId: string,
  modules: string[]
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

  const clean = Array.isArray(modules)
    ? [...new Set(modules.map((m) => String(m).trim()).filter(Boolean))]
    : [];

  const admin = createAdminClient();

  const { error } = await admin
    .from("profiles")
    .update({ allowed_modules: clean })
    .eq("id", targetUserId);
  if (error) return { error: error.message };

  // Mantém o metadata em sincronia — é o que o middleware lê p/ bloquear rotas.
  // Preserva as chaves existentes (role, full_name) ao gravar allowed_modules.
  const { data: target } = await admin.auth.admin.getUserById(targetUserId);
  const { error: metaError } = await admin.auth.admin.updateUserById(targetUserId, {
    user_metadata: { ...(target?.user?.user_metadata ?? {}), allowed_modules: clean },
  });
  if (metaError) return { error: metaError.message };

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
