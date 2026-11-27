"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * ALIMENTAÇÃO — a lista de quem come o bandeco e a marcação de cada dia
 * (migration 154). A lista é à parte do cadastro de Colaboradores: quem veio
 * fazer só uma diária ou outro serviço também come, sem virar colaborador.
 */

type Resultado = { ok: true; id: string } | { error: string };
type Simples = { ok: true } | { error: string };

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function erroDaAlimentacao(error: { code?: string; message: string }): string {
  if (error.code === "42501" || error.code === "PGRST116")
    return "Seu usuário não tem permissão para marcar a alimentação";
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /alimentacao.*(does not exist|not find)|(does not exist|not find).*alimentacao/i.test(
      error.message
    )
  )
    return "Rode a migration 154 no Supabase para guardar a alimentação";
  return error.message;
}

async function usuario(supabase: ReturnType<typeof createClient>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Põe alguém na lista de quem come, ou corrige o nome e o recado. */
export async function salvarPessoa(
  id: string | null,
  p: { nome: string; observacao: string | null }
): Promise<Resultado> {
  const nome = p.nome.trim().replace(/\s+/g, " ").toUpperCase();
  if (!nome) return { error: "Escreva o nome." };

  const supabase = createClient();
  const user = await usuario(supabase);
  if (!user) return { error: "Não autenticado" };

  const linha = { nome, observacao: p.observacao?.trim() || null };
  const { data, error } = id
    ? await supabase.from("alimentacao_pessoas").update(linha).eq("id", id).select("id").single()
    : await supabase
        .from("alimentacao_pessoas")
        .insert({ ...linha, created_by: user.id })
        .select("id")
        .single();
  if (error) return { error: erroDaAlimentacao(error) };

  revalidatePath("/alimentacao");
  return { ok: true, id: (data as { id: string }).id };
}

/** Arquiva (sai da lista do dia) ou traz de volta. O que comeu continua contando. */
export async function arquivarPessoa(id: string, ativo: boolean): Promise<Simples> {
  const supabase = createClient();
  const { error } = await supabase
    .from("alimentacao_pessoas")
    .update({ ativo })
    .eq("id", id)
    .select("id")
    .single();
  if (error) return { error: erroDaAlimentacao(error) };
  revalidatePath("/alimentacao");
  return { ok: true };
}

/**
 * Apaga quem foi cadastrado por engano. Quem já comeu algum dia não apaga —
 * sumiria da conta dos meses passados; esse se arquiva.
 */
export async function apagarPessoa(id: string): Promise<Simples> {
  const supabase = createClient();
  const { count, error: e1 } = await supabase
    .from("alimentacao_refeicoes")
    .select("id", { count: "exact", head: true })
    .eq("pessoa_id", id);
  if (e1) return { error: erroDaAlimentacao(e1) };
  if ((count ?? 0) > 0)
    return {
      error: `Já tem ${count} ${count === 1 ? "refeição marcada" : "refeições marcadas"} — apagar tiraria da conta dos meses. Use "Arquivar".`,
    };

  const { error } = await supabase.from("alimentacao_pessoas").delete().eq("id", id);
  if (error) return { error: erroDaAlimentacao(error) };
  revalidatePath("/alimentacao");
  return { ok: true };
}

/** Marca (comeu) ou desmarca uma pessoa num dia. */
export async function marcarRefeicao(
  pessoaId: string,
  data: string,
  comeu: boolean
): Promise<Simples> {
  if (!pessoaId || !DATA.test(data)) return { error: "Dia inválido." };
  const supabase = createClient();
  const user = await usuario(supabase);
  if (!user) return { error: "Não autenticado" };

  const { error } = comeu
    ? // o mesmo dia não conta duas vezes: a unique do banco segura, e o
      // ignoreDuplicates faz a segunda marcação passar sem erro
      await supabase
        .from("alimentacao_refeicoes")
        .upsert(
          { pessoa_id: pessoaId, data, created_by: user.id },
          { onConflict: "pessoa_id,data", ignoreDuplicates: true }
        )
    : await supabase
        .from("alimentacao_refeicoes")
        .delete()
        .eq("pessoa_id", pessoaId)
        .eq("data", data);
  if (error) return { error: erroDaAlimentacao(error) };

  revalidatePath("/alimentacao");
  return { ok: true };
}

/** "Todos comeram": marca de uma vez quem ainda não estava marcado no dia. */
export async function marcarVarios(pessoaIds: string[], data: string): Promise<Simples> {
  if (!DATA.test(data)) return { error: "Dia inválido." };
  const ids = [...new Set(pessoaIds.filter(Boolean))];
  if (ids.length === 0) return { ok: true };
  const supabase = createClient();
  const user = await usuario(supabase);
  if (!user) return { error: "Não autenticado" };

  const { error } = await supabase.from("alimentacao_refeicoes").upsert(
    ids.map((pessoa_id) => ({ pessoa_id, data, created_by: user.id })),
    { onConflict: "pessoa_id,data", ignoreDuplicates: true }
  );
  if (error) return { error: erroDaAlimentacao(error) };

  revalidatePath("/alimentacao");
  return { ok: true };
}
