"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CostCenter } from "@/lib/types";

function revalidate() {
  revalidatePath("/contas");
  revalidatePath("/configuracoes");
  revalidatePath("/para-onde-foi");
}

export async function createCostCenter(data: {
  name: string;
  description?: string | null;
}): Promise<{ ok: true; costCenter: CostCenter } | { error: string }> {
  const supabase = createClient();
  const { data: created, error } = await supabase
    .from("cost_centers")
    .insert({
      name: data.name.trim(),
      description: data.description?.trim() || null,
      active: true,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  revalidate();
  return { ok: true, costCenter: created as CostCenter };
}

export async function updateCostCenter(
  id: string,
  data: { name: string; description?: string | null; active?: boolean }
) {
  const supabase = createClient();
  const update: Record<string, unknown> = {
    name: data.name.trim(),
    description: data.description?.trim() || null,
  };
  if (typeof data.active === "boolean") update.active = data.active;

  const { error } = await supabase.from("cost_centers").update(update).eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function deleteCostCenter(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("cost_centers").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}
