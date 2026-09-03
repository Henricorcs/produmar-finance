import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { TecnicoClient } from "@/components/tecnico/tecnico-client";
import { PreviewBanner } from "@/components/layout/preview-banner";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupplyLocal, SupplyObraSector, SupplyRequestRow } from "@/lib/types";
import type {
  TecnicoItem,
  TecnicoMachine,
  TecnicoObra,
} from "@/components/tecnico/tecnico-client";

export const dynamic = "force-dynamic";

export default async function TecnicoPage({
  searchParams,
}: {
  searchParams: { ver?: string };
}) {
  const supabase = createClient();

  // Perfil já carregado pelo layout nesta mesma requisição — vem do cache, sem
  // nova consulta e sem segurar as buscas da tela.
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Tela fechada: só o técnico (e o admin, para conferir/testar).
  if (profile?.role !== "tecnico" && profile?.role !== "admin") redirect("/inicio");

  // VER COMO O TÉCNICO: o admin abre a tela de um técnico para conferir. Só
  // leitura — a faixa do topo desliga o toque no que vem abaixo.
  const vendoOutro =
    profile.role === "admin" && !!searchParams.ver && searchParams.ver !== profile.id;
  const alvoId = vendoOutro ? (searchParams.ver as string) : profile.id;

  // o nome de quem está sendo olhado (a RLS de profiles só deixa o admin ver os
  // outros pelo service-role; sem a chave, mostra "técnico" e segue)
  let nomeDoAlvo = "técnico";
  if (vendoOutro) {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from("profiles")
        .select("full_name, email")
        .eq("id", alvoId)
        .maybeSingle<{ full_name: string | null; email: string }>();
      nomeDoAlvo = data?.full_name || data?.email || "técnico";
    } catch {
      nomeDoAlvo = "técnico";
    }
  }

  const [itemsRes, obrasRes, locaisRes, sectorsRes, machinesRes, mineRes] = await Promise.all([
    // só o catálogo: nome e unidade. O técnico não precisa (nem deve) ver saldo.
    supabase.from("supply_items").select("id, name, unit").order("name", { ascending: true }),
    // a obra já diz em que SETOR ela fica (o local, migration 066)
    supabase
      .from("supply_obras")
      .select("id, name, client, local_id")
      .order("name", { ascending: true }),
    // OS SETORES: Fazenda 01, Fazenda 02, Sítio — é assim que o pessoal fala
    supabase
      .from("supply_locais")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true }),
    // setores de cada obra, cadastrados pelo chefe (migration 057 — sem ela a
    // lista volta vazia e o técnico continua escrevendo o lugar na mão)
    supabase
      .from("supply_obra_sectors")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true }),
    // a frota, para o técnico dizer qual máquina usou
    supabase
      .from("machines")
      .select("id, name, plate, tracking_type")
      .eq("active", true)
      .order("name", { ascending: true }),
    // os recados dele que o chefe ainda não resolveu (sem a 052 volta vazio)
    supabase
      .from("supply_requests")
      .select("*, supply_items(name, unit), supply_obras(name)")
      .eq("created_by", alvoId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const tela = (
    <TecnicoClient
      items={(itemsRes.data as TecnicoItem[]) ?? []}
      obras={(obrasRes.data as TecnicoObra[]) ?? []}
      locais={(locaisRes.data as SupplyLocal[]) ?? []}
      sectors={(sectorsRes.data as SupplyObraSector[]) ?? []}
      machines={(machinesRes.data as TecnicoMachine[]) ?? []}
      pending={(mineRes.data as SupplyRequestRow[]) ?? []}
    />
  );

  if (!vendoOutro) return tela;

  return (
    <>
      <PreviewBanner nome={nomeDoAlvo} tela="a tela" />
      {/* só leitura: nada aqui aceita toque */}
      <div className="pointer-events-none select-none">{tela}</div>
    </>
  );
}
