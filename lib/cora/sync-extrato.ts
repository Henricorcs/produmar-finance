import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarExtratoCompleto } from "./client";
import type { CoraStatementEntry } from "./types";
import type { TransactionStatus, TransactionType } from "@/lib/types";

/** Sem sincronização anterior: começa buscando os últimos N dias. */
const JANELA_INICIAL_DIAS = 30;
/** Reconsulta os últimos N dias a cada rodada, pra não perder nada por causa de atraso na Cora em liquidar uma movimentação. */
const SOBREPOSICAO_DIAS = 2;
/** Janela pra casar uma movimentação do extrato com um lançamento já existente. */
const JANELA_DE_DATA_PARA_CASAR_MS = 3 * 24 * 60 * 60 * 1000;

export interface ResultadoSyncExtrato {
  criadas: number;
  /** Casadas com um lançamento existente (boleto emitido pelo sistema, ou conta lançada manualmente e paga pela Cora). */
  vinculadas: number;
  /** Já tinham sido sincronizadas antes (reprocessadas por causa da sobreposição de dias). */
  ignoradas: number;
  erros: string[];
}

function paraDataISO(iso: string): string {
  return iso.slice(0, 10);
}

function statusInicial(type: TransactionType): TransactionStatus {
  return type === "entrada" ? "recebido" : "pago";
}

async function calcularInicioDaBusca(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase
    .from("transactions")
    .select("due_date")
    .not("cora_entry_id", "is", null)
    .order("due_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const hoje = new Date();

  if (!data?.due_date) {
    const inicio = new Date(hoje);
    inicio.setDate(inicio.getDate() - JANELA_INICIAL_DIAS);
    return paraDataISO(inicio.toISOString());
  }

  const ultimaData = new Date(`${data.due_date}T00:00:00Z`);
  ultimaData.setDate(ultimaData.getDate() - SOBREPOSICAO_DIAS);
  return paraDataISO(ultimaData.toISOString());
}

interface LancamentoParaGravar {
  type: TransactionType;
  description: string;
  amount: number;
  data: string;
  notes: string;
  cora_entry_id: string;
  cora_transaction_type: string;
}

/** A Cora às vezes manda no campo de mensagem só zeros/números (ex: TED recebida) — isso não é texto útil. */
function textoUtil(texto: string | undefined): string | null {
  const limpo = texto?.replace(/\s+/g, " ").trim();
  return limpo && /\p{L}/u.test(limpo) ? limpo : null;
}

function mapearEntry(entry: CoraStatementEntry): LancamentoParaGravar | null {
  if (entry.type !== "CREDIT" && entry.type !== "DEBIT") return null;

  const type: TransactionType = entry.type === "CREDIT" ? "entrada" : "saida";
  const contraparte = entry.transaction.counterParty;
  const nome = textoUtil(contraparte?.name);
  const mensagem = textoUtil(entry.transaction.description);

  // Mesmo padrão dos lançamentos manuais: a descrição é quem pagou/recebeu e o
  // motivo vai nas observações. Tarifa é exceção: a contraparte é sempre a
  // própria Cora, então o que identifica é a mensagem.
  const principal =
    entry.transaction.type === "FEE" ? mensagem ?? nome : nome ?? mensagem;
  const description = (principal ?? `Movimentação Cora (${entry.transaction.type})`).toUpperCase();

  const notes = [
    mensagem && mensagem.toUpperCase() !== description ? `${mensagem}.` : null,
    `Importado do extrato Cora (${entry.transaction.type}).`,
    contraparte?.identity ? `CPF/CNPJ: ${contraparte.identity}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    type,
    description,
    amount: entry.amount / 100,
    data: paraDataISO(entry.createdAt),
    notes,
    cora_entry_id: entry.id,
    cora_transaction_type: entry.transaction.type,
  };
}

/** Procura um lançamento existente (manual ou boleto já emitido) que bata com essa movimentação, pra vincular em vez de duplicar. */
async function encontrarCandidatoParaVincular(
  supabase: SupabaseClient,
  lancamento: LancamentoParaGravar
): Promise<{ id: string } | null> {
  const dataMovimentacao = new Date(`${lancamento.data}T00:00:00Z`).getTime();

  const { data: candidatos, error } = await supabase
    .from("transactions")
    .select("id, due_date, paid_date")
    .eq("type", lancamento.type)
    .eq("amount", lancamento.amount)
    .is("cora_entry_id", null)
    .neq("status", "cancelado");

  if (error || !candidatos || candidatos.length === 0) return null;

  const dentroDaJanela = candidatos.filter((c) => {
    const dataReferencia = c.paid_date ?? c.due_date;
    if (!dataReferencia) return false;
    const diff = Math.abs(new Date(`${dataReferencia}T00:00:00Z`).getTime() - dataMovimentacao);
    return diff <= JANELA_DE_DATA_PARA_CASAR_MS;
  });

  // 0 ou mais de 1 candidato: não arrisca casar errado, deixa virar um
  // lançamento novo (fica com a badge de "sem plano de contas" pro usuário revisar).
  if (dentroDaJanela.length !== 1) return null;

  return { id: dentroDaJanela[0].id };
}

/** Busca o extrato da conta Cora e lança/vincula em `transactions` o que ainda não estiver sincronizado. */
export async function sincronizarExtratoCora(supabase: SupabaseClient): Promise<ResultadoSyncExtrato> {
  const resultado: ResultadoSyncExtrato = { criadas: 0, vinculadas: 0, ignoradas: 0, erros: [] };

  const start = await calcularInicioDaBusca(supabase);
  const end = paraDataISO(new Date().toISOString());

  const entries = await buscarExtratoCompleto(start, end);

  for (const entry of entries) {
    const lancamento = mapearEntry(entry);
    if (!lancamento) continue;

    try {
      const candidato = await encontrarCandidatoParaVincular(supabase, lancamento);

      if (candidato) {
        const { error } = await supabase
          .from("transactions")
          .update({
            status: statusInicial(lancamento.type),
            paid_date: lancamento.data,
            cora_entry_id: lancamento.cora_entry_id,
            cora_transaction_type: lancamento.cora_transaction_type,
          })
          .eq("id", candidato.id);

        if (error) {
          resultado.erros.push(`${lancamento.cora_entry_id}: ${error.message}`);
        } else {
          resultado.vinculadas++;
        }
        continue;
      }

      const { error } = await supabase.from("transactions").insert({
        type: lancamento.type,
        description: lancamento.description,
        amount: lancamento.amount,
        due_date: lancamento.data,
        paid_date: lancamento.data,
        status: statusInicial(lancamento.type),
        category_id: null,
        cost_center_id: null,
        contact_id: null,
        obra_id: null,
        notes: lancamento.notes,
        cora_entry_id: lancamento.cora_entry_id,
        cora_transaction_type: lancamento.cora_transaction_type,
      });

      if (error) {
        if (error.code === "23505") {
          resultado.ignoradas++;
        } else {
          resultado.erros.push(`${lancamento.cora_entry_id}: ${error.message}`);
        }
      } else {
        resultado.criadas++;
      }
    } catch (e) {
      resultado.erros.push(`${lancamento.cora_entry_id}: ${(e as Error).message}`);
    }
  }

  return resultado;
}
