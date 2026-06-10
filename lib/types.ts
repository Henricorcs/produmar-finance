export type UserRole = "admin" | "financeiro" | "visualizador" | "operador";
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

export interface TransactionAttachment {
  id: string;
  transaction_id: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  storage_path: string;
  created_by: string | null;
  created_at: string;
}

export interface DashboardKPIs {
  saldo_atual: number;
  receitas_mes: number;
  despesas_mes: number;
  a_pagar_7dias: number;
  a_receber_mes: number;
  count_receitas_mes: number;
  count_despesas_mes: number;
  count_a_pagar_7dias: number;
  count_a_receber_mes: number;
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

export interface CashflowProjectionDay {
  day: string;          // YYYY-MM-DD
  day_label: string;    // DD/MM
  entradas: number;
  saidas: number;
  saldo_projetado: number;
}

// ── Operações (Ordens de Serviço) ────────────────────────────────────────────

export type ServiceOrderType    = "entrega_material" | "prestacao_servico" | "frete";
export type ServiceFreightType  = "cliente" | "interno";
export type ServiceOrderStatus  = "pendente" | "em_andamento" | "entregue" | "cancelado";
export type MachineTrackingType = "hourmeter" | "km";
/** Como o frete é cobrado na entrega de material (null = OS antiga/serviço). */
export type ServiceBillingMode  = "viagem" | "km" | "diaria";

export interface Machine {
  id: string;
  name: string;
  plate: string | null;
  type: string | null;
  tracking_type: MachineTrackingType;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  name: string;
  unit: string;
  default_price: number | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PickupLocation {
  id: string;
  name: string;
  address: string | null;
  document: string | null;   // CNPJ/CPF da jazida (fornecedor)
  phone: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServiceOrder {
  id: string;
  order_number: number;
  type: ServiceOrderType;
  freight_type: ServiceFreightType;
  status: ServiceOrderStatus;

  client_name: string | null;
  client_document: string | null;
  client_phone: string | null;

  machine_id: string | null;
  pickup_location_id: string | null;
  delivery_address: string | null;
  service_description: string | null;

  issue_date: string;
  delivery_date: string | null;

  hourmeter_start: number | null;
  hourmeter_end: number | null;
  km_start: number | null;
  km_end: number | null;
  hourly_rate: number | null;
  service_cost: number | null;
  fuel_cost: number | null;
  received_by: string | null;

  /** Cobrança do frete (entrega de material). */
  billing_mode: ServiceBillingMode | null;
  /** Valor da viagem | valor do km | valor da diária (fixo). */
  freight_value: number | null;
  /** Nº de viagens feitas (modo viagem — o técnico marca durante a OS). */
  trips_count: number | null;
  /** Hora de saída/início (HH:MM, gravada ao iniciar pelo técnico). */
  start_time: string | null;
  /** Hora de chegada/fim (HH:MM, gravada ao finalizar). */
  end_time: string | null;

  total_amount: number;
  transaction_id: string | null;

  /** Assinatura digital (PNG data-URL) capturada na finalização. */
  signature: string | null;

  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceOrderItem {
  id: string;
  service_order_id: string;
  product_id: string | null;
  description: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number;
  total: number;
  /** Linha de frete (viagem/km/diária) — não é material, não mexe no estoque. */
  is_freight: boolean;
  created_at: string;
}

/** Viagem marcada pelo técnico no modo "por viagem" — guarda o horário de cada uma. */
export interface ServiceOrderTrip {
  id: string;
  service_order_id: string;
  trip_number: number;
  trip_time: string | null; // HH:MM:SS (relógio do celular do técnico)
  created_at: string;
}

// ── Empréstimos ───────────────────────────────────────────────────────────────

export type LoanRepaymentType = "avulso" | "parcelado";
export type LoanStatus = "em_aberto" | "quitado" | "cancelado";

export interface Loan {
  id: string;
  loan_number: number;

  borrower_name: string;
  borrower_document: string | null;
  borrower_phone: string | null;

  principal: number;
  interest_rate: number | null;   // % ao mês (juros simples)
  term_months: number | null;

  repayment_type: LoanRepaymentType;
  installments_count: number | null;

  loan_date: string;
  due_date: string | null;

  status: LoanStatus;
  transaction_id: string | null;            // lançamento de SAÍDA (dinheiro emprestado)
  receivable_transaction_id: string | null; // recebível (entrada pendente) — empréstimo avulso

  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoanInstallment {
  id: string;
  loan_id: string;
  number: number;
  due_date: string;
  amount: number;
  paid: boolean;
  transaction_id: string | null;            // recebível (entrada pendente) desta parcela
  created_at: string;
}

export interface LoanPayment {
  id: string;
  loan_id: string;
  installment_id: string | null;
  amount: number;
  payment_date: string;
  transaction_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface LoanAttachment {
  id: string;
  loan_id: string;
  payment_id: string | null;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  storage_path: string;
  created_by: string | null;
  created_at: string;
}

// ── Estoque (Jazidas, Compras de material, Movimentações) ──────────────────────

export type StockMovementType = "entrada" | "saida" | "ajuste";

export interface MaterialPurchase {
  id: string;
  purchase_number: number;
  location_id: string | null;
  purchase_date: string;
  total_amount: number;
  amount_paid: number;
  transaction_id: string | null;
  attachment_path: string | null;
  attachment_name: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaterialPurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string | null;
  quantity: number;
  unit: string | null;
  unit_price: number;
  total: number;
  created_at: string;
}

export interface StockMovement {
  id: string;
  product_id: string;
  location_id: string | null;
  type: StockMovementType;
  quantity: number;
  unit: string | null;
  unit_cost: number | null;
  movement_date: string;
  purchase_id: string | null;
  service_order_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/** Linha da view product_stock_balance (saldo atual por material). */
export interface ProductStockBalance {
  product_id: string;
  name: string;
  unit: string;
  current_quantity: number;
  total_in: number;
  total_out: number;
  total_purchased_value: number;
  avg_unit_cost: number | null;
}
