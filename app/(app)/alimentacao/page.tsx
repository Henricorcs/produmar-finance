import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { AlimentacaoClient } from "@/components/alimentacao/alimentacao-client";
import type { AlimentacaoPessoa, AlimentacaoRefeicao } from "@/lib/types";

export const dynamic = "force-dynamic";

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * ALIMENTAÇÃO — a lista de quem come o bandeco e, para cada dia, quem comeu.
 * A conta do mês (quantas refeições saíram) é o que mede o custo da comida.
 *
 * O dia da tela vem em ?d=AAAA-MM-DD; sem ele, é hoje no horário daqui (o
 * servidor roda em UTC, e depois das 21h o UTC já está no dia seguinte).
 * Carrega as refeições do MÊS desse dia: andar de um dia para o outro dentro
 * do mês é só na tela, sem ir ao servidor.
 */
export default async function AlimentacaoPage({
  searchParams,
}: {
  searchParams: { d?: string; v?: string };
}) {
  const supabase = createClient();

  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(
    new Date()
  );
  const dia = searchParams.d && DATA.test(searchParams.d) ? searchParams.d : hoje;
  const [ano, mes] = dia.split("-").map(Number);
  const de = `${dia.slice(0, 7)}-01`;
  const ate = `${dia.slice(0, 7)}-${String(new Date(ano, mes, 0).getDate()).padStart(2, "0")}`;

  const [pessoasRes, refeicoes, profile] = await Promise.all([
    supabase.from("alimentacao_pessoas").select("*").order("nome", { ascending: true }),
    refeicoesDoMes(supabase, de, ate),
    getProfile(),
  ]);

  const role = profile?.role as string | undefined;
  const podeMarcar =
    role === "admin" ||
    role === "financeiro" ||
    ((role === "operador" || role === "encarregado") &&
      (profile?.allowed_modules ?? []).includes("diaristas"));

  return (
    <AlimentacaoClient
      // trocar de mês monta a tela de novo, com as marcações daquele mês
      key={dia.slice(0, 7)}
      pessoas={(pessoasRes.data as AlimentacaoPessoa[]) ?? []}
      refeicoes={refeicoes}
      diaInicial={dia}
      hoje={hoje}
      abaInicial={searchParams.v === "mes" ? "mes" : "dia"}
      podeMarcar={podeMarcar}
      migrationPendente={!!pessoasRes.error}
    />
  );
}

/**
 * Todas as refeições do mês. O Supabase devolve no máximo 1000 linhas por
 * pedido — 40 pessoas × 26 dias já passa disso —, então vem em lotes.
 */
async function refeicoesDoMes(
  supabase: ReturnType<typeof createClient>,
  de: string,
  ate: string
): Promise<AlimentacaoRefeicao[]> {
  const todas: AlimentacaoRefeicao[] = [];
  const LOTE = 1000;
  for (let i = 0; i < 50_000; i += LOTE) {
    const { data, error } = await supabase
      .from("alimentacao_refeicoes")
      .select("pessoa_id, data")
      .gte("data", de)
      .lte("data", ate)
      .order("data", { ascending: true })
      .order("pessoa_id", { ascending: true })
      .range(i, i + LOTE - 1);
    if (error || !data) break;
    todas.push(...(data as AlimentacaoRefeicao[]));
    if (data.length < LOTE) break;
  }
  return todas;
}
