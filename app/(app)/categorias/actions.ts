"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Category } from "@/lib/types";

function revalidate() {
  revalidatePath("/categorias");
  revalidatePath("/configuracoes");
  revalidatePath("/contas");
  revalidatePath("/para-onde-foi");
}

export async function createCategory(data: {
  name: string;
  type: "entrada" | "saida";
  color: string;
}): Promise<{ ok: true; category: Category } | { error: string }> {
  const supabase = createClient();
  const { data: created, error } = await supabase
    .from("categories")
    .insert({
      name: data.name.trim(),
      type: data.type,
      color: data.color,
    })
    .select()
    .single();
  if (error) return { error: error.message };
  revalidate();
  return { ok: true, category: created as Category };
}

export async function updateCategory(
  id: string,
  data: { name: string; type: "entrada" | "saida"; color: string }
) {
  const supabase = createClient();
  const { error } = await supabase
    .from("categories")
    .update({ name: data.name.trim(), type: data.type, color: data.color })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function deleteCategory(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}
