import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiaristaDia, DiaristaDiaMaquina } from "@/lib/types";

/**
 * Os serviços de máquina lançados e se o banco já tem a tabela (migration 133).
 *
 * Sem a 133 o PostgREST recusa o `select` e a tela mostra o aviso em vez de
 * deixar o encarregado preencher o horímetro todo para levar um erro no fim.
 */
export async function lerServicosDeMaquina(
  supabase: SupabaseClient
): Promise<{ servicos: DiaristaDiaMaquina[]; pronta: boolean }> {
  const { data, error } = await supabase
    .from("diarista_dia_maquinas")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(2000);
  return { servicos: (data as DiaristaDiaMaquina[]) ?? [], pronta: !error };
}

/** Pendura em cada diária os serviços dela, na ordem em que foram lançados. */
export function juntarServicosDeMaquina(
  dias: DiaristaDia[],
  servicos: DiaristaDiaMaquina[]
): DiaristaDia[] {
  const porDia = new Map<string, DiaristaDiaMaquina[]>();
  for (const s of servicos) {
    const lista = porDia.get(s.dia_id);
    if (lista) lista.push(s);
    else porDia.set(s.dia_id, [s]);
  }
  return dias.map((d) => ({ ...d, servicos_maquina: porDia.get(d.id) ?? [] }));
}
