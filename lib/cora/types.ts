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
  /** AAAA-MM-DD. */
  due_date: string;
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
