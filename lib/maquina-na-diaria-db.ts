import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * O banco já tem a máquina pesada na diária (migration 132)?
 *
 * Pergunta pela coluna, não pelos dados: sem a 132 o PostgREST recusa o
 * `select` e a tela mostra o aviso em vez de deixar o encarregado preencher o
 * horímetro todo para levar um erro no fim.
 */
export async function supabaseTemMaquinaNaDiaria(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.from("diarista_dias").select("machine_id").limit(1);
  return !error;
}
