"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PrefeituraSituacao } from "@/lib/types";

/**
 * NOTAS DA PREFEITURA — controle, não caixa. Nada daqui escreve em
 * `transactions`: quem lança o dinheiro no caixa continua sendo o escritório,
 * em Finanças. Aqui só se sabe o que foi emitido e o que a prefeitura já pagou.
 */
function revalidate() {
  revalidatePath("/prefeitura");
}

type Resultado = { ok: true } | { error: string };

// ── Notas ─────────────────────────────────────────────────────────────────

export type NotaInput = {
  secretaria_id: string;
  numero: string;
  data_emissao: string;
  valor: number;
  situacao: PrefeituraSituacao;
  data_baixa: string | null;
  observacao: string | null;
};

function validarNota(n: NotaInput): string | null {
  if (!n.secretaria_id) return "Escolha a secretaria.";
  if (!n.numero.trim()) return "Informe o número da nota.";
  if (!n.data_emissao) return "Informe a data de emissão.";
  if (!(n.valor > 0)) return "Informe o valor da nota.";
  if (n.situacao === "pago" && !n.data_baixa) return "Nota paga precisa da data da baixa.";
  return null;
}

function linhaDaNota(n: NotaInput) {
  return {
    secretaria_id: n.secretaria_id,
    numero: n.numero.trim(),
    data_emissao: n.data_emissao,
    valor: n.valor,
    situacao: n.situacao,
    // a data da baixa só existe em nota paga — cancelar ou reabrir apaga
    data_baixa: n.situacao === "pago" ? n.data_baixa : null,
    observacao: n.observacao?.trim() || null,
  };
}

export async function salvarNota(id: string | null, n: NotaInput): Promise<Resultado> {
  const erro = validarNota(n);
  if (erro) return { error: erro };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { error } = id
    ? await supabase.from("prefeitura_notas").update(linhaDaNota(n)).eq("id", id)
    : await supabase
        .from("prefeitura_notas")
        .insert({ ...linhaDaNota(n), created_by: user.id });

  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

/** Dá baixa de uma vez em várias notas — a prefeitura costuma pagar em lote. */
export async function darBaixa(ids: string[], dataBaixa: string): Promise<Resultado> {
  if (ids.length === 0) return { error: "Nenhuma nota escolhida." };
  if (!dataBaixa) return { error: "Informe a data da baixa." };

  const supabase = createClient();
  const { error } = await supabase
    .from("prefeitura_notas")
    .update({ situacao: "pago", data_baixa: dataBaixa })
    .in("id", ids)
    .neq("situacao", "cancelada");

  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function excluirNota(id: string): Promise<Resultado> {
  const supabase = createClient();
  const { error } = await supabase.from("prefeitura_notas").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ── Secretarias ───────────────────────────────────────────────────────────

export type SecretariaInput = {
  nome: string;
  valor_contrato: number | null;
  valor_padrao: number | null;
};

export async function salvarSecretaria(
  id: string | null,
  s: SecretariaInput
): Promise<Resultado> {
  const nome = s.nome.trim().toUpperCase();
  if (!nome) return { error: "Informe o nome da secretaria." };

  const supabase = createClient();
  const linha = {
    nome,
    valor_contrato: s.valor_contrato && s.valor_contrato > 0 ? s.valor_contrato : null,
    valor_padrao: s.valor_padrao && s.valor_padrao > 0 ? s.valor_padrao : null,
  };

  if (id) {
    const { error } = await supabase.from("prefeitura_secretarias").update(linha).eq("id", id);
    if (error) return { error: error.message };
  } else {
    // entra no fim da fila, depois da última
    const { data: ultima } = await supabase
      .from("prefeitura_secretarias")
      .select("ordem")
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase
      .from("prefeitura_secretarias")
      .insert({ ...linha, ordem: (ultima?.ordem ?? 0) + 1 });
    if (error) return { error: error.message };
  }

  revalidate();
  return { ok: true };
}

/**
 * Some da tela, mas não apaga: as notas dela continuam no banco. Apagar a
 * secretaria levaria as notas junto (on delete cascade), e isso é histórico.
 */
export async function arquivarSecretaria(id: string, ativa: boolean): Promise<Resultado> {
  const supabase = createClient();
  const { error } = await supabase
    .from("prefeitura_secretarias")
    .update({ ativa })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}
