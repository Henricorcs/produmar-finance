"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { contaDoLote } from "@/lib/medicao-lote";
import { trechos, type PontoGps } from "@/lib/medir-cerca";

/**
 * MEDIÇÕES — o lote marcado pelo GPS. Quem manda são os pontos: a área e o
 * perímetro gravados são refeitos aqui, a cada salvar, a partir deles.
 */

type Resultado = { ok: true; id: string } | { error: string };

export type MedicaoInput = {
  nome: string;
  local: string | null;
  observacao: string | null;
  pontos: PontoGps[];
};

/** Erro de tabela que ainda não existe → recado que diz o que fazer. */
function erroDaMedicao(error: { code?: string; message: string }): string {
  // a política de escrita barrou (insert) ou o update não achou linha que pudesse mudar
  if (error.code === "42501" || error.code === "PGRST116")
    return "Seu usuário não tem permissão para gravar no módulo Medições";
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /medicoes.*(does not exist|not find)|(does not exist|not find).*medicoes/i.test(error.message)
  )
    return "Rode a migration 131 no Supabase para guardar as medições";
  // coluna tipo/fechado ainda não existe
  if (error.code === "42703" || error.code === "PGRST204" || /(tipo|fechado).*column|column.*(tipo|fechado)/i.test(error.message))
    return "Rode a migration 148 no Supabase para salvar a medida da cerca";
  return error.message;
}

/** Só o que interessa de cada ponto — e só pontos com número de verdade. */
function pontosLimpos(pontos: PontoGps[]): PontoGps[] | null {
  const limpos: PontoGps[] = [];
  for (const p of pontos) {
    const lat = Number(p.lat);
    const lng = Number(p.lng);
    const precisao = Number(p.precisao);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    limpos.push({
      lat,
      lng,
      precisao: Number.isFinite(precisao) ? precisao : 0,
      em: String(p.em ?? ""),
      ...(p.leituras ? { leituras: Number(p.leituras) } : {}),
    });
  }
  return limpos;
}

export async function salvarMedicao(id: string | null, m: MedicaoInput): Promise<Resultado> {
  const nome = m.nome.trim();
  if (!nome) return { error: "Dê um nome ao lote ou terreno." };
  const pontos = pontosLimpos(m.pontos ?? []);
  if (!pontos) return { error: "Algum ponto veio sem coordenada. Desfaça e marque de novo." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const conta = contaDoLote(pontos);
  const linha = {
    nome,
    local: m.local?.trim() || null,
    observacao: m.observacao?.trim() || null,
    pontos,
    area_m2: conta.fechado ? Math.round(conta.areaM2 * 100) / 100 : null,
    perimetro_m: conta.fechado ? Math.round(conta.perimetro * 100) / 100 : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = id
    ? await supabase.from("medicoes").update(linha).eq("id", id).select("id").single()
    : await supabase
        .from("medicoes")
        .insert({ ...linha, created_by: user.id })
        .select("id")
        .single();

  if (error) return { error: erroDaMedicao(error) };
  revalidatePath("/medicoes");
  return { ok: true, id: (data as { id: string }).id };
}

export type CercaInput = MedicaoInput & {
  /** Cercado fechado: soma a volta do último ponto até o 1º. */
  fechado: boolean;
};

/**
 * MEDIR CERCA — finaliza e grava a medida. Fica na mesma tabela dos lotes,
 * com tipo 'cerca': perimetro_m é a metragem total e area_m2 fica vazio.
 */
export async function salvarCerca(id: string | null, c: CercaInput): Promise<Resultado> {
  const nome = c.nome.trim();
  if (!nome) return { error: "Dê um nome à cerca (ex.: Cerca do pasto grande)." };
  const pontos = pontosLimpos(c.pontos ?? []);
  if (!pontos) return { error: "Algum ponto veio sem coordenada. Desfaça e marque de novo." };
  if (pontos.length < 2) return { error: "Marque pelo menos 2 pontos antes de salvar." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const fechado = !!c.fechado && pontos.length >= 3;
  const total = trechos(pontos, fechado).reduce((s, t) => s + t, 0);
  const linha = {
    tipo: "cerca" as const,
    fechado,
    nome,
    local: c.local?.trim() || null,
    observacao: c.observacao?.trim() || null,
    pontos,
    area_m2: null,
    perimetro_m: Math.round(total * 100) / 100,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = id
    ? await supabase.from("medicoes").update(linha).eq("id", id).select("id").single()
    : await supabase
        .from("medicoes")
        .insert({ ...linha, created_by: user.id })
        .select("id")
        .single();

  if (error) return { error: erroDaMedicao(error) };
  revalidatePath("/medir-cerca");
  return { ok: true, id: (data as { id: string }).id };
}

export async function excluirMedicao(id: string): Promise<{ ok: true } | { error: string }> {
  const supabase = createClient();
  const { error, count } = await supabase.from("medicoes").delete({ count: "exact" }).eq("id", id);
  if (error) return { error: erroDaMedicao(error) };
  if (count === 0) return { error: "Não foi possível apagar — confira se você tem o módulo Medições." };
  revalidatePath("/medicoes");
  revalidatePath("/medir-cerca");
  return { ok: true };
}
