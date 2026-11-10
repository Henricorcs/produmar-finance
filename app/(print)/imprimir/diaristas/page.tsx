import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserId } from "@/lib/auth";
import { DiaristasPrint } from "@/components/diaristas/diaristas-print";
import { localDateISO } from "@/lib/utils";
import type { DiaristaDiaRow } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: { de?: string; ate?: string; diarista?: string; obra?: string };
}

/** YYYY-MM-DD ou nada — searchParams é o que o usuário digitou na URL. */
function cleanDate(v?: string): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/**
 * Relatório de diaristas: ?de=YYYY-MM-DD&ate=YYYY-MM-DD, com os filtros
 * opcionais &diarista=<id> e &obra=<id>. Sem período, sai o mês corrente.
 */
export default async function ImprimirDiaristasPage({ searchParams }: Props) {
  const supabase = createClient();

  // Id vem do header que o middleware preencheu — sem ida e volta ao Supabase.
  const userId = await getCurrentUserId();
  if (!userId) redirect("/login");

  const hoje = new Date();
  const from =
    cleanDate(searchParams.de) ??
    localDateISO(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const to =
    cleanDate(searchParams.ate) ??
    localDateISO(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0));

  let query = supabase
    .from("diarista_dias")
    .select("*, diaristas(name, pix_key), supply_obras(name)")
    .gte("work_date", from)
    .lte("work_date", to)
    .order("work_date", { ascending: true });

  if (searchParams.diarista) query = query.eq("diarista_id", searchParams.diarista);
  if (searchParams.obra) query = query.eq("obra_id", searchParams.obra);

  // os outros serviços de máquina do dia entram no texto: o relatório é onde o
  // chefe lê o que foi feito (sem a 133 volta erro e o texto fica como estava)
  const [{ data }, { data: servicos }] = await Promise.all([
    query,
    supabase
      .from("diarista_dia_maquinas")
      .select("dia_id, description, diarista_dias!inner(work_date)")
      .gte("diarista_dias.work_date", from)
      .lte("diarista_dias.work_date", to)
      .order("created_at", { ascending: true }),
  ]);
  const dias = ((data as DiaristaDiaRow[]) ?? []).map((d) => {
    const textos = (servicos ?? [])
      .filter((s) => s.dia_id === d.id && s.description && s.description !== d.description)
      .map((s) => s.description as string);
    return { ...d, description: [d.description, ...textos].filter(Boolean).join(" · ") || null };
  });

  // o rótulo do filtro sai do próprio resultado: sem consulta extra e sem
  // mentir (se o filtro não achou nada, não há nome para mostrar)
  const nomeDiarista = searchParams.diarista ? dias[0]?.diaristas?.name ?? null : null;
  const nomeObra = searchParams.obra ? dias[0]?.supply_obras?.name ?? null : null;
  const filterLabel = [nomeDiarista, nomeObra].filter(Boolean).join(" · ");

  return (
    <DiaristasPrint dias={dias} from={from} to={to} filterLabel={filterLabel || null} />
  );
}
