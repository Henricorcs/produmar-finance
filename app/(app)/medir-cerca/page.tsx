import { createClient } from "@/lib/supabase/server";
import { MedidorDeCerca } from "@/components/obras/medidor-de-cerca";
import type { Medicao } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * MEDIR CERCA — aba do módulo Medições (e aberta a quem tem Obras): marca o 1º ponto pelo GPS, anda até o 2º e
 * marca de novo; a tela dá a metragem. Enquanto mede, os pontos ficam no aparelho; no fim, "Finalizar e salvar"
 * grava a medida com nome na tabela medicoes (tipo 'cerca', migration 148).
 */
export default async function MedirCercaPage() {
  const supabase = createClient();
  // select("*") e filtro aqui: antes da 148 não há coluna tipo, e a tela segue funcionando
  const { data } = await supabase.from("medicoes").select("*").order("created_at", { ascending: false });
  const salvas = ((data as Medicao[]) ?? []).filter((m) => m.tipo === "cerca");

  return (
    <div className="space-y-5 animate-fade-in max-w-md">
      <div>
        <h1 className="text-xl font-medium text-produmar-800 dark:text-slate-100">Medir cerca</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Marque o começo e o fim da cerca pelo GPS — o sistema dá a metragem
        </p>
      </div>
      <MedidorDeCerca salvas={salvas} />
    </div>
  );
}
