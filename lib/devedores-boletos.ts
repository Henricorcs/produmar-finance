import type { LoanBoleto } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// OS BOLETOS DA DÍVIDA — o que a tela e o carnê usam (sem falar com o banco)
// ─────────────────────────────────────────────────────────────────────────────
// O status, "em aberto", "no banco" e o rótulo colorido são os mesmos do
// boleto do aluguel (lib/alugueis-boletos): a Cora é a mesma e o caminho
// também — primeiro só no sistema, depois de confirmar, no banco.

/**
 * Multa e juros do atraso no boleto da dívida. A dívida não tem contrato com
 * cláusula de multa (como o aluguel), então vai o usual da cobrança: 2% de
 * multa e 1% de juros ao mês.
 */
export const MULTA_DA_DIVIDA = 2;
export const JUROS_DA_DIVIDA = 1;

/** O que o boleto cobra: "Parcela 2 de 6", ou a descrição do boleto avulso. */
export function tituloDoBoletoDaDivida(
  b: Pick<LoanBoleto, "numero" | "descricao">,
  totalDeParcelas?: number | null
): string {
  if (b.numero != null) {
    return totalDeParcelas ? `Parcela ${b.numero} de ${totalDeParcelas}` : `Parcela ${b.numero}`;
  }
  return b.descricao?.trim() || "Saldo da dívida";
}
