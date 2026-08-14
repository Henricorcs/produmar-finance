export type UserRole = "admin" | "financeiro" | "visualizador" | "operador" | "vaqueiro";
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
  /** Categorias de máquina/veículo que este operador pode usar (vazio = todas). */
  allowed_categories: string[];
  /** Slugs dos módulos liberados para este usuário (vazio = todos). */
  allowed_modules: string[];
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
  /** OS de origem (lançamento automático de operação) — fica fora da aba Contas. */
  service_order_id: string | null;
  /** Obra vinculada (opcional) — soma no custo total da obra. */
  obra_id: string | null;
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
  a_receber_total: number;
  count_receitas_mes: number;
  count_despesas_mes: number;
  count_a_pagar_7dias: number;
  count_a_receber_total: number;
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

export type ServiceOrderType    = "entrega_material" | "prestacao_servico" | "frete" | "servico_rapido";
export type ServiceFreightType  = "cliente" | "interno";
export type ServiceOrderStatus  = "pendente" | "em_andamento" | "entregue" | "cancelado";
export type MachineTrackingType = "hourmeter" | "km";
/** Como o frete é cobrado (tipo "frete"; null = entrega só de material/serviço). */
export type ServiceBillingMode  = "viagem" | "km" | "diaria";

/** Categoria do veículo/máquina (controlada pela UI; coluna é texto livre). */
export type MachineCategory =
  | "caminhao"
  | "cacamba"
  | "trator"
  | "carregadeira"
  | "maquina"
  | "outro";

/** Lista canônica de categorias (rótulo exibido + ordem dos botões). */
export const MACHINE_CATEGORIES: { value: MachineCategory; label: string }[] = [
  { value: "caminhao",     label: "Caminhão" },
  { value: "cacamba",      label: "Caçamba" },
  { value: "trator",       label: "Trator" },
  { value: "carregadeira", label: "Carregadeira" },
  { value: "maquina",      label: "Máquina" },
  { value: "outro",        label: "Outro" },
];

/** Só estas categorias fazem FRETE e cobrança POR KM (caminhão e caçamba). */
export const FREIGHT_CATEGORIES: MachineCategory[] = ["caminhao", "cacamba"];

export interface Machine {
  id: string;
  name: string;
  plate: string | null;
  type: string | null;
  /** Categoria (caminhao, cacamba, trator, ...). Define quem pode fazer frete. */
  category: string | null;
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

export const PRODUCT_UNITS = ["m³", "peça", "carrada"] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

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

export type ObraStatus = "planejamento" | "em_andamento" | "concluida" | "cancelada";

export interface Obra {
  id: string;
  obra_number: number;
  name: string;
  contact_id: string | null;
  location: string | null;
  status: ObraStatus;
  start_date: string | null;
  planned_end_date: string | null;
  actual_end_date: string | null;
  budget: number | null;
  notes: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Obra + agregados calculados pela view v_obra_summary. */
export interface ObraSummary extends Obra {
  total_cost: number;
  os_count: number;
  tools_in_use: number;
  total_savings: number;
}

/** Linha de material/mão de obra lançada na obra (lista estilo planilha). */
export interface ObraItem {
  id: string;
  obra_id: string;
  item_date: string;
  product: string;
  quantity: number;
  unit: string;
  unit_price: number;
  market_unit_price: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const OBRA_ITEM_UNITS = [
  "UNIDADE",
  "PÇ",
  "KG",
  "M",
  "M²",
  "M³",
  "SC",
  "L",
  "DIÁRIA",
  "PACOTE",
] as const;

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
  /** Obra vinculada (opcional) — soma no custo total da obra. */
  obra_id: string | null;
  /** Operador (técnico) para quem a OS foi enviada — aparece só no painel dele. */
  assigned_to: string | null;
  /** Operador que FINALIZOU a OS (clicou FINALIZAR no painel) — usado para o
   *  histórico "Finalizadas" do operador. Null em OS ainda não fechadas. */
  finalized_by: string | null;
  /** De onde (frete diária/km): texto preenchido pelo operador ao iniciar. */
  origin_address: string | null;
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
  /** Localização GPS capturada automaticamente ao finalizar (best-effort). */
  end_latitude: number | null;
  end_longitude: number | null;
  /** Precisão do GPS em metros. */
  end_location_accuracy: number | null;

  total_amount: number;
  transaction_id: string | null;

  /** Assinatura digital (PNG data-URL) capturada na finalização. */
  signature: string | null;

  /** "O que foi feito" — preenchido pelo funcionário no fechamento (serviço rápido). */
  completion_notes: string | null;

  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Comprovante (foto/PDF) anexado a uma OS — ex.: recibo de um serviço rápido. */
export interface ServiceOrderAttachment {
  id: string;
  service_order_id: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  storage_path: string;
  created_by: string | null;
  created_at: string;
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

/**
 * Pausa / retomada de um serviço interno que dura vários dias. Cada par
 * pausa→retomada é uma linha; pausa em aberto (resume_time null) indica que o
 * serviço está pausado. Horários/datas vêm do relógio do celular do técnico.
 */
export interface ServiceOrderPause {
  id: string;
  service_order_id: string;
  pause_number: number;
  /** Data da pausa (YYYY-MM-DD, relógio do celular). */
  pause_date: string | null;
  /** Hora da pausa (HH:MM). */
  pause_time: string | null;
  /** Leitura do veículo/máquina ao pausar (km do hodômetro ou horímetro). */
  pause_reading: number | null;
  /** Observação do dia (opcional). */
  pause_notes: string | null;
  /** Localização (GPS) capturada automaticamente ao pausar (best-effort). */
  latitude: number | null;
  longitude: number | null;
  location_accuracy: number | null;
  /** Data da retomada (null enquanto pausado). */
  resume_date: string | null;
  /** Hora da retomada (HH:MM, null enquanto pausado). */
  resume_time: string | null;
  /** Leitura (km/horímetro) ao voltar a trabalhar. */
  resume_reading: number | null;
  created_at: string;
}

/**
 * Encaminhamento de uma OS de um operador para outro. Guarda quem encaminhou,
 * para quem, quando e uma observação — o nome é snapshot (não depende de join).
 */
export interface ServiceOrderForward {
  id: string;
  service_order_id: string;
  from_user: string | null;
  from_name: string | null;
  to_user: string | null;
  to_name: string | null;
  note: string | null;
  created_at: string;
}

/** Viagem marcada pelo técnico no modo "por viagem" — horário e assinatura de cada entrega. */
export interface ServiceOrderTrip {
  id: string;
  service_order_id: string;
  trip_number: number;
  trip_time: string | null; // HH:MM:SS (relógio do celular do técnico)
  /** Quem recebeu esta entrega (assinado na hora pelo destinatário). */
  received_by: string | null;
  /** Assinatura digital (PNG data-URL) colhida na entrega da viagem. */
  signature: string | null;
  /** Localização (GPS do celular) de onde a viagem foi entregue. */
  latitude: number | null;
  longitude: number | null;
  location_accuracy: number | null;
  /** De onde a viagem saiu (texto do operador, no "Iniciar viagem"). */
  origin: string | null;
  /** Onde foi entregue (texto do operador, no "Finalizar viagem"). */
  destination: string | null;
  /** Hora de saída (HH:MM). trip_time = hora de chegada/entrega. */
  start_time: string | null;
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
  interest_amount: number | null; // juros fixo em R$ (alternativa a interest_rate × term_months)

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

// ═══════════════════════════════════════════════════════════════════════════
// FERRAMENTAS
// ═══════════════════════════════════════════════════════════════════════════

export type ToolCondition = "otimo" | "bom" | "regular" | "ruim";
export type ToolStatus = "disponivel" | "em_uso" | "manutencao" | "baixada";

/** Almoxarifado onde o patrimônio fica guardado (garagem, depósito...). */
export interface ToolWarehouse {
  id: string;
  name: string;
  location: string | null;
  notes: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface Tool {
  id: string;
  tool_number: number;
  name: string;
  code: string | null;
  condition: ToolCondition;
  photo_path: string | null;
  active: boolean;
  /** Almoxarifado onde o item fica guardado. */
  warehouse_id: string | null;
  /** Saldo total de unidades deste item. */
  quantity: number;
  /** Tipo de unidade (unidade, peça, jogo, par...). Texto livre. */
  unit: string;
  /** Valor unitário do item. */
  unit_value: number;
  /** Valor de reposição — quanto custa repor uma unidade perdida/inutilizada. */
  replacement_value: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ToolPhoto {
  id: string;
  tool_id: string;
  path: string;
  created_by: string | null;
  created_at: string;
}

export interface ToolLoan {
  id: string;
  tool_id: string;
  /** Quantidade retirada nesta baixa. */
  quantity: number;
  borrower_name: string;
  destination: string | null;
  /** Obra vinculada (opcional) — aparece junto do destino. */
  obra_id: string | null;
  checked_out_at: string;
  expected_return_date: string | null;
  receiver_signature: string | null;
  receiver_photo_path: string | null;
  returned_at: string | null;
  return_condition: ToolCondition | null;
  return_notes: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ToolMaintenance {
  id: string;
  tool_id: string;
  description: string;
  cost: number;
  started_at: string;
  finished_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/** Inutilização (perda definitiva) de N unidades de um patrimônio. */
export interface ToolWriteoff {
  id: string;
  tool_id: string;
  quantity: number;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

/** Tipo de unidade editável (unidade, peça, jogo, par...). */
export interface ToolUnit {
  id: string;
  name: string;
  created_at: string;
}

/** Linha da view v_tool_status (patrimônio + status e saldos derivados). */
export interface ToolWithStatus extends Tool {
  /** Nome do almoxarifado (join da view). */
  warehouse_name: string | null;
  status: ToolStatus;
  open_loan_id: string | null;
  current_borrower: string | null;
  current_destination: string | null;
  current_checked_out_at: string | null;
  current_expected_return_date: string | null;
  current_obra_id: string | null;
  open_maintenance_id: string | null;
  open_maintenance_description: string | null;
  open_maintenance_started_at: string | null;
  /** Soma das retiradas em aberto. */
  in_use_qty: number;
  /** Soma das inutilizações. */
  written_off_qty: number;
  /** Saldo disponível = quantity - in_use_qty - written_off_qty (>= 0). */
  available_qty: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANIMAIS
// ═══════════════════════════════════════════════════════════════════════════

export type AnimalSex = "macho" | "femea";
/** Tipo do animal (espécie). Tudo que foi cadastrado antes é bovino. */
export type AnimalSpecies = "bovino" | "equino" | "caprino" | "ovino";
/**
 * Categoria derivada na view v_animals (idade < 12 meses = bezerro). As chaves
 * são o PAPEL do animal, não o nome dele: `bezerro` = filhote, `boi` = macho
 * adulto, `vaca` = fêmea adulta. Quem dá nome conforme o tipo é `categoryLabel`
 * (potro, cabrito, cordeiro...).
 */
export type AnimalCategory = "boi" | "vaca" | "bezerro";

/** Raça do animal — cadastro editável, uma raça pertence a um tipo. */
export interface AnimalBreed {
  id: string;
  name: string;
  species: AnimalSpecies;
  created_at: string;
}

export interface Animal {
  id: string;
  /** Número do animal (brinco). */
  tag: string;
  sex: AnimalSex;
  /** Tipo do animal (bovino, equino, caprino, ovino). */
  species: AnimalSpecies;
  birth_date: string | null;
  breed_id: string | null;
  /** Peso atual em kg. */
  weight: number;
  photo_path: string | null;
  active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnimalPhoto {
  id: string;
  animal_id: string;
  path: string;
  created_by: string | null;
  created_at: string;
}

/** Parto — uma linha por bezerro nascido, com o sexo da cria. */
export interface AnimalBirth {
  id: string;
  mother_id: string;
  birth_date: string;
  calf_tag: string | null;
  calf_sex: AnimalSex | null;
  /** Preenchido quando o bezerro também virou cadastro de animal. */
  calf_animal_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/** Tratamento — o remédio usado aparece na tela ao passar o mouse. */
export interface AnimalTreatment {
  id: string;
  animal_id: string;
  description: string;
  medicine: string | null;
  dose: string | null;
  applied_at: string;
  next_application: string | null;
  cost: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/** Vacina cadastrada — recurrence_months null/0 = dose única. */
export interface AnimalVaccine {
  id: string;
  name: string;
  recurrence_months: number | null;
  /** Dose fixa em ml. */
  default_dose_ml: number | null;
  /** Dose por peso: `dose_ml_per_weight` ml a cada `dose_weight_kg` kg. */
  dose_ml_per_weight: number | null;
  dose_weight_kg: number | null;
  /** Marca que costuma ser usada — vem preenchida na aplicação. */
  default_brand: string | null;
  notes: string | null;
  created_at: string;
}

export interface AnimalVaccination {
  id: string;
  animal_id: string;
  vaccine_id: string;
  applied_at: string;
  /** Quantidade aplicada, em ml. */
  dose_ml: number | null;
  /** Marca da vacina usada nesta aplicação. */
  brand: string | null;
  /** Agrupa as vacinas aplicadas no mesmo protocolo. */
  protocol_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * Pesagem do animal. Uma linha por dia pesado — o protocolo de vacinação
 * costuma gravar uma (protocol_id preenchido), mas dá para pesar avulso.
 */
export interface AnimalWeight {
  id: string;
  animal_id: string;
  weighed_at: string;
  /** Peso em kg naquele dia. */
  weight: number;
  /** Protocolo de vacinação em que o peso foi tirado (null = pesagem avulsa). */
  protocol_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * Vacina que o dono marcou como pendente NA MÃO para um animal. A marca sai
 * sozinha quando a vacina é aplicada.
 */
export interface AnimalVaccinePending {
  id: string;
  animal_id: string;
  vaccine_id: string;
  /** Por que ficou pendente (opcional). */
  note: string | null;
  created_by: string | null;
  created_at: string;
}

/** Linha da view v_animals (animal + raça, idade, categoria e vacinação). */
export interface AnimalWithInfo extends Animal {
  breed_name: string | null;
  /** Idade em meses cheios (null quando não há data de nascimento). */
  age_months: number | null;
  category: AnimalCategory;
  /** Quantas vacinas existem no cadastro. */
  vaccines_total: number;
  /** Vacinas em dia / pendentes (sobre o cadastro de vacinas). */
  vaccines_ok: number;
  vaccines_due: number;
}
