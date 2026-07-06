import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CadastrosOperacionaisConfig } from "@/components/configuracoes/cadastros-operacionais-config";
import { Truck } from "lucide-react";
import type { Contact, Machine, Product, PickupLocation } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CadastrosOperacionaisPage() {
  const supabase = createClient();

  const [machinesRes, productsRes, locationsRes, contactsRes] = await Promise.all([
    supabase.from("machines").select("*").order("name"),
    supabase.from("products").select("*").order("name"),
    supabase.from("pickup_locations").select("*").order("name"),
    supabase.from("contacts").select("*").order("name"),
  ]);

  const machines = (machinesRes.data as Machine[]) ?? [];
  const products = (productsRes.data as Product[]) ?? [];
  const pickupLocations = (locationsRes.data as PickupLocation[]) ?? [];
  const contacts = (contactsRes.data as Contact[]) ?? [];

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">
          Cadastros
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Máquinas, produtos e locais de retirada para as ordens de serviço
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-produmar-600" />
            <CardTitle>Cadastros operacionais</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <CadastrosOperacionaisConfig
            machines={machines}
            products={products}
            pickupLocations={pickupLocations}
            contacts={contacts}
          />
        </CardContent>
      </Card>
    </div>
  );
}
