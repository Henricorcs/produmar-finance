import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EditorDeMedicao } from "@/components/medicoes/editor-de-medicao";
import type { Medicao } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Abrir uma medição salva: rever o mapa, mexer nos pontos, corrigir o nome. */
export default async function MedicaoPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase.from("medicoes").select("*").eq("id", params.id).maybeSingle<Medicao>();

  if (!data) {
    return (
      <div className="space-y-3 py-10 text-center">
        <p className="text-slate-600 dark:text-slate-300">Medição não encontrada.</p>
        <Link href="/medicoes" className="text-sm font-medium text-produmar-600 underline">
          Voltar para Medições
        </Link>
      </div>
    );
  }

  // medida de cerca abre na aba dela (lá ela é reaberta pela lista de cercas salvas)
  if (data.tipo === "cerca") redirect("/medir-cerca");

  return <EditorDeMedicao medicao={data} />;
}
