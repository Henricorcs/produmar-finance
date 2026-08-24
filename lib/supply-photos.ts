import type { SupabaseClient } from "@supabase/supabase-js";
import { removerArquivos } from "@/lib/storage";

/**
 * Apaga a foto do storage só quando ninguém mais aponta para ela.
 *
 * A foto é do envio inteiro, não de um material: quando o técnico manda vários
 * materiais de uma vez, todas as linhas de supply_requests gravam o mesmo
 * caminho. E quando o chefe dá baixa, a foto passa a ser o comprovante do
 * movimento. Apagar direto no primeiro cancelamento deixaria os outros recados
 * — e o lançamento já feito — sem imagem nenhuma.
 */
export async function removeSupplyPhotoIfUnused(
  supabase: SupabaseClient,
  photoPath: string | null | undefined
): Promise<void> {
  if (!photoPath) return;

  const [requests, movements] = await Promise.all([
    supabase
      .from("supply_requests")
      .select("id", { count: "exact", head: true })
      .eq("photo_path", photoPath),
    supabase
      .from("supply_movements")
      .select("id", { count: "exact", head: true })
      .eq("photo_path", photoPath),
  ]);

  if ((requests.count ?? 0) > 0 || (movements.count ?? 0) > 0) return;

  await removerArquivos([photoPath]);
}
