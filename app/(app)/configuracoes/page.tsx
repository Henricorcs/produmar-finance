import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId, getProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertConfigClient } from "@/components/configuracoes/alert-config-client";
import { ProfileFormClient } from "@/components/configuracoes/profile-form-client";
import { CategoriasConfig } from "@/components/configuracoes/categorias-config";
import { UserManagementClient } from "@/components/configuracoes/user-management-client";
import { CertificadosConfig } from "@/components/configuracoes/certificados-config";
import { listarCertificados } from "./certificados-actions";
import { User, Bell, Building2, Tag, Users, BadgeCheck } from "lucide-react";
import type { Profile, Category, CertificadoResumo } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const supabase = createClient();

  // Id vem do header que o middleware preencheu — sem ida e volta ao Supabase.
  const userId = await getCurrentUserId();

  const [profile, alertConfigsRes, categoriesRes] = await Promise.all([
    // perfil do cache da requisição (o layout já buscou) — não consulta de novo
    getProfile(),
    supabase
      .from("alert_configs")
      .select("alert_type, enabled, days_before")
      .eq("user_id", userId!),
    supabase
      .from("categories")
      .select("*")
      .order("type", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  const alertConfigs = alertConfigsRes.data ?? [];
  const categories = (categoriesRes.data as Category[]) ?? [];
  const isAdmin = profile?.role === "admin";

  // Fetch all users if admin (uses service-role key to bypass RLS)
  let allUsers: Profile[] = [];
  if (isAdmin) {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from("profiles")
        .select("*")
        .order("full_name", { ascending: true });
      allUsers = (data as Profile[]) ?? [];
    } catch {
      // If service role key is not configured, skip the user list gracefully
    }
  }

  // certificados A1 (122): só os dados de quem é — o arquivo nunca sai do servidor
  const certificados: { lista: CertificadoResumo[]; erro?: string } = isAdmin
    ? await listarCertificados().catch(() => ({ lista: [], erro: "Não foi possível ler os certificados" }))
    : { lista: [] };

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">
          Configurações
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Gerencie sua conta e preferências
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-produmar-600" />
            <CardTitle>Seu perfil</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ProfileFormClient
            fullName={profile?.full_name ?? ""}
            email={profile?.email ?? ""}
            role={profile?.role ?? "financeiro"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-produmar-600" />
            <CardTitle>Alertas por email</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <AlertConfigClient configs={alertConfigs} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-produmar-600" />
            <CardTitle>Categorias</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <CategoriasConfig categories={categories} />
        </CardContent>
      </Card>

      {/* Admin-only: user management */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-produmar-600" />
              <CardTitle>Usuários</CardTitle>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Gerencie quem tem acesso ao sistema
            </p>
          </CardHeader>
          <CardContent>
            <UserManagementClient users={allUsers} currentUserId={userId!} />
          </CardContent>
        </Card>
      )}

      {/* Admin-only: certificados A1 para assinar contratos e procurações */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BadgeCheck className="w-4 h-4 text-produmar-600" />
              <CardTitle>Certificados digitais</CardTitle>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Os certificados A1 que assinam contratos e procurações direto do sistema — o botão
              &quot;Assinar&quot; aparece na impressão de cada um
            </p>
          </CardHeader>
          <CardContent>
            <CertificadosConfig iniciais={certificados.lista} erroInicial={certificados.erro} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-produmar-600" />
            <CardTitle>Empresa</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Razão social" value="PRODUMAR" />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-produmar-50 dark:border-slate-800 last:border-0">
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-sm font-medium text-produmar-800 dark:text-slate-200">{value}</span>
    </div>
  );
}
