/** Tipos da API da Cora (modalidade Integração Direta, v2 de boletos). */

export type CoraInvoiceStatus = "DRAFT" | "OPEN" | "IN_PAYMENT" | "LATE" | "PAID" | "CANCELLED";

export interface CoraDocument {
  identity: string;
  type: "CPF" | "CNPJ";
}

export interface CoraCustomer {
  name: string;
  email?: string;
  document: CoraDocument;
}

export interface CoraService {
  name: string;
  description: string;
  /** Em centavos. */
  amount: number;
}

export interface CoraPaymentTerms {
  /** AAAA-MM-DD. Não pode ser antes do dia da emissão. */
  due_date: string;
  /** Multa do atraso, em percentual (0 a 100). Vale a partir do dia seguinte ao vencimento. */
  fine?: { rate: number };
  /** Juros do atraso, em percentual ao mês (0 a 100). */
  interest?: { rate: number };
}

export interface CoraInvoiceRequest {
  code?: string;
  customer: CoraCustomer;
  services: CoraService[];
  payment_terms: CoraPaymentTerms;
  payment_forms?: ("BANK_SLIP" | "PIX")[];
}

export interface CoraBankSlip {
  barcode: string;
  digitable: string;
  registered: string;
  url: string;
  our_number: string;
}

export interface CoraPayment {
  id: string;
  status: string;
  created_at: string;
  finalized_at: string;
  total_paid: number;
  method: "BANK_SLIP" | "PIX";
  interest: number;
  fine: number;
}

export interface CoraInvoiceResponse {
  id: string;
  status: CoraInvoiceStatus;
  created_at: string;
  total_amount: number;
  total_paid: number;
  occurrence_date?: string;
  code: string;
  payment_options?: { bank_slip?: CoraBankSlip };
  payments?: CoraPayment[];
  pix?: { emv?: string };
}

/** Extrato bancário (Consulta de Extrato) — movimentações da conta, não só boletos. */

export type CoraEntryType = "CREDIT" | "DEBIT" | "BLOCK" | "UNBLOCK";

export type CoraStatementTransactionType =
  | "TRANSFER"
  | "PAYMENT"
  | "PIX"
  | "FEE"
  | "JUD_BLOCKER"
  | "BANK_DOMICILE"
  | "CARD"
  | "LIMIT_RESERVATION";

export interface CoraCounterParty {
  name?: string;
  identity?: string;
}

export interface CoraStatementTransaction {
  /** Prefixo trx_. */
  id: string;
  type: CoraStatementTransactionType;
  description?: string;
  counterParty?: CoraCounterParty;
}

export interface CoraStatementEntry {
  /** Prefixo ent_ — único, usado pra dedupe. */
  id: string;
  type: CoraEntryType;
  /** Em centavos. */
  amount: number;
  createdAt: string;
  transaction: CoraStatementTransaction;
}

export interface CoraStatementResponse {
  entries: CoraStatementEntry[];
  // Nomes exatos de paginação a confirmar em stage — o código não depende deles
  // além de parar quando a página vier mais curta que o perPage pedido.
  page?: number;
  perPage?: number;
  totalPages?: number;
}
