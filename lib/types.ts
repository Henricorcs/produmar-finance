export type UserRole = "admin" | "financeiro" | "visualizador";
export type TransactionType = "entrada" | "saida";
export type TransactionStatus = "pendente" | "pago" | "recebido" | "vencido" | "cancelado";
export type InvoiceSource = "xml" | "pdf" | "manual";
export type AlertType = "vencimento_proximo" | "vencido" | "resumo_diario" | "resumo_semanal";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
  icon: string | null;
  parent_id: string | null;
}

export interface CostCenter {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
}

export interface Contact {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  is_supplier: boolean;
  is_customer: boolean;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  description: string;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: TransactionStatus;
  category_id: string | null;
  cost_center_id: string | null;
  contact_id: string | null;
  invoice_id: string | null;
  notes: string | null;
  attachment_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  source: InvoiceSource;
  access_key: string | null;
  number: string | null;
  series: string | null;
  issue_date: string | null;
  emitter_document: string | null;
  emitter_name: string | null;
  receiver_document: string | null;
  receiver_name: string | null;
  total_amount: number | null;
  direction: TransactionType | null;
  file_url: string | null;
  raw_data: unknown;
  processed: boolean;
  transaction_id: string | null;
}

export interface DashboardKPIs {
  saldo_atual: number;
  receitas_mes: number;
  despesas_mes: number;
  a_pagar_7dias: number;
  count_receitas_mes: number;
  count_despesas_mes: number;
  count_a_pagar_7dias: number;
}

export interface ExpenseByCategory {
  category_id: string;
  category_name: string;
  category_color: string;
  total: number;
  count: number;
}

export interface CashflowMonth {
  month: string;
  month_label: string;
  receitas: number;
  despesas: number;
}
