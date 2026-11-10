import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { TecnicoDiaristasClient } from "@/components/tecnico/tecnico-diaristas-client";
import { localDateISO } from "@/lib/utils";
import type { Diarista, DiaristaDia, SupplyObraSector } from "@/lib/types";
import type {
  DiaristaMaquina,
  DiaristaObra,
} from "@/components/diaristas/lancar-dia-dialog";
import { juntarServicosDeMaquina, lerServicosDeMaquina } from "@/lib/maquina-na-diaria-db";

export const dynamic = "force-dynamic";

export default async function TecnicoDiaristasPage() {
  const supabase = createClient();

  // Perfil já carregado pelo layout nesta mesma requisição — vem do cache, sem
  // nova consulta e sem segurar as buscas da tela.
  const profile = await getProfile();
  if (!profile) redirect("/login");

  // Mesma porta da tela de material: só o encarregado de obra (papel
  // 'tecnico') e o admin, para conferir.
  if (profile?.role !== "tecnico" && profile?.role !== "admin") redirect("/inicio");
  const encarregado = profile.role === "tecnico";

  // O calendário só volta alguns meses: ninguém marca hoje um dia do ano
  // passado, e carregar a vida inteira no celular dele é peso à toa.
  const desde = localDateISO(
    new Date(new Date().getFullYear(), new Date().getMonth() - 6, 1)
  );

  const [diaristasRes, diasRes, obrasRes, sectorsRes, vinculosRes, maquinasRes, servicosDeMaquina] =
    await Promise.all([
    // só quem está ativo: o técnico escolhe da lista, nunca cadastra
    // (migration 059 — sem ela a tela avisa que não há ninguém cadastrado)
    supabase
      .from("diaristas")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true }),
    supabase
      .from("diarista_dias")
      .select("*")
      .gte("work_date", desde)
      .order("work_date", { ascending: false }),
    supabase.from("supply_obras").select("id, name, client").order("name", { ascending: true }),
    supabase
      .from("supply_obra_sectors")
      .select("*")
      .eq("active", true)
      .order("name", { ascending: true }),
    // a turma dele: os colaboradores que o chefe liberou (migration 099)
    encarregado
      ? supabase.from("diarista_tecnicos").select("diarista_id").eq("tecnico_id", profile.id)
      : null,
    // a máquina pesada que trabalhou junto na diária (migration 132)
    supabase.from("machines").select("*").order("name", { ascending: true }),
    lerServicosDeMaquina(supabase),
  ]);

  // SÓ A TURMA DELE. O admin vê todo mundo. Enquanto a 099 não roda a tabela
  // não existe e ninguém tem como ser liberado: a tela segue mostrando todos,
  // como antes, em vez de ficar vazia sem explicação.
  const semTabela =
    vinculosRes?.error?.code === "42P01" || vinculosRes?.error?.code === "PGRST205";
  const filtrar = encarregado && !semTabela;
  const daTurma = new Set(
    ((vinculosRes?.data as { diarista_id: string }[] | null) ?? []).map((v) => v.diarista_id)
  );

  const todos = (diaristasRes.data as Diarista[]) ?? [];
  const diaristas = filtrar ? todos.filter((d) => daTurma.has(d.id)) : todos;
  const todosOsDias = (diasRes.data as DiaristaDia[]) ?? [];
  const dias = filtrar ? todosOsDias.filter((d) => daTurma.has(d.diarista_id)) : todosOsDias;

  return (
    <TecnicoDiaristasClient
      diaristas={diaristas}
      dias={juntarServicosDeMaquina(dias, servicosDeMaquina.servicos)}
      obras={(obrasRes.data as DiaristaObra[]) ?? []}
      sectors={(sectorsRes.data as SupplyObraSector[]) ?? []}
      maquinas={(maquinasRes.data as DiaristaMaquina[]) ?? []}
      maquinaPronta={servicosDeMaquina.pronta}
      meId={profile.id}
      soDaTurma={filtrar}
    />
  );
}
