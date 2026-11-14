"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { FORMAS_PAGAMENTO, periodoLabel } from "@/lib/chacaras";
import type { ChacaraFormaPagamento } from "@/lib/types";

/**
 * AGENDA DAS CHÁCARAS — gravar, apagar e dar baixa nas reservas.
 *
 * Antes de gravar, o servidor procura reserva da mesma chácara com dia em
 * comum e devolve o aviso com o nome de quem já reservou. A garantia de
 * verdade é a constraint do banco (migration 142): se duas pessoas salvarem
 * ao mesmo tempo, a segunda é recusada lá e cai no mesmo aviso.
 */

type Resultado = { ok: true; id: string } | { error: string };
type Simples = { ok: true } | { error: string };

export type ReservaInput = {
  chacara_id: string;
  data_inicio: string;
  data_fim: string;
  cliente_nome: string;
  cliente_telefone: string | null;
  valor: number;
  valor_pago: number;
  forma_pagamento: ChacaraFormaPagamento;
  observacao: string | null;
};

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function erroDaAgenda(error: { code?: string; message: string }): string {
  if (error.code === "42501" || error.code === "PGRST116")
    return "Seu usuário não tem permissão para gravar na agenda das chácaras";
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /chacara.*(does not exist|not find)|(does not exist|not find).*chacara/i.test(error.message)
  )
    return "Rode a migration 142 no Supabase para guardar as reservas das chácaras";
  return error.message;
}

/** Quem já ocupa algum desses dias na mesma chácara — o recado da recusa. */
async function avisoDeConflito(
  supabase: ReturnType<typeof createClient>,
  r: Pick<ReservaInput, "chacara_id" | "data_inicio" | "data_fim">,
  ignorarId: string | null
): Promise<string | null> {
  let q = supabase
    .from("chacara_reservas")
    .select("id, data_inicio, data_fim, cliente_nome, situacao, chacaras(nome)")
    .eq("chacara_id", r.chacara_id)
    .lte("data_inicio", r.data_fim)
    .gte("data_fim", r.data_inicio)
    .order("data_inicio")
    .limit(5);
  if (ignorarId) q = q.neq("id", ignorarId);
  const { data } = await q;
  const conflitos = (data ?? []) as unknown as {
    data_inicio: string;
    data_fim: string;
    cliente_nome: string;
    situacao: string;
    chacaras: { nome: string } | null;
  }[];
  if (conflitos.length === 0) return null;
  const chacara = conflitos[0].chacaras?.nome ?? "esta chácara";
  const quem = conflitos
    .map(
      (c) =>
        `${periodoLabel(c.data_inicio, c.data_fim)} já está ${c.situacao === "pago" ? "alugado e pago" : "reservado"} para ${c.cliente_nome}`
    )
    .join("; ");
  return `${chacara}: ${quem}. Escolha outros dias — não dá para alugar o mesmo dia duas vezes.`;
}

export async function salvarReserva(id: string | null, r: ReservaInput): Promise<Resultado> {
  const nome = r.cliente_nome.trim();
  if (!r.chacara_id) return { error: "Escolha a chácara." };
  if (!DATA.test(r.data_inicio) || !DATA.test(r.data_fim)) return { error: "Escolha os dias da reserva." };
  if (r.data_fim < r.data_inicio) return { error: "O último dia não pode ser antes do primeiro." };
  if (!nome) return { error: "Escreva o nome do cliente." };
  const valor = Math.round(Number(r.valor) * 100) / 100;
  if (!Number.isFinite(valor) || valor <= 0) return { error: "Informe o valor do aluguel." };
  let pago = Math.round(Number(r.valor_pago) * 100) / 100;
  if (!Number.isFinite(pago) || pago < 0) pago = 0;
  if (pago > valor) return { error: "O valor pago não pode passar do valor do aluguel." };
  if (!FORMAS_PAGAMENTO.some((f) => f.valor === r.forma_pagamento))
    return { error: "Escolha a forma de pagamento." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const aviso = await avisoDeConflito(supabase, r, id);
  if (aviso) return { error: aviso };

  const linha = {
    chacara_id: r.chacara_id,
    data_inicio: r.data_inicio,
    data_fim: r.data_fim,
    cliente_nome: nome,
    cliente_telefone: r.cliente_telefone?.trim() || null,
    valor,
    valor_pago: pago,
    forma_pagamento: r.forma_pagamento,
    observacao: r.observacao?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = id
    ? await supabase.from("chacara_reservas").update(linha).eq("id", id).select("id").single()
    : await supabase
        .from("chacara_reservas")
        .insert({ ...linha, created_by: user.id })
        .select("id")
        .single();

  if (error) {
    // a trava do banco: alguém salvou o mesmo dia um instante antes
    if (error.code === "23P01") {
      const outra = await avisoDeConflito(supabase, r, id);
      return { error: outra ?? "Esse dia acabou de ser reservado por outra pessoa. Atualize a agenda." };
    }
    return { error: erroDaAgenda(error) };
  }

  revalidatePath("/chacaras");
  return { ok: true, id: (data as { id: string }).id };
}

/** O cliente pagou o que faltava: a reserva fica paga. */
export async function receberRestante(id: string): Promise<Simples> {
  const supabase = createClient();
  const { data: atual, error: e1 } = await supabase
    .from("chacara_reservas")
    .select("valor")
    .eq("id", id)
    .single();
  if (e1) return { error: erroDaAgenda(e1) };
  const { error } = await supabase
    .from("chacara_reservas")
    .update({ valor_pago: (atual as { valor: number }).valor, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .single();
  if (error) return { error: erroDaAgenda(error) };
  revalidatePath("/chacaras");
  return { ok: true };
}

/** Desfaz a reserva — o dia volta a ficar livre. */
export async function excluirReserva(id: string): Promise<Simples> {
  const supabase = createClient();
  const { data, error } = await supabase.from("chacara_reservas").delete().eq("id", id).select("id");
  if (error) return { error: erroDaAgenda(error) };
  if (!data || data.length === 0)
    return { error: "Seu usuário não tem permissão para apagar reservas das chácaras" };
  revalidatePath("/chacaras");
  return { ok: true };
}
