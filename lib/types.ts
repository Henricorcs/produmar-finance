export type UserRole =
  | "admin"
  | "financeiro"
  | "visualizador"
  /** Recebe a OS no celular e faz só isso. */
  | "operador"
  /**
   * O degrau entre o operador e o admin: recebe OS como o operador E manda nos
   * módulos liberados para ele — é quem toma conta da frota, alimenta as
   * diárias e distribui serviço para os motoristas. Ver a migration 079.
   */
  | "encarregado"
  | "vaqueiro"
  /**
   * Na tela: ENCARREGADO DE OBRA (o nome mudou, o valor no banco não). Avisa da
   * obra o material que gastou, os dias dos colaboradores liberados para ele e
   * os metros de cerca — ver as migrations 052 e 099.
   */
  | "tecnico";
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
  /** Boleto emitido pela Cora (migration 100) — null enquanto não foi gerado. */
  cora_invoice_id?: string | null;
  /** Status bruto devolvido pela Cora (OPEN/LATE/PAID/CANCELLED/DRAFT) — só depuração. */
  cora_status?: string | null;
  boleto_digitable_line?: string | null;
  boleto_barcode?: string | null;
  /** Link do PDF do boleto. */
  boleto_url?: string | null;
  boleto_our_number?: string | null;
  /** Pix copia-e-cola do boleto, quando a Cora gera QR code junto. */
  pix_emv?: string | null;
  /** Movimentação do extrato da Cora que originou/confirmou este lançamento (migration 101). */
  cora_entry_id?: string | null;
  /** Tipo bruto da movimentação na Cora (TRANSFER/PIX/FEE/...) — só depuração. */
  cora_transaction_type?: string | null;
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
  /** XML completo da nota. Só é gravado no upload — nenhuma tela lê, e a
   *  listagem não busca este campo (é o mais pesado da tabela). */
  raw_data?: unknown;
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
  | "retroescavadeira"
  | "maquina"
  | "outro";

/** Lista canônica de categorias (rótulo exibido + ordem dos botões). */
export const MACHINE_CATEGORIES: { value: MachineCategory; label: string }[] = [
  { value: "caminhao",     label: "Caminhão" },
  { value: "cacamba",      label: "Caçamba" },
  { value: "trator",       label: "Trator" },
  { value: "carregadeira", label: "Carregadeira" },
  { value: "retroescavadeira", label: "Retroescavadeira" },
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

/**
 * Combustíveis que a máquina recebe na rua. Guardado como TEXTO na coluna
 * (não é enum): incluir um novo é mexer só aqui, sem migration.
 */
export const FUEL_TYPES = ["Diesel", "Diesel S-10", "Gasolina", "Etanol", "Arla 32"] as const;
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
  /**
   * Obra do ESTOQUE (supply_obras) para onde a OS manda o material — migration
   * 084. É outra lista, de propósito: o obra_id acima é do módulo Obras, e quem
   * trabalha com material vive nesta aqui, a mesma do aviso e da baixa.
   */
  supply_obra_id?: string | null;
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
  /**
   * Linha de MATERIAL PEDIDO numa OS de serviço rápido (migration 083). A
   * linha do serviço em si não tem a marca — é ela que carrega o valor.
   * Nas OS antigas de entrega de material fica falsa: lá toda linha que não é
   * frete já é material por definição.
   */
  is_material?: boolean;
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

/**
 * Como a dívida é paga (migration 093). Não confundir com `LoanRepaymentType`,
 * que diz se ela é parcelada ou de pagamentos avulsos — este é o MEIO do
 * pagamento, o que decide se a cobrança manda boleto, chave pix ou vai buscar.
 */
export type LoanPaymentMethod = "boleto" | "pix" | "cartao" | "dinheiro";

export const LOAN_PAYMENT_METHOD_LABEL: Record<LoanPaymentMethod, string> = {
  boleto: "Boleto",
  pix: "PIX",
  cartao: "Cartão",
  dinheiro: "Dinheiro",
};

export const LOAN_PAYMENT_METHODS = Object.keys(
  LOAN_PAYMENT_METHOD_LABEL
) as LoanPaymentMethod[];

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

  /**
   * Boleto, pix, cartão ou dinheiro (migration 093). Vem `undefined` enquanto
   * a migration não roda, e `null` na dívida lançada antes dela — nos dois
   * casos a tela não mostra nada, que é melhor que mostrar um chute.
   */
  payment_method?: LoanPaymentMethod | null;

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
/**
 * Tipo do animal (espécie). Tudo que foi cadastrado antes é bovino.
 *
 * PISCICULTURA e AVES (migration 086) entram pelo GASTO: quem cria peixe e
 * galinha não registra bicho por bicho, mas compra ração e alevino todo mês e
 * precisa saber quanto cada criação custou. Cadastrar o bicho um a um continua
 * possível (a matriz, o reprodutor), só não é o caminho normal deles.
 */
export type AnimalSpecies =
  | "bovino"
  | "equino"
  | "caprino"
  | "ovino"
  | "suino"
  | "piscicultura"
  | "aves";
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

/** Por que o animal saiu do rebanho: foi vendido ou morreu. */
export type AnimalExitReason = "venda" | "morte";

/**
 * Como o animal foi vendido (migration 072):
 *   unidade → um valor fechado pelo animal;
 *   peso    → tantos quilos a tanto o quilo, e o total sai da conta.
 * Venda lançada antes da 072 não tem forma: vale como "unidade".
 */
export type AnimalSaleMode = "unidade" | "peso";

export const SALE_MODE_LABEL: Record<AnimalSaleMode, string> = {
  unidade: "Na unidade",
  peso: "No peso",
};

export interface Animal {
  id: string;
  /** Número do animal (brinco). */
  tag: string;
  sex: AnimalSex;
  /** Tipo do animal (bovino, equino, caprino, ovino, suíno). */
  species: AnimalSpecies;
  birth_date: string | null;
  breed_id: string | null;
  /** Peso atual em kg. */
  weight: number;
  photo_path: string | null;
  /** false = saiu do rebanho (vendido ou morto). */
  active: boolean;
  /** Motivo da saída — null enquanto o animal está no rebanho (migration 056). */
  exit_reason?: AnimalExitReason | null;
  exit_date?: string | null;
  /** Quanto entrou na venda, SEMPRE o total (0 na morte). */
  exit_amount?: number | null;
  /** Como foi vendido (migration 072). Null em venda antiga = na unidade. */
  sale_mode?: AnimalSaleMode | null;
  /** Peso vendido, em kg — só vale quando `sale_mode` é "peso". */
  sale_weight_kg?: number | null;
  /** Preço do quilo — só vale quando `sale_mode` é "peso". */
  sale_price_per_kg?: number | null;
  exit_buyer?: string | null;
  exit_notes?: string | null;
  /** Lançamento gerado no financeiro pela venda — some junto se a saída for desfeita. */
  exit_transaction_id?: string | null;
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

/**
 * Solicitação de nascimento enviada pelo vaqueiro pelo celular — a mãe é só o
 * número que ele digitou (texto livre, não é FK: ele não escolhe da lista).
 * Fica pendente até o patrão conferir; sem status — a linha existir já é
 * "pendente" (animal_birth_requests, migration 048).
 */
export interface AnimalBirthRequest {
  id: string;
  mother_tag: string;
  /** Vazio no envio do vaqueiro — quem numera é o patrão ao lançar (migration 053). */
  calf_tag: string | null;
  calf_sex: AnimalSex;
  /**
   * Que bicho nasceu, do jeito que o vaqueiro marcou no celular (migration
   * 091) — é ele que dá nome à fila: bezerro, potro, cabrito, cordeiro,
   * leitão. Vem `undefined` enquanto a migration não roda, e envio antigo é
   * bovino: leia sempre com `speciesOf`. O tipo que ENTRA no cadastro
   * continua sendo o da mãe escolhida pelo patrão.
   */
  species?: AnimalSpecies | null;
  birth_date: string;
  photo_path: string | null;
  /**
   * O que o vaqueiro marcou como aplicado do protocolo do nascimento, como a
   * lista estava na hora (migration 095). Vazio em envio antigo.
   */
  protocolo_aplicado?: ProtocoloItemAplicado[] | null;
  created_by: string | null;
  created_at: string;
}

/**
 * Um item do PROTOCOLO DO NASCIMENTO (migration 095): o que a cria de um tipo
 * de bicho toma ao nascer. O dono monta; o vaqueiro marca como aplicado.
 */
export interface ProtocoloNascimentoItem {
  id: string;
  species: AnimalSpecies;
  medicine: string;
  dose: string | null;
  sort_order: number;
  created_at: string;
}

/** O que viaja com o nascimento: a fotografia do item, sem id nem ordem. */
export interface ProtocoloItemAplicado {
  medicine: string;
  dose: string | null;
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
  /**
   * De que tipo de animal é a vacina (migration 062). Aftosa é de bovino,
   * influenza equina é de cavalo. Vem `undefined` enquanto a migration não
   * roda — use `vaccinesForSpecies` em vez de ler direto.
   */
  species?: AnimalSpecies | null;
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

// ═══════════════════════════════════════════════════════════════════════════
// FICHA DE RECEITAS E DESPESAS COM ANIMAIS (migration 072)
// ═══════════════════════════════════════════════════════════════════════════
// A venda do animal já ia para o financeiro, mas sumia no meio de tudo, e o
// gasto com os bichos não tinha onde ser lançado. Com os dois lados juntos e
// SEMPRE amarrados à espécie, a ficha responde "o caprino se paga?".

/**
 * Unidades de medida sugeridas na compra (migration 092) — o campo continua
 * livre. São as que aparecem na nota do dia a dia: saco de ração, quilo de
 * sal, litro de vermífugo, milheiro de alevino e de pintinho.
 */
export const UNIDADES_DESPESA_ANIMAIS = [
  "SC",
  "KG",
  "T",
  "L",
  "ML",
  "UN",
  "CX",
  "FD",
  "DOSE",
  "MILHEIRO",
] as const;

/** Categorias sugeridas na despesa — o campo continua livre. */
export const DESPESAS_ANIMAIS_SUGERIDAS = [
  "RAÇÃO",
  "SAL MINERAL",
  "MEDICAMENTO",
  "VACINA",
  "VETERINÁRIO",
  "COMPRA DE ANIMAL",
  "ALEVINO",
  "PINTINHO",
  "FRETE",
  "PASTAGEM",
  "MÃO DE OBRA",
] as const;

/**
 * Gasto com animais, sempre grudado numa ESPÉCIE — é ela que a ficha separa.
 * `animal_id` só é preenchido quando o gasto foi de um animal só.
 *
 * NÃO cria lançamento no módulo Contas: é registro e relatório dentro de
 * Animais, como a despesa da obra (migration 067). A VENDA, essa sim, continua
 * indo para Contas.
 */
export interface AnimalDespesa {
  id: string;
  species: AnimalSpecies;
  /** Null = a despesa é do lote inteiro, não de um bicho. */
  animal_id: string | null;
  /** A data do gasto, não a da digitação. */
  expense_date: string;
  /** Ração, sal mineral, medicamento... texto livre; agrupa o relatório. */
  category: string | null;
  /** O PRODUTO comprado: "RAÇÃO ENGORDA", "SAL MINERAL", "VERMÍFUGO". */
  description: string;
  /**
   * A conta da compra (migration 092): quanto foi comprado, em que unidade, e
   * quanto custou cada uma. Os três são opcionais — frete e mão de obra não
   * têm quantidade. Vêm `undefined` enquanto a migration não roda.
   */
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  /** O TOTAL do gasto — é ele que a ficha soma, com ou sem a conta acima. */
  amount: number;
  /** De quem se comprou, quem prestou o serviço. */
  supplier: string | null;
  notes: string | null;
  /** De qual ciclo é o gasto (089). Em branco, vale para a espécie e só entra no geral. */
  lote_id?: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * VENDA DE LOTE (migration 088) — o peixe e a ave, que não têm brinco.
 *
 * A venda do módulo só sabia nascer de um bicho cadastrado, na baixa dele. Isso
 * serve boi e cavalo; não serve quem vende "320 kg de tilápia a R$ 18,00" ou
 * "200 frangos a R$ 22,00" sem nunca ter cadastrado bicho nenhum.
 *
 * O `sale_mode` decide quais campos valem: em `unidade`, quantity x
 * price_per_unit; em `peso`, weight_kg x price_per_kg. O total fica gravado em
 * `amount` — é o número que o dono conferiu no dia.
 *
 * Como a venda do animal, ela TAMBÉM vira lançamento no módulo Contas.
 */
export interface AnimalVenda {
  id: string;
  species: AnimalSpecies;
  sale_date: string;
  sale_mode: AnimalSaleMode;
  /** Quantas cabeças — só vale em `unidade`. */
  quantity: number;
  /** Preço de cada uma — só vale em `unidade`. */
  price_per_unit: number;
  /** Quantos quilos — só vale em `peso`. */
  weight_kg: number;
  /** Preço do quilo — só vale em `peso`. */
  price_per_kg: number;
  /** O total da venda, sempre gravado. */
  amount: number;
  /** O que saiu: "TILÁPIA", "FRANGO CAIPIRA". */
  description: string;
  buyer: string | null;
  notes: string | null;
  /** Lançamento gerado no módulo Contas — some junto se a venda for apagada. */
  transaction_id: string | null;
  /** De qual ciclo saiu (089). Em branco, vale para a espécie e só entra no geral. */
  lote_id?: string | null;
  created_by: string | null;
  created_at: string;
}

// ── Tanque, ciclo e movimento (migration 089) ────────────────────────────────
// Três peças, e só três: o TANQUE é o cadastro fixo (Tanque 01, 02, 03, 04); o
// CICLO é o povoamento daquele tanque, que fecha na despesca; o MOVIMENTO é o
// que mexe na quantidade. Serve galpão de aves pelo mesmo caminho — quem troca
// a palavra na tela é a espécie.

/** Tanque (piscicultura) ou galpão (aves): o lugar, que existe para sempre. */
export interface AnimalTanque {
  id: string;
  species: AnimalSpecies;
  name: string;
  /** Desativado some da hora de abrir ciclo, mas o histórico dele fica. */
  active: boolean;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export type AnimalLoteStatus = "aberto" | "fechado";

/** O povoamento de um tanque: começo, meio e fim. Um aberto por tanque. */
export interface AnimalLote {
  id: string;
  tanque_id: string;
  species: AnimalSpecies;
  /** Opcional, para nomear a safra: "TILÁPIA 2026/1". */
  name: string | null;
  start_date: string;
  status: AnimalLoteStatus;
  closed_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * O que mexe na quantidade do ciclo:
 *   entrada → povoou (+)
 *   morte   → morreu (−)
 *   ajuste  → recontagem; é o único que aceita negativo, e é ele que o
 *             fechamento usa para zerar a sobra
 */
export type AnimalLoteMovimentoKind = "entrada" | "morte" | "ajuste";

export const LOTE_MOVIMENTO_LABEL: Record<AnimalLoteMovimentoKind, string> = {
  entrada: "Entrada",
  morte: "Morte",
  ajuste: "Saída / correção",
};

export interface AnimalLoteMovimento {
  id: string;
  lote_id: string;
  kind: AnimalLoteMovimentoKind;
  moved_on: string;
  quantity: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * A conta do ciclo, pronta (view v_animal_lotes): quanto está vivo, quanto
 * morreu, e o bruto e o líquido daquele tanque.
 */
export interface AnimalLoteResumo {
  id: string;
  tanque_id: string;
  tanque_name: string;
  tanque_active: boolean;
  species: AnimalSpecies;
  name: string | null;
  start_date: string;
  status: AnimalLoteStatus;
  closed_at: string | null;
  notes: string | null;
  created_at: string;
  /** Quantidade */
  entradas: number;
  mortes: number;
  ajustes: number;
  /** Cabeças vendidas (a coluna quantity da venda). */
  vendidos: number;
  /** entradas − mortes ± ajustes − vendidos. */
  saldo: number;
  mortalidade_pct: number;
  /** Dinheiro */
  kg_vendidos: number;
  /** O que entrou de venda. */
  bruto: number;
  /** O que saiu de despesa amarrada ao ciclo. */
  custo: number;
  /** bruto − custo. */
  liquido: number;
  custo_por_cabeca: number;
  custo_por_kg: number;
}

/**
 * Uma linha da ficha (view v_animal_financeiro): a venda de um animal, uma
 * despesa lançada ou um tratamento que teve custo. `value` é sempre positivo —
 * quem diz se entra ou sai é o `kind`.
 */
export interface AnimalFinanceiroLinha {
  id: string;
  kind: "venda" | "despesa" | "tratamento";
  species: AnimalSpecies;
  animal_id: string | null;
  animal_tag: string | null;
  entry_date: string;
  description: string;
  value: number;
  category: string | null;
  /** Comprador na venda, fornecedor na despesa, remédio no tratamento. */
  person: string | null;
  /** Só a venda traz: como ela foi feita. */
  sale_mode: AnimalSaleMode | null;
  weight_kg: number;
  price_per_kg: number;
  /** Venda de lote por cabeça (migration 088): quantas e por quanto cada uma. */
  quantity: number;
  price_per_unit: number;
  notes: string | null;
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

// ═══════════════════════════════════════════════════════════════════════════
// ESTOQUE — material de consumo (cano, emenda, cola...)
// ═══════════════════════════════════════════════════════════════════════════
// Diferente do Patrimônio: aqui o material é consumível, sai e não volta.
// O saldo nunca é gravado — nasce da soma dos movimentos (view v_supply_stock).

export type SupplyMovementType = "entrada" | "saida" | "ajuste";
/** Status derivado do saldo: zerado > baixo (<= mínimo) > ok. */
export type SupplyStatus = "ok" | "baixo" | "zerado";

/** Agrupamento dos itens (hidráulica, elétrica...) — vira o filtro do topo. */
export interface SupplyCategory {
  id: string;
  name: string;
  created_by: string | null;
  created_at: string;
}

export interface SupplyItem {
  id: string;
  item_number: number;
  name: string;
  code: string | null;
  category_id: string | null;
  /** Unidade de medida (un, m, kg, L, pç, rolo, barra...). */
  unit: string;
  /** Avisa quando o saldo chega nesse ponto. 0 = sem aviso. */
  min_quantity: number;
  /** Prateleira / onde fica guardado. */
  location: string | null;
  /** Foto do item no bucket attachments (ajuda a reconhecer na prateleira). */
  photo_path: string | null;
  notes: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupplyMovement {
  id: string;
  item_id: string;
  type: SupplyMovementType;
  /** entrada/saída: sempre positivo. Ajuste: assinado (negativo reduz). */
  quantity: number;
  /** Quanto custou a unidade (entradas). */
  unit_cost: number | null;
  /** Quem pegou (saída) ou de quem veio (entrada). */
  person: string | null;
  /** Em que foi usado (texto livre). */
  destination: string | null;
  /** Obra do Estoque a que a saída foi atrelada (tabela supply_obras). */
  obra_id: string | null;
  /** Comprovante no bucket attachments (nota na entrada, quem levou na saída). */
  photo_path: string | null;
  movement_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * Local da obra — onde ela acontece (Fazenda 01, Fazenda 02, Sítio...). Cadastro
 * livre da migration 066: a mesma fazenda costuma ter várias obras (cerca, baia,
 * curral), e é o local que responde "quanto já gastei nesta fazenda".
 */
export interface SupplyLocal {
  id: string;
  name: string;
  notes: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

/**
 * Obra DO ESTOQUE — lista própria, para saber quanto de material cada obra
 * consumiu. É uma tabela à parte de public.obras: são cadastros diferentes, que
 * desde a migration 065 são cuidados na mesma tela — o módulo Obras.
 * O lançamento de material continua no Estoque.
 */
export interface SupplyObra {
  id: string;
  name: string;
  client: string | null;
  /** Onde a obra acontece — aponta para supply_locais (migration 066). */
  local_id?: string | null;
  /**
   * Quem toca a obra: o colaborador com quem o preço dela foi combinado
   * (migration 071). É a forma de pagamento DELE que decide como o fechamento
   * da obra é calculado.
   */
  responsavel_id?: string | null;
  notes: string | null;
  active: boolean;
  /** Preço por metro de cerca da obra inteira (migration 063). 0 = sem preço. */
  fence_rate?: number;
  created_by: string | null;
  created_at: string;
}

/**
 * Setor da obra — subcadastro do chefe (migration 057). É o "onde aplicou" do
 * técnico virado cadastro: em vez de cada um escrever do seu jeito, escolhe.
 */
export interface SupplyObraSector {
  id: string;
  obra_id: string;
  name: string;
  notes: string | null;
  active: boolean;
  /** Preço por metro de cerca SÓ deste setor (migration 063). 0 = usa o da obra. */
  fence_rate?: number;
  created_by: string | null;
  created_at: string;
}

/** Linha da view v_supply_obra_usage (obra + local + material + mão de obra). */
export interface SupplyObraUsage extends SupplyObra {
  /** Nome do local, já resolvido pela view (migration 066). */
  local_name?: string | null;

  // ── O responsável pela obra, já resolvido pela view (migration 071) ──
  responsavel_name?: string | null;
  responsavel_profession?: string | null;
  /** Como ele é pago, do cadastro dele — é o que decide o fechamento. */
  responsavel_payment_mode?: PaymentMode | null;
  responsavel_daily_rate?: number | null;
  responsavel_meter_rate?: number | null;
  responsavel_job_rate?: number | null;
  /** Diárias DELE já lançadas nesta obra — o valor de quem é pago por dia. */
  responsavel_days_count?: number;
  responsavel_days_value?: number;
  /** O fechamento da obra já lançado com ele. 0 = ainda não fechado. */
  contract_value?: number;

  /** Quantos materiais diferentes saíram para esta obra. */
  items_count: number;
  movements_count: number;
  /** Soma das saídas × custo médio do item. */
  total_value: number;
  last_usage_at: string | null;

  /** Mão de obra — as diárias lançadas nesta obra (migration 066). */
  days_count?: number;
  /** Quantos diaristas diferentes trabalharam nela. */
  workers_count?: number;
  /** Soma das diárias; na meia diária o valor já vem pela metade. */
  labor_value?: number;
  last_work_date?: string | null;

  /** Despesa avulsa — compra direta, frete, serviço (migration 067). */
  expenses_count?: number;
  expense_value?: number;
  last_expense_date?: string | null;

  /** Serviço contratado por empreita ou por metro (migration 069). */
  services_count?: number;
  /** Soma do que se paga aos profissionais pelos serviços da obra. */
  service_value?: number;
  last_service_date?: string | null;

  /** O que a obra custou: material + diárias + despesas + serviços. */
  total_cost?: number;
}

/**
 * Despesa avulsa da obra (migration 067) — o gasto que não passa pelo Estoque
 * nem pela diária: compra direta, combustível, frete, serviço de terceiro.
 *
 * NÃO conversa com o módulo Contas: é registro e relatório dentro de Obras.
 */
export interface SupplyObraDespesa {
  id: string;
  obra_id: string;
  /** A data do gasto, não a da digitação. */
  expense_date: string;
  /** Combustível, serviço de terceiro... texto livre; agrupa o relatório. */
  category: string | null;
  description: string;
  amount: number;
  /** De quem comprou, quem fez o serviço, quem recebeu. */
  person: string | null;
  /** Comprovante no bucket attachments. */
  photo_path: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVIÇO CONTRATADO NO SETOR DA OBRA (migration 069)
// ═══════════════════════════════════════════════════════════════════════════
// O setor deixou de ser só um nome: agora ele diz QUAL serviço foi feito ali e
// COMO o profissional foi contratado. Das duas formas sai o mesmo número — o
// valor a pagar —, que entra no custo da obra e na conta do colaborador.

/** Como o profissional foi contratado para o serviço. */
export type ContractMode = "empreita" | "metro";

export const CONTRACT_MODE_LABEL: Record<ContractMode, string> = {
  empreita: "Empreita",
  metro: "Por metro",
};

/** Tipos de serviço sugeridos na tela — o campo continua livre. */
export const SERVICOS_SUGERIDOS = [
  "CERCA",
  "ALVENARIA",
  "PINTURA",
  "CONCRETAGEM",
  "TELHADO",
  "ELÉTRICA",
  "HIDRÁULICA",
  "TERRAPLANAGEM",
  "LIMPEZA DE ÁREA",
] as const;

/** Unidades do serviço por metro — o rótulo do que foi medido. */
export const UNIDADES_SERVICO = ["M", "M2", "M3", "UN"] as const;

/**
 * Um serviço combinado com um profissional, dentro de um setor da obra.
 *
 * `total_value` é CALCULADO PELO BANCO (coluna gerada da migration 069): na
 * empreita é o valor fechado; no metro é `rate_per_unit × quantity`. Nenhuma
 * tela refaz essa conta — todas leem o mesmo número.
 */
export interface SupplyObraServico {
  id: string;
  obra_id: string;
  /** Setor onde o serviço foi feito (null = a obra não tem setor cadastrado). */
  sector_id: string | null;
  /** CERCA, ALVENARIA, PINTURA... texto livre, em caixa alta. */
  service_type: string;
  /** Quem fez — aponta para o cadastro de colaboradores. Null = ainda sem dono. */
  diarista_id: string | null;
  contract_mode: ContractMode;
  /** Valor fechado da empreita (vale quando contract_mode = "empreita"). */
  contract_amount: number;
  /** Valor do metro (vale quando contract_mode = "metro"). */
  rate_per_unit: number;
  /** Metragem ou quantidade (vale quando contract_mode = "metro"). */
  quantity: number;
  /** Rótulo do que foi medido: M, M2, M3, UN. */
  unit: string;
  service_date: string;
  description: string | null;
  notes: string | null;
  /**
   * É o FECHAMENTO DA OBRA com o responsável, e não um serviço de setor
   * (migration 071). Uma obra tem no máximo um — garantido por índice único.
   */
  is_obra_contract?: boolean;
  /** O valor a pagar ao profissional, já resolvido pelo banco. */
  total_value: number;
  /** Em qual acerto este serviço foi pago (068). Nulo = ainda se deve. */
  acerto_id: string | null;
  created_by: string | null;
  created_at: string;
}

/** Linha da view v_supply_obra_servicos — o serviço com os nomes resolvidos. */
export interface SupplyObraServicoView extends SupplyObraServico {
  obra_name: string;
  local_id: string | null;
  sector_name: string | null;
  /** Nome do profissional (null quando o serviço ainda não tem dono). */
  worker_name: string | null;
  worker_type: WorkerType | null;
  worker_profession: string | null;
  worker_pix_key: string | null;
  /** Como ele costuma ser pago, do cadastro dele (migration 070). */
  worker_payment_mode?: PaymentMode | null;
}

/**
 * Uma linha do extrato da obra (view v_supply_obra_extrato, migration 066) —
 * quando foi, com o que foi, quanto custou e quem usou. Junta as saídas de
 * material do Estoque com as diárias, na mesma forma.
 */
export interface SupplyObraExtrato {
  id: string;
  obra_id: string;
  /** As quatro origens de gasto da obra ("servico" veio na migration 069). */
  kind: "material" | "diaria" | "despesa" | "servico";
  /** A data do fato (saída / dia trabalhado / compra), não a da digitação. */
  entry_date: string;
  /** Nome do material, "Diária" / "Meia diária", ou o que foi comprado. */
  description: string;
  unit: string | null;
  quantity: number;
  value: number;
  /** Quem pegou o material, quem trabalhou o dia, de quem se comprou. */
  person: string | null;
  /** Destino do material / o que a pessoa fez no dia. */
  detail: string | null;
  /** Só a despesa tem categoria — é o que agrupa o relatório (067). */
  category: string | null;
  notes: string | null;
  /** Comprovante, quando existe (saída de material e despesa). */
  photo_path: string | null;
  created_at: string;
}

/** Linha da view v_supply_stock (item + saldo, custo médio, valor e status). */
export interface SupplyItemWithStock extends SupplyItem {
  category_name: string | null;
  /** Saldo atual = entradas − saídas ± ajustes. */
  current_quantity: number;
  total_in: number;
  total_out: number;
  /** Custo médio das entradas com custo informado (null quando não há). */
  avg_unit_cost: number | null;
  /** Saldo × custo médio. */
  stock_value: number;
  last_movement_at: string | null;
  status: SupplyStatus;
}

/**
 * Material que o técnico avisou que usou (migration 052). NÃO mexe no saldo:
 * é só o recado. O chefe confere na aba "Pendentes" do Estoque e dá baixa —
 * é aí que nasce a saída de verdade em supply_movements.
 */
export interface SupplyRequest {
  id: string;
  /** Item escolhido da lista (null quando o técnico digitou o nome). */
  item_id: string | null;
  /** Material escrito na mão, quando não estava na lista. */
  item_text: string | null;
  quantity: number;
  /**
   * Preço de UMA unidade, quando quem levou informou (migration 082). Nulo é o
   * normal: material da casa não tem preço de compra pra contar.
   */
  unit_cost?: number | null;
  /** Obra escolhida da lista (null quando só disse onde aplicou). */
  obra_id: string | null;
  /** Setor da obra onde aplicou, do cadastro do chefe (migration 057). */
  sector_id?: string | null;
  /** Onde aplicou, texto livre ("poste da esquina") — quando não achou o setor. */
  destination: string | null;
  /** Máquina usada no serviço (migration 057). */
  machine_id?: string | null;
  /** Horímetro no COMEÇO do serviço — nulo quando o técnico não anotou. */
  machine_hourmeter?: number | null;
  /** Horímetro no FIM do serviço (migration 058). */
  machine_hourmeter_end?: number | null;
  /** Km no COMEÇO do serviço — nulo quando o técnico não anotou. */
  machine_km?: number | null;
  /** Km no FIM do serviço (migration 058). */
  machine_km_end?: number | null;
  /** Combustível abastecido; null = não abasteceu. */
  fuel_type?: string | null;
  used_date: string;
  notes: string | null;
  photo_path: string | null;
  /** Nome de quem enviou, gravado no envio. */
  sent_by_name: string | null;
  created_by: string | null;
  created_at: string;
}

/** Solicitação + nome do item e da obra (join da consulta da página). */
export interface SupplyRequestRow extends SupplyRequest {
  supply_items: { name: string; unit: string } | null;
  supply_obras: { name: string } | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// CERCA — metro feito por setor (migration 063)
// ═══════════════════════════════════════════════════════════════════════════
// A obra da cerca não se mede em material, se mede em METRO FEITO. O técnico
// lança só o metro (a tela dele não tem dinheiro nenhum); o preço por metro é
// cadastrado pelo chefe na obra e, quando o setor for diferente, no setor.

/** Um trecho de cerca feito num dia. */
export interface SupplyFenceRun {
  id: string;
  obra_id: string;
  /** Setor onde andou a cerca (null = a obra não tem setor cadastrado). */
  sector_id: string | null;
  work_date: string;
  meters: number;
  /** O que foi feito no trecho. */
  description: string | null;
  photo_path: string | null;
  /**
   * Preço travado deste trecho pelo chefe. NULO = vale o preço do setor (e,
   * sem ele, o da obra). Zero é um preço de verdade: trecho que não paga.
   */
  rate_per_meter: number | null;
  /** Nome de quem lançou, gravado no lançamento. */
  registered_by_name: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * Linha da view v_supply_fence_runs — o lançamento com o preço já resolvido.
 * É o que a tela do CHEFE lê; a do técnico lê a tabela crua, sem valor.
 */
export interface SupplyFenceRunView extends SupplyFenceRun {
  obra_name: string;
  sector_name: string | null;
  /** Preço por metro que valeu (trecho → setor → obra). */
  effective_rate: number;
  /** metros × preço. */
  total_value: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// DIARISTAS — quem vem por dia (migration 059)
// ═══════════════════════════════════════════════════════════════════════════
// O cadastro é do chefe (nome, PIX, valor da diária). O calendário é do
// técnico: ele marca os dias que cada um veio e escreve o que foi feito. O dia
// aponta para a obra do Estoque — é o mesmo lugar onde o material foi gasto.

/**
 * Como o colaborador ganha (migration 069). O DIARISTA ganha por dia marcado
 * no calendário; o EMPREITEIRO ganha por serviço fechado no setor da obra; o
 * CLT ganha um salário por mês, com adiantamento no meio e o saldo no fim (098).
 * Quem já estava cadastrado antes da 069 é diarista — era o único tipo.
 */
export type WorkerType = "diarista" | "empreiteiro" | "clt";

export const WORKER_TYPE_LABEL: Record<WorkerType, string> = {
  diarista: "Diarista",
  empreiteiro: "Empreiteiro",
  clt: "CLT",
};

/**
 * Como o colaborador é pago (migration 070). É o preço combinado UMA VEZ, no
 * cadastro — o lançamento do serviço já vem com ele preenchido, para ninguém
 * ter que lembrar de cabeça quanto foi acertado com cada um.
 *
 *   diaria → por dia trabalhado, marcado no calendário
 *   metro  → por metro feito (o valor sai de metro × preço)
 *   obra   → valor fechado da obra, a empreita
 */
export type PaymentMode = "diaria" | "metro" | "obra";

export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  diaria: "Na diária",
  metro: "No metro",
  obra: "No valor da obra",
};

/** O rótulo do preço unitário de cada forma de pagamento. */
export const PAYMENT_MODE_RATE_LABEL: Record<PaymentMode, string> = {
  diaria: "Valor da diária",
  metro: "Valor do metro",
  obra: "Valor da obra",
};

/** Profissões que aparecem como sugestão no cadastro — o campo é livre. */
export const PROFISSOES_SUGERIDAS = [
  "PEDREIRO",
  "SERVENTE",
  "PINTOR",
  "CARPINTEIRO",
  "ELETRICISTA",
  "ENCANADOR",
  "SOLDADOR",
  "CERQUEIRO",
  "OPERADOR",
  "MOTORISTA",
] as const;

/** Cadastro do colaborador — só o chefe mexe aqui. */
export interface Diarista {
  id: string;
  name: string;
  phone: string | null;
  /** Chave PIX para pagar (CPF, celular, e-mail ou aleatória — texto livre). */
  pix_key: string | null;
  /** Quanto vale um dia de trabalho. 0 = ainda não combinado. */
  daily_rate: number;
  /** Diarista ou empreiteiro (migration 069). Sem a migration vem indefinido. */
  worker_type?: WorkerType;
  /** Pedreiro, pintor, carpinteiro... texto livre (migration 069). */
  profession?: string | null;
  /**
   * Como ele costuma ser pago (migration 070). É o que a tela do serviço traz
   * preenchido; os três preços abaixo convivem, porque o mesmo pedreiro pode
   * ter metro combinado E vir um dia avulso na diária.
   */
  payment_mode?: PaymentMode;
  /** Preço combinado do metro. 0 = não combinado (migration 070). */
  meter_rate?: number;
  /** Preço combinado da obra inteira, a empreita. 0 = não combinado (070). */
  job_rate?: number;
  /** Salário do mês — só do CLT. 0 = não informado (migration 098). */
  monthly_salary?: number;
  notes: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

/** Linha da view v_diaristas (cadastro + quanto ele já trabalhou). */
export interface DiaristaResumo extends Diarista {
  days_count: number;
  /** Quantos desses dias foram meia diária (migration 064). */
  half_days_count?: number;
  /** Só as diárias, com o valor congelado de cada dia (migration 069). */
  days_value?: number;
  /**
   * O que ele já rendeu no total: diárias + serviços por empreita/metro.
   * Antes da migration 069 este número era só o das diárias.
   */
  total_value: number;
  last_work_date: string | null;

  // ── Serviços por empreita / por metro (migration 069) ──
  services_count?: number;
  /** Soma dos serviços feitos por ele, das duas formas de contratação. */
  services_value?: number;
  last_service_date?: string | null;

  // ── O que ainda se deve a ele (migration 068) ──
  /** Dias trabalhados que ainda não entraram num acerto. */
  pending_days?: number;
  /** Só a parte das diárias do valor a receber (migration 069). */
  pending_days_value?: number;
  /** Serviços que ainda não entraram num acerto (migration 069). */
  pending_services?: number;
  /** Só a parte dos serviços do valor a receber (migration 069). */
  pending_services_value?: number;
  /** VALOR A RECEBER: diárias em aberto + serviços em aberto. */
  pending_value?: number;
  /** VALOR ADIANTADO: vales já pegos e ainda não descontados. */
  advance_pending?: number;
  /**
   * SALDO A RECEBER: a receber − adiantado. Fica NEGATIVO quando ele pegou
   * mais adiantado do que trabalhou — aí é ele que está devendo.
   */
  balance?: number;
  last_settled_on?: string | null;

  // ── Salário do CLT (migration 098) ──
  /**
   * O salário do próximo mês a fechar: um salário para o CLT ativo, 0 para os
   * outros. Já está somado em `pending_value` e em `balance`.
   */
  salary_pending?: number;
  /** Último mês de salário pago (primeiro dia do mês, YYYY-MM-01). */
  last_reference_month?: string | null;
}

/**
 * Quem cuida de quem (migration 099): o colaborador liberado para um
 * encarregado de obra. Só quem está aqui aparece na tela dele.
 */
export interface DiaristaTecnico {
  diarista_id: string;
  tecnico_id: string;
}

/** O encarregado de obra (papel `tecnico`) do jeito que o chefe escolhe na lista. */
export interface EncarregadoDeObra {
  id: string;
  full_name: string | null;
  email: string;
}

/**
 * Vale do diarista (migration 068) — dinheiro pego no meio da semana, que sai
 * do valor a receber no próximo acerto. `acerto_id` nulo = ainda em aberto.
 */
export interface DiaristaAdiantamento {
  id: string;
  diarista_id: string;
  advance_date: string;
  amount: number;
  notes: string | null;
  acerto_id: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * Acerto do diarista (migration 068) — o pagamento da semana. Os valores ficam
 * congelados: corrigir uma diária antiga não reescreve o que já foi pago.
 */
export interface DiaristaAcerto {
  id: string;
  diarista_id: string;
  settled_on: string;
  /** Quanto era de diária no momento do acerto. */
  days_total: number;
  /** Quanto já tinha sido adiantado e foi descontado. */
  advance_total: number;
  /** O que saiu de dinheiro na hora (days_total − advance_total). */
  amount_paid: number;
  /**
   * CLT: de qual mês é o salário pago, sempre no dia 1 (YYYY-MM-01). Nulo nos
   * acertos de diária e serviço (migration 098).
   */
  reference_month?: string | null;
  /** CLT: o salário do mês, congelado no pagamento. Já está dentro de days_total. */
  salary_total?: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * Um dia trabalhado. `daily_rate` é o valor COPIADO do cadastro no momento do
 * lançamento: reajuste de diária não muda o que já passou.
 */
export interface DiaristaDia {
  id: string;
  diarista_id: string;
  work_date: string;
  /** O que ele fez no dia. */
  description: string | null;
  obra_id: string | null;
  sector_id: string | null;
  /**
   * O que se paga NESTE dia. Na meia diária o valor já está pela metade — ver
   * a migration 064: nenhuma soma do app divide nada, o valor já vem certo.
   */
  daily_rate: number;
  /** Veio só meia diária (migration 064): pinta o dia de amarelo. */
  half_day?: boolean;
  /**
   * Em qual acerto este dia foi pago (migration 068). Nulo = ainda se deve, e
   * é o que mantém o dia verde/amarelo no calendário; preenchido pinta cinza.
   */
  acerto_id?: string | null;
  /** Nome de quem marcou o dia, gravado no lançamento. */
  registered_by_name: string | null;
  created_by: string | null;
  created_at: string;
}

/** Dia + nome do diarista e da obra (join das consultas das telas). */
export interface DiaristaDiaRow extends DiaristaDia {
  diaristas: { name: string; pix_key: string | null } | null;
  supply_obras: { name: string } | null;
}

// ── Frota (máquinas e veículos) ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
// A OS é do CLIENTE; a ficha é do VEÍCULO. Aqui ficam os dois lados da conta de
// cada máquina: o que ela rendeu (diária, hora, viagem, km ou valor fechado,
// sempre com o contratante) e o que ela custou (diesel, manutenção, peça,
// motorista). Ver a migration 073.

/** Como o serviço da máquina foi cobrado. */
export type MachineServicoKind = "diaria" | "hora" | "viagem" | "km" | "servico";

/**
 * A OS da ficha está em andamento ou já acabou. É o que pinta o calendário do
 * veículo: dia com OS aberta fica verde. Não confundir com `paid`, que responde
 * outra pergunta — o serviço acabou não quer dizer que o dinheiro entrou.
 */
export type MachineServicoStatus = "aberta" | "concluida";

/**
 * As formas de cobrança, na ordem em que aparecem na tela. `unit` é o que se
 * conta (dias, horas, viagens, km) e vira o rótulo do campo de quantidade.
 */
export const MACHINE_SERVICO_KINDS: {
  value: MachineServicoKind;
  label: string;
  /** Singular/plural do que se conta — "3 viagens", "1 dia". */
  unit: string;
  unitPlural: string;
  /** Rótulo do valor unitário. */
  priceLabel: string;
}[] = [
  { value: "diaria",  label: "Diária",  unit: "dia",    unitPlural: "dias",    priceLabel: "Valor da diária" },
  { value: "viagem",  label: "Viagem",  unit: "viagem", unitPlural: "viagens", priceLabel: "Valor da viagem" },
  { value: "hora",    label: "Hora",    unit: "hora",   unitPlural: "horas",   priceLabel: "Valor da hora" },
  { value: "km",      label: "Km",      unit: "km",     unitPlural: "km",      priceLabel: "Valor do km" },
  { value: "servico", label: "Fechado", unit: "serviço", unitPlural: "serviços", priceLabel: "Valor combinado" },
];

/** Categorias sugeridas na despesa do veículo — o campo continua livre. */
export const DESPESAS_MAQUINA_SUGERIDAS = [
  "COMBUSTÍVEL",
  "MANUTENÇÃO",
  "PEÇA",
  "PNEU",
  "ÓLEO E FILTRO",
  "MOTORISTA",
  "IMPOSTO",
  "SEGURO",
  "LAVAGEM",
  "MULTA",
] as const;

/**
 * Um serviço da máquina: a diária, a hora, a viagem, o km ou o valor fechado.
 * `total` é coluna gerada no banco (quantity x unit_price) — não se manda.
 *
 * NÃO cria lançamento no módulo Contas: é registro e relatório dentro da Frota,
 * como a despesa da obra (067) e a dos animais (072).
 */
export interface MachineServico {
  id: string;
  machine_id: string;
  service_date: string;
  kind: MachineServicoKind;
  /** Pra quem foi o serviço — texto livre, como o cliente da OS. */
  contratante: string | null;
  description: string | null;
  origin: string | null;
  destination: string | null;
  quantity: number;
  unit_price: number;
  total: number;
  /** Motorista/operador que estava na máquina. */
  operator: string | null;
  /** Serviço da própria firma: trabalho feito, mas sem dinheiro entrando. */
  internal: boolean;
  /** Aberta = ainda em andamento (verde no calendário). */
  status: MachineServicoStatus;
  /** Já recebeu? É o que responde "quem ainda me deve". */
  paid: boolean;
  /** Operador para quem a OS foi enviada — ela aparece no painel dele. */
  assigned_to?: string | null;
  /** Quando o operador tocou em INICIAR / FINALIZAR no painel. */
  started_at?: string | null;
  finished_at?: string | null;
  /** Quem fechou a OS no painel do operador. */
  finalized_by?: string | null;
  /** O que o operador escreveu que fez, ao finalizar. */
  completion_notes?: string | null;
  /**
   * As leituras que o operador anota no celular (migration 094). Máquina anota
   * horímetro; caminhão e caçamba anotam km. Horas trabalhadas = fim − início.
   */
  hourmeter_start?: number | null;
  hourmeter_end?: number | null;
  km_start?: number | null;
  km_end?: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * Uma parada da OS da máquina (migration 094) — o fim do expediente de um
 * serviço que atravessa dias. Pausa em aberto = resume_time vazio.
 */
export interface MachineServicoPausa {
  id: string;
  machine_servico_id: string;
  pause_number: number;
  pause_date: string | null;
  pause_time: string | null;
  /** Horímetro ou km no momento da parada. */
  pause_reading: number | null;
  pause_notes: string | null;
  latitude: number | null;
  longitude: number | null;
  location_accuracy: number | null;
  resume_date: string | null;
  resume_time: string | null;
  resume_reading: number | null;
  created_at: string;
}

/** A OS da ficha como o painel do operador precisa dela: com o veículo junto. */
// ── OS em aberto (relatório por usuário) ────────────────────────────────────
//
// O relatório de OS em aberto junta as DUAS famílias de OS que existem no
// sistema: a de serviço (service_orders, do módulo Operações) e a da ficha do
// veículo (machine_servicos, do módulo Máquinas e Veículos). Cada uma carrega
// só o que o relatório precisa — a lista é de SEMPRE, não de um mês, e puxar a
// linha inteira de cada tabela sairia caro à toa.

/** Uma OS de serviço que ainda não fechou (pendente ou em andamento). */
export interface OsAbertaDeServico {
  id: string;
  order_number: number;
  type: ServiceOrderType;
  status: ServiceOrderStatus;
  /** Para quem a OS foi enviada — é por ele que o relatório agrupa. */
  assigned_to: string | null;
  /** Que máquina fez o serviço — o outro jeito de agrupar o relatório. */
  machine_id: string | null;
  issue_date: string;
  client_name: string | null;
  service_description: string | null;
  total_amount: number | null;
  machines: { name: string; plate: string | null } | null;
}

/**
 * Uma OS da ficha do veículo, como o relatório precisa dela.
 *
 * Aqui não há "em andamento": o status só diz aberta ou concluída, e quem
 * responde se ela já COMEÇOU é o `started_at`, gravado quando o operador toca
 * em INICIAR no painel dele.
 */
export interface OsDeMaquinaResumo {
  id: string;
  machine_id: string;
  service_date: string;
  kind: MachineServicoKind;
  status: MachineServicoStatus;
  contratante: string | null;
  description: string | null;
  total: number;
  assigned_to: string | null;
  started_at: string | null;
  machines: { name: string; plate: string | null } | null;
}

/**
 * O HISTÓRICO DE UMA OS DE OPERAÇÕES, do jeito que a ficha do veículo mostra.
 *
 * É o que o dono pede olhando a máquina: quantas horas ela trabalhou, quantos
 * km rodou, quantas viagens fez e o que levou em cada uma. Nada disso está na
 * linha da ficha — mora na OS e nas tabelas filhas dela, e por isso vem sob
 * demanda, só quando alguém abre o histórico daquela linha.
 */
export interface HistoricoDaOs {
  order: ServiceOrder;
  /** Cada viagem, com hora de saída, chegada e quem recebeu. */
  trips: ServiceOrderTrip[];
  /** O que foi carregado — o material sai daqui. */
  items: (ServiceOrderItem & { products: { name: string } | null })[];
  /** As paradas do dia, com a leitura do horímetro/hodômetro. */
  pauses: ServiceOrderPause[];
}

/**
 * Uma OS da ficha do veículo, com o mínimo que o relatório da Frota precisa.
 *
 * O relatório é de SEMPRE — traz toda OS de toda máquina —, então a linha
 * inteira sairia cara à toa numa tela que já carrega a ficha do mês.
 */
export interface OsDaFichaNoRelatorio {
  id: string;
  machine_id: string;
  service_date: string;
  status: MachineServicoStatus;
  started_at: string | null;
  total: number;
}

/**
 * A OS do módulo Operações que usou uma MÁQUINA.
 *
 * Ela não mora na ficha do veículo — mora em service_orders —, mas para quem
 * olha a frota é OS da máquina do mesmo jeito. O relatório da Frota conta as
 * duas juntas; a ficha continua mostrando esta como "Vindas de Operações".
 */
export interface OsDeOperacoesNaMaquina {
  id: string;
  machine_id: string;
  status: ServiceOrderStatus;
  issue_date: string;
  delivery_date: string | null;
  total_amount: number | null;
}

export interface MachineServicoDoOperador extends MachineServico {
  machines: { name: string; plate: string | null; tracking_type: string | null } | null;
  /** As paradas desta OS — vêm à parte, e vazias antes da migration 094. */
  pausas?: MachineServicoPausa[];
}

/** Gasto de uma máquina/veículo. Litros e marcação só no abastecimento. */
export interface MachineDespesa {
  id: string;
  machine_id: string;
  expense_date: string;
  category: string | null;
  description: string;
  amount: number;
  supplier: string | null;
  /** Litros abastecidos — com a marcação, dá a média. */
  liters: number | null;
  /** Hodômetro (km) ou horímetro (horas) na hora do gasto. */
  odometer: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * Uma linha da ficha do veículo (view v_machine_ficha), venha ela de um
 * lançamento da Frota ou de uma OS do módulo Operações.
 */
export interface MachineFichaLinha {
  id: string;
  machine_id: string;
  /** De onde a linha veio — a OS é só leitura aqui. */
  kind: "servico" | "despesa" | "os" | "os_custo";
  /** Entrou ou saiu. O valor é sempre positivo. */
  flow: "receita" | "despesa";
  /** Trabalho da própria firma: não conta como dinheiro entrando. */
  internal: boolean;
  entry_date: string;
  description: string;
  /** Só o serviço da Frota tem: diaria, viagem, hora, km, servico. */
  servico_kind: MachineServicoKind | null;
  category: string | null;
  /** Contratante (receita) ou fornecedor (despesa). */
  person: string | null;
  quantity: number;
  unit_price: number;
  value: number;
  origin: string | null;
  destination: string | null;
  operator: string | null;
  /** Nulo na OS: lá o recebimento mora em Contas. */
  paid: boolean | null;
  /** Só a OS da ficha tem: aberta ou concluida. Nas outras linhas vem nulo. */
  status: MachineServicoStatus | null;
  liters: number | null;
  odometer: number | null;
  /** Nº da OS, quando a linha veio de Operações. */
  order_number: number | null;
  notes: string | null;
  created_at: string;
}

/** Máquina com a conta fechada de sempre (view v_machine_resumo). */
export interface MachineResumo extends Machine {
  receitas: number;
  despesas: number;
  resultado: number;
  /** O que a máquina rodou para a própria firma, sem cobrança. */
  internos: number;
  a_receber: number;
  servicos: number;
  /** OS da ficha ainda não concluídas — o que o veículo tem em aberto. */
  abertas: number;
  ultimo_movimento: string | null;
}

// ── Frota: a troca de diárias com o parceiro ────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════
// Um acerto que não é dinheiro: as máquinas se revezam. Quando tem serviço
// aqui, a caçamba dele vem; quando não tem, a nossa vai. Paga-se em DIÁRIA —
// um dia de máquina dele se paga com um dia de máquina nossa. Ver migration 076.

/** Com quem a frota troca diárias de máquina. */
export interface MachineParceiro {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

/**
 * Um dia de troca, por tipo de máquina. Uma linha por parceiro + dia + tipo:
 * lançar o mesmo dia de novo CORRIGE o que estava lá, não soma escondido.
 */
export interface MachineTroca {
  id: string;
  parceiro_id: string;
  entry_date: string;
  /** cacamba, caminhao, trator... as mesmas categorias do cadastro de veículos. */
  category: string;
  /** Quantas máquinas DELE trabalharam para nós no dia (0,5 = meio dia). */
  recebidas: number;
  /** Quantas máquinas NOSSAS trabalharam para ele no dia. */
  cedidas: number;
  /** Quais máquinas DELE vieram — placas do momento do lançamento. */
  veiculos_dele?: string | null;
  /** Quais máquinas NOSSAS foram. */
  veiculos_meus?: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * O confronto por parceiro e tipo de máquina (view v_machine_parceiro_saldo).
 * `saldo` = cedidas − recebidas: negativo é diária que NÓS devemos; positivo é
 * diária que ELE deve.
 */
export interface MachineParceiroSaldo {
  parceiro_id: string;
  category: string;
  recebidas: number;
  cedidas: number;
  saldo: number;
  dias: number;
  ultimo_dia: string | null;
}

/**
 * Um veículo do parceiro (migration 077). A placa é o que identifica na
 * conversa; o apelido serve para quem chama de "caçamba vermelha".
 */
export interface MachineParceiroVeiculo {
  id: string;
  parceiro_id: string;
  plate: string | null;
  name: string | null;
  category: string;
  notes: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

/** Como o veículo do parceiro aparece na tela: placa, ou o apelido se não tem. */
export function parceiroVeiculoLabel(v: {
  plate?: string | null;
  name?: string | null;
}): string {
  return (v.plate?.trim() || v.name?.trim() || "").toUpperCase();
}

// ── Aluguéis (imóveis, contratos e o aluguel de cada mês) ───────────────────
// ═══════════════════════════════════════════════════════════════════════════
// O imóvel tem um CÓDIGO na ordem de cadastro; o contrato diz quem é o
// inquilino, quanto e em que dia vence; e a cobrança de cada mês nasce dessa
// conta — o que se grava é a BAIXA. Ver a migration 078.

/** Tipo do imóvel (controlado pela tela; a coluna é texto livre). */
export const RENTAL_KINDS: { value: string; label: string }[] = [
  { value: "casa",        label: "Casa" },
  { value: "apartamento", label: "Apartamento" },
  { value: "ponto",       label: "Ponto comercial" },
  { value: "sala",        label: "Sala" },
  { value: "galpao",      label: "Galpão" },
  { value: "terreno",     label: "Terreno" },
  { value: "outro",       label: "Outro" },
];

export function rentalKindLabel(kind?: string | null): string {
  return RENTAL_KINDS.find((k) => k.value === kind)?.label ?? "Imóvel";
}

/** Formas de pagamento sugeridas na baixa do aluguel. */
export const RENTAL_METHODS = [
  "PIX",
  "DINHEIRO",
  "TRANSFERÊNCIA",
  "BOLETO",
  "DEPÓSITO",
  "CHEQUE",
] as const;

/** O imóvel. `code` é dado pelo banco, na ordem de cadastro. */
export interface RentalProperty {
  id: string;
  code: number;
  name: string | null;
  kind: string;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  registration: string | null;
  iptu_code: string | null;
  water_code: string | null;
  power_code: string | null;
  notes: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
}

export type RentalContractStatus = "ativo" | "encerrado";

/** O contrato de locação — é dele que sai a cobrança do mês e a impressão. */
export interface RentalContract {
  id: string;
  property_id: string;

  tenant_name: string;
  tenant_document: string | null;
  tenant_rg: string | null;
  tenant_birthplace: string | null;
  tenant_nationality: string | null;
  tenant_marital_status: string | null;
  tenant_profession: string | null;
  tenant_phone: string | null;
  tenant_email: string | null;
  tenant_address: string | null;

  guarantor_name: string | null;
  guarantor_document: string | null;
  guarantor_rg: string | null;
  guarantor_phone: string | null;
  guarantor_address: string | null;

  monthly_amount: number;
  /** Dia do mês em que vence. Num mês curto, cai no último dia. */
  due_day: number;
  deposit_amount: number;
  late_fee_percent: number | null;
  interest_percent: number | null;
  readjust_index: string | null;

  start_date: string;
  end_date: string | null;
  months: number | null;

  purpose: string | null;
  signed_at: string | null;
  forum_city: string | null;

  status: RentalContractStatus;
  notes: string | null;

  created_by: string | null;
  created_at: string;
}

/** O contrato com o imóvel junto e o resumo do que já foi recebido (view). */
export interface RentalContractView extends RentalContract {
  property_code: number;
  property_name: string | null;
  property_kind: string;
  property_street: string | null;
  property_number: string | null;
  property_complement: string | null;
  property_district: string | null;
  property_city: string | null;
  property_state: string | null;
  property_zip: string | null;
  property_registration: string | null;
  property_iptu_code: string | null;
  property_water_code: string | null;
  property_power_code: string | null;
  property_active: boolean;
  meses_pagos: number;
  total_recebido: number;
  ultimo_pagamento: string | null;
}

/** A baixa do aluguel de um mês. Só existe quando há o que registrar. */
export interface RentalPayment {
  id: string;
  contract_id: string;
  /** O mês de referência, sempre no dia 1. */
  competencia: string;
  due_date: string;
  amount: number;
  paid_at: string | null;
  paid_amount: number;
  method: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/** O modelo do contrato, com os campos {{ASSIM}} trocados na impressão. */
export interface RentalContractTemplate {
  id: string;
  name: string;
  body: string;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// ALUGUEL DE IMPRESSORAS (migration 096)
// ─────────────────────────────────────────────────────────────────────────────

export type PrinterContractStatus = "ativo" | "encerrado";

/** O contrato: o cliente, a franquia de páginas e o preço da página. */
export interface PrinterContract {
  id: string;
  client_name: string;
  client_document: string | null;
  contract_number: string | null;
  /** Quem cobra — sai no cabeçalho do relatório impresso. */
  issuer_name: string | null;
  /** Páginas que o contrato já cobre: saem do total da fatura. */
  franchise_pages: number;
  /** Preço da página para toda impressora que não tem o seu. */
  page_price: number;
  due_day: number;
  start_date: string;
  status: PrinterContractStatus;
  notes: string | null;
  /** Data da leitura dos contadores de instalação — a anterior do 1º mês (097). */
  initial_reading_date?: string | null;
  /** O rodapé do relatório: "SÃO MATEUS DO MARANHÃO, 25 de agosto de 2026". */
  issuer_city?: string | null;
  /** Quem assina o relatório enviado ao cliente. */
  signer_name?: string | null;
  signer_document?: string | null;
  signer_phone?: string | null;
  created_at: string;
}

/** Tudo que o relatório de uma fatura precisa, numa viagem só. */
export interface DadosDoRelatorioImpressoes {
  billing: PrinterBilling;
  contract: PrinterContract;
  readings: PrinterReading[];
  printers: Printer[];
}

/** Uma impressora alugada. */
export interface Printer {
  id: string;
  contract_id: string;
  /** UNID — o número da impressora no contrato. */
  unit: number;
  serial_number: string;
  model: string | null;
  location: string | null;
  monthly_fee: number;
  /** Vazio = usa o preço da página do contrato. */
  page_price: number | null;
  /** O contador no dia da instalação: a leitura anterior do primeiro mês. */
  initial_reading: number;
  active: boolean;
  notes: string | null;
  created_at: string;
}

/** A fatura do mês de um contrato, com os totais gravados no fechamento. */
export interface PrinterBilling {
  id: string;
  contract_id: string;
  /** O mês de referência, no dia 1. */
  competencia: string;
  previous_date: string | null;
  reading_date: string;
  due_date: string | null;
  franchise_pages: number;
  franchise_price: number;
  total_pages: number;
  total_fees: number;
  total_prints: number;
  franchise_amount: number;
  total_amount: number;
  paid_at: string | null;
  paid_amount: number;
  method: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** O contador de uma impressora num mês. */
export interface PrinterReading {
  id: string;
  billing_id: string;
  printer_id: string;
  previous_reading: number;
  current_reading: number;
  monthly_fee: number;
  page_price: number;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO DE NOTAS (migration 090)
// ─────────────────────────────────────────────────────────────────────────────

/** O papelzinho de recados de cada login. Uma linha do banco por pessoa. */
export interface UserNote {
  user_id: string;
  /** O papel inteiro, uma tarefa por linha. */
  content: string;
  updated_at: string;
}

// ── Prefeitura: notas emitidas por secretaria e a baixa (migration 102) ─────

export type PrefeituraSituacao = "pendente" | "pago" | "cancelada";

export interface PrefeituraSecretaria {
  id: string;
  /** A aba da planilha: INTERNET, NF... (migration 103) */
  grupo: string;
  nome: string;
  valor_contrato: number | null;
  valor_padrao: number | null;
  ordem: number;
  ativa: boolean;
  created_at: string;
}

export interface PrefeituraNota {
  id: string;
  secretaria_id: string;
  numero: string;
  data_emissao: string;
  valor: number;
  situacao: PrefeituraSituacao;
  data_baixa: string | null;
  observacao: string | null;
  created_by: string | null;
  created_at: string;
}
