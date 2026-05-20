"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createCategory(data: {
  name: string;
  type: "entrada" | "saida";
  color: string;
}) {
  const supabase = createClient();
  const { error } = await supabase.from("categories").insert({
    name: data.name.trim(),
    type: data.type,
    color: data.color,
  });
  if (error) return { error: error.message };
  revalidatePath("/categorias");
  return { ok: true };
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
  revalidatePath("/categorias");
  return { ok: true };
}

export async function deleteCategory(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/categorias");
  return { ok: true };
}
