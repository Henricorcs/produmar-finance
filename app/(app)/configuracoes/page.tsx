import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertConfigClient } from "@/components/configuracoes/alert-config-client";
import { ProfileFormClient } from "@/components/configuracoes/profile-form-client";
import { CategoriasConfig } from "@/components/configuracoes/categorias-config";
import { UserManagementClient } from "@/components/configuracoes/user-management-client";
import { CadastrosOperacionaisConfig } from "@/components/configuracoes/cadastros-operacionais-config";
import { User, Bell, Building2, Tag, Users, Truck } from "lucide-react";
import type { Profile, Category, Machine, Product, PickupLocation } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    profileRes,
    alertConfigsRes,
    categoriesRes,
    machinesRes,
    productsRes,
    locationsRes,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user!.id).single<Profile>(),
    supabase
      .from("alert_configs")
      .select("alert_type, enabled, days_before")
      .eq("user_id", user!.id),
    supabase
      .from("categories")
      .select("*")
      .order("type", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("machines").select("*").order("name"),
    supabase.from("products").select("*").order("name"),
    supabase.from("pickup_locations").select("*").order("name"),
  ]);

  const profile = profileRes.data;
  const alertConfigs = alertConfigsRes.data ?? [];
  const categories = (categoriesRes.data as Category[]) ?? [];
  const machines = (machinesRes.data as Machine[]) ?? [];
  const products = (productsRes.data as Product[]) ?? [];
  const pickupLocations = (locationsRes.data as PickupLocation[]) ?? [];
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
            email={profile?.email ?? user!.email!}
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

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-produmar-600" />
            <CardTitle>Cadastros operacionais</CardTitle>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Máquinas, produtos e locais de retirada para as ordens de serviço
          </p>
        </CardHeader>
        <CardContent>
          <CadastrosOperacionaisConfig
            machines={machines}
            products={products}
            pickupLocations={pickupLocations}
          />
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
            <UserManagementClient users={allUsers} currentUserId={user!.id} />
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
