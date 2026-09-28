"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AlertType, UserRole } from "@/lib/types";

/** Perfis que chegaram por migration recente — se ela não rodou, o enum user_role não tem o valor. */
const ROLE_MIGRATION: Partial<Record<UserRole, { migration: string; label: string }>> = {
  vaqueiro: { migration: "048", label: "Vaqueiro" },
  tecnico: { migration: "052", label: "Encarregado de obra" },
  encarregado: { migration: "079", label: "Encarregado" },
  prefeitura: { migration: "104", label: "Prefeitura" },
};

/**
 * Os perfis de acesso vivem num enum do banco (user_role). Quando o perfil é
 * novo e a migration não rodou, o Postgres reclama de "invalid input value for
 * enum user_role" — e, se quem barrou foi um trigger do auth, o GoTrue devolve
 * só um "Database error creating new user". Nenhum dos dois diz a ninguém o que
 * fazer.
 */
function roleError(error: { message?: string | null } | null, role?: UserRole): string {
  const message = error?.message ?? "";
  const pending = role ? ROLE_MIGRATION[role] : undefined;
  const enumRecusou =
    message.includes("user_role") || message.toLowerCase().includes("database error");
  if (pending && enumRecusou)
    return `Rode a migration ${pending.migration} no Supabase para usar o perfil ${pending.label}`;
  return message || "Erro inesperado no banco de dados";
}

/**
 * Server action que estoura vira resposta 500 — e o Next 14 resolve a promise
 * do cliente com `undefined` em vez de rejeitar, derrubando a tela inteira (ver
 * `actionError` em lib/action-result). Por isso as actions de admin abaixo
 * embrulham o cliente de serviço: exceção nenhuma pode escapar daqui.
 */
function crashMessage(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  if (message.includes("SUPABASE_SERVICE_ROLE_KEY"))
    return "Falta a chave de serviço do Supabase (SUPABASE_SERVICE_ROLE_KEY) nas variáveis de ambiente do servidor";
  return message || "Erro inesperado no servidor";
}

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
  if (role !== "operador" && role !== "encarregado") allowedCategories = [];

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
  if (role !== "financeiro" && role !== "operador" && role !== "encarregado")
    allowedModules = [];

  if (!email) return { error: "Email obrigatório" };
  if (!password || password.length < 6) return { error: "Senha deve ter no mínimo 6 caracteres" };
  if (
    ![
      "admin",
      "financeiro",
      "visualizador",
      "operador",
      "encarregado",
      "vaqueiro",
      "tecnico",
      "prefeitura",
    ].includes(role)
  )
    return { error: "Perfil de acesso inválido" };

  try {
    const admin = createAdminClient();

    const { data, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      // allowed_modules vai no metadata p/ o middleware bloquear rotas sem consultar o banco.
      user_metadata: { full_name: fullName || null, role, allowed_modules: allowedModules },
    });

    if (createError) return { error: roleError(createError, role) };
    if (!data?.user) return { error: "O Supabase não devolveu o usuário criado" };

    const { error: profileError } = await admin.from("profiles").upsert({
      id: data.user.id,
      email,
      full_name: fullName || null,
      role,
      allowed_categories: allowedCategories,
      allowed_modules: allowedModules,
    });

    // Sem a linha em profiles o usuário nasce quebrado: entra no login e nenhuma
    // tela sabe quem ele é. Melhor desfazer o convite e dizer o que faltou.
    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id);
      return { error: roleError(profileError, role) };
    }
  } catch (e) {
    return { error: crashMessage(e) };
  }

  revalidatePath("/configuracoes");
  return { ok: true };
}

/**
 * Admin muda o perfil de acesso de um usuário (ex.: financeiro → admin).
 *
 * O perfil vive em dois lugares: em profiles.role (que manda nas policies do
 * banco) e no user_metadata do auth (que o middleware lê para liberar rota).
 * Os dois têm que andar juntos — senão o usuário vira admin no banco e continua
 * barrado na tela, ou o contrário.
 *
 * As categorias e os módulos liberados não são mexidos: quem for promovido a
 * admin passa a ver tudo de qualquer jeito, e voltando ao perfil antigo as
 * liberações continuam valendo.
 */
export async function updateUserRole(
  targetUserId: string,
  role: UserRole
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

  if (
    ![
      "admin",
      "financeiro",
      "visualizador",
      "operador",
      "encarregado",
      "vaqueiro",
      "tecnico",
      "prefeitura",
    ].includes(role)
  )
    return { error: "Perfil de acesso inválido" };

  // rebaixar a si mesmo tira o próprio acesso de admin e tranca a porta por dentro
  if (targetUserId === user.id)
    return { error: "Você não pode mudar seu próprio perfil de acesso" };

  try {
    const admin = createAdminClient();

    const { error } = await admin.from("profiles").update({ role }).eq("id", targetUserId);
    if (error) return { error: roleError(error, role) };

    const { data: target } = await admin.auth.admin.getUserById(targetUserId);
    const { error: metaError } = await admin.auth.admin.updateUserById(targetUserId, {
      user_metadata: { ...(target?.user?.user_metadata ?? {}), role },
    });
    if (metaError) return { error: metaError.message };
  } catch (e) {
    return { error: crashMessage(e) };
  }

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

  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from("profiles")
      .update({ allowed_categories: clean })
      .eq("id", targetUserId);
    if (error) return { error: error.message };
  } catch (e) {
    return { error: crashMessage(e) };
  }

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

  try {
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
  } catch (e) {
    return { error: crashMessage(e) };
  }

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

  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(targetUserId);
    if (error) return { error: error.message };
  } catch (e) {
    return { error: crashMessage(e) };
  }

  revalidatePath("/configuracoes");
  return { ok: true };
}
