"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFreightCategory } from "@/lib/utils";
import { PRODUCT_UNITS } from "@/lib/types";
import type {
  Machine,
  MachineTrackingType,
  Product,
  PickupLocation,
  ServiceBillingMode,
  ServiceFreightType,
  ServiceOrderStatus,
  ServiceOrderType,
} from "@/lib/types";

/**
 * Regra de negócio: só caminhão e caçamba fazem frete (e cobrança por km).
 * Valida a categoria da máquina escolhida quando a OS é do tipo "frete".
 * Retorna uma mensagem de erro ou null. Tolerante: se a coluna `category`
 * ainda não existe (migration 023 não aplicada) não bloqueia.
 */
async function freightMachineError(
  supabase: ReturnType<typeof createClient>,
  input: ServiceOrderInput
): Promise<string | null> {
  if (input.type !== "frete" || !input.machine_id) return null;
  const { data, error } = await supabase
    .from("machines")
    .select("category")
    .eq("id", input.machine_id)
    .maybeSingle<{ category: string | null }>();
  if (error || !data) return null; // coluna ausente / máquina não achada → não bloqueia
  if (data.category && !isFreightCategory(data.category))
    return "Só caminhão e caçamba podem fazer frete. Escolha um veículo de frete ou mude o tipo da OS.";
  return null;
}

function revalidate() {
  revalidatePath("/operacoes");
  revalidatePath("/configuracoes");
  revalidatePath("/dashboard");
  revalidatePath("/contas");
  revalidatePath("/estoque");
  revalidatePath("/operador");
}

function normalizeProductUnit(unit?: string | null): string {
  const value = unit?.trim() || PRODUCT_UNITS[0];
  return PRODUCT_UNITS.includes(value as (typeof PRODUCT_UNITS)[number]) ? value : "";
}

// ─────────────────────────────────────────────────────────────────────────────
// MACHINES
// ─────────────────────────────────────────────────────────────────────────────

export async function createMachine(input: {
  name: string;
  plate?: string | null;
  type?: string | null;
  category?: string | null;
  tracking_type?: MachineTrackingType;
  notes?: string | null;
}): Promise<{ error: string } | { ok: true; machine: Machine }> {
  const supabase = createClient();
  const name = input.name.trim();
  if (!name) return { error: "Nome obrigatório" };

  const { data, error } = await supabase
    .from("machines")
    .insert({
      name: name.toUpperCase(),
      plate: input.plate?.trim() ? input.plate.trim().toUpperCase() : null,
      type: input.type?.trim() ? input.type.trim() : null,
      category: input.category?.trim() ? input.category.trim() : null,
      tracking_type: input.tracking_type ?? "hourmeter",
      notes: input.notes?.trim() ? input.notes.trim() : null,
    })
    .select()
    .single<Machine>();

  if (error) return { error: error.message };
  revalidate();
  return { ok: true, machine: data };
}

export async function updateMachine(
  id: string,
  input: Partial<Pick<Machine, "name" | "plate" | "type" | "category" | "tracking_type" | "notes" | "active">>
) {
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim().toUpperCase();
  if (input.plate !== undefined) patch.plate = input.plate?.toString().trim().toUpperCase() || null;
  if (input.type !== undefined) patch.type = input.type?.toString().trim() || null;
  if (input.category !== undefined) patch.category = input.category?.toString().trim() || null;
  if (input.tracking_type !== undefined) patch.tracking_type = input.tracking_type;
  if (input.notes !== undefined) patch.notes = input.notes?.toString().trim() || null;
  if (input.active !== undefined) patch.active = input.active;

  const { error } = await supabase.from("machines").update(patch).eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function deleteMachine(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("machines").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCTS
// ─────────────────────────────────────────────────────────────────────────────

export async function createProduct(input: {
  name: string;
  unit?: string;
  default_price?: number | null;
  notes?: string | null;
}): Promise<{ error: string } | { ok: true; product: Product }> {
  const supabase = createClient();
  const name = input.name.trim();
  if (!name) return { error: "Nome obrigatório" };
  const unit = normalizeProductUnit(input.unit);
  if (!unit) return { error: "Unidade deve ser m³, peça ou carrada" };

  const { data, error } = await supabase
    .from("products")
    .insert({
      name: name.toUpperCase(),
      unit,
      default_price:
        input.default_price !== undefined && input.default_price !== null && !isNaN(input.default_price)
          ? input.default_price
          : null,
      notes: input.notes?.trim() ? input.notes.trim() : null,
    })
    .select()
    .single<Product>();

  if (error) return { error: error.message };
  revalidate();
  return { ok: true, product: data };
}

export async function updateProduct(
  id: string,
  input: Partial<Pick<Product, "name" | "unit" | "default_price" | "notes" | "active">>
) {
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim().toUpperCase();
  if (input.unit !== undefined) {
    const unit = normalizeProductUnit(input.unit);
    if (!unit) return { error: "Unidade deve ser m³, peça ou carrada" };
    patch.unit = unit;
  }
  if (input.default_price !== undefined) patch.default_price = input.default_price;
  if (input.notes !== undefined) patch.notes = input.notes?.toString().trim() || null;
  if (input.active !== undefined) patch.active = input.active;

  const { error } = await supabase.from("products").update(patch).eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function deleteProduct(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// PICKUP LOCATIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function createPickupLocation(input: {
  name: string;
  address?: string | null;
  document?: string | null;
  phone?: string | null;
  notes?: string | null;
}): Promise<{ error: string } | { ok: true; location: PickupLocation }> {
  const supabase = createClient();
  const name = input.name.trim();
  if (!name) return { error: "Nome obrigatório" };

  const { data, error } = await supabase
    .from("pickup_locations")
    .insert({
      name: name.toUpperCase(),
      address: input.address?.trim() ? input.address.trim().toUpperCase() : null,
      document: input.document?.trim() ? input.document.trim() : null,
      phone: input.phone?.trim() ? input.phone.trim() : null,
      notes: input.notes?.trim() ? input.notes.trim() : null,
    })
    .select()
    .single<PickupLocation>();

  if (error) return { error: error.message };
  revalidate();
  return { ok: true, location: data };
}

export async function updatePickupLocation(
  id: string,
  input: Partial<Pick<PickupLocation, "name" | "address" | "document" | "phone" | "notes" | "active">>
) {
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim().toUpperCase();
  if (input.address !== undefined) patch.address = input.address?.toString().trim().toUpperCase() || null;
  if (input.document !== undefined) patch.document = input.document?.toString().trim() || null;
  if (input.phone !== undefined) patch.phone = input.phone?.toString().trim() || null;
  if (input.notes !== undefined) patch.notes = input.notes?.toString().trim() || null;
  if (input.active !== undefined) patch.active = input.active;

  const { error } = await supabase.from("pickup_locations").update(patch).eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function deletePickupLocation(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("pickup_locations").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE ORDERS
// ─────────────────────────────────────────────────────────────────────────────

export interface ServiceOrderItemInput {
  product_id?: string | null;
  description?: string | null;
  quantity: number;
  unit?: string | null;
  unit_price: number;
  is_freight?: boolean;
}

export interface ServiceOrderInput {
  type: ServiceOrderType;
  freight_type: ServiceFreightType;
  status: ServiceOrderStatus;
  client_name?: string | null;
  client_document?: string | null;
  client_phone?: string | null;
  machine_id?: string | null;
  assigned_to?: string | null;
  pickup_location_id?: string | null;
  /** Obra vinculada (opcional) — o custo desta OS soma no total da obra. */
  obra_id?: string | null;
  delivery_address?: string | null;
  service_description?: string | null;
  delivery_date?: string | null;
  hourmeter_start?: number | null;
  hourmeter_end?: number | null;
  km_start?: number | null;
  km_end?: number | null;
  hourly_rate?: number | null;
  service_cost?: number | null;
  fuel_cost?: number | null;
  received_by?: string | null;
  billing_mode?: ServiceBillingMode | null;
  freight_value?: number | null;
  trips_count?: number | null;
  start_time?: string | null;
  notes?: string | null;
  items: ServiceOrderItemInput[];
}

function sanitizeOrder(input: ServiceOrderInput) {
  // Upper-casing free-text fields (consistent with the rest of the app)
  return {
    type: input.type,
    freight_type: input.freight_type,
    status: input.status,
    client_name: input.client_name?.trim() ? input.client_name.trim().toUpperCase() : null,
    client_document: input.client_document?.trim() || null,
    client_phone: input.client_phone?.trim() || null,
    machine_id: input.machine_id || null,
    assigned_to: input.assigned_to || null,
    pickup_location_id: input.pickup_location_id || null,
    obra_id: input.obra_id || null,
    delivery_address: input.delivery_address?.trim() ? input.delivery_address.trim().toUpperCase() : null,
    service_description: input.service_description?.trim()
      ? input.service_description.trim().toUpperCase()
      : null,
    delivery_date: input.delivery_date || null,
    hourmeter_start: input.hourmeter_start ?? null,
    hourmeter_end: input.hourmeter_end ?? null,
    km_start: input.km_start ?? null,
    km_end: input.km_end ?? null,
    hourly_rate: input.hourly_rate ?? null,
    service_cost: input.service_cost ?? null,
    fuel_cost: input.fuel_cost ?? null,
    received_by: input.received_by?.trim() ? input.received_by.trim().toUpperCase() : null,
    // Cobrança keyed no billing_mode (não no type): preserva OS antigas de
    // entrega de material que já usavam cobrança antes do tipo "frete" existir.
    billing_mode: input.billing_mode ?? null,
    freight_value: input.billing_mode ? input.freight_value ?? null : null,
    trips_count: input.billing_mode === "viagem" ? input.trips_count ?? null : null,
    start_time: input.start_time || null,
    notes: input.notes?.trim() ? input.notes.trim().toUpperCase() : null,
  };
}

function validate(input: ServiceOrderInput): string | null {
  if (!["entrega_material", "prestacao_servico", "frete", "servico_rapido"].includes(input.type))
    return "Tipo inválido";
  if (!["cliente", "interno"].includes(input.freight_type))
    return "Tipo de frete inválido";
  if (input.freight_type === "cliente" && !input.client_name?.trim())
    return "Nome do cliente obrigatório";

  const billingMode = input.type === "frete" ? input.billing_mode ?? null : null;
  if (input.type === "frete" && !billingMode)
    return "Escolha como o frete é cobrado";
  if (billingMode && !["viagem", "km", "diaria"].includes(billingMode))
    return "Modo de cobrança inválido";
  // Valor do frete: obrigatório para cliente; opcional no consumo interno
  // (mesma regra do valor da hora na prestação de serviço).
  if (
    billingMode &&
    input.freight_type === "cliente" &&
    !(input.freight_value != null && input.freight_value > 0)
  ) {
    const label = { viagem: "da viagem", km: "do km", diaria: "da diária" }[billingMode];
    return `Informe o valor ${label}`;
  }

  // No frete a cobrança é o próprio item de frete — a lista pode ficar vazia.
  if ((!input.items || input.items.length === 0) && input.type !== "frete")
    return "Adicione ao menos um item";
  for (const it of input.items) {
    if (!(it.quantity > 0)) return "Quantidade deve ser maior que zero";
    if (it.unit_price < 0) return "Valor unitário inválido";
    if (!it.product_id && !it.description?.trim())
      return "Cada item precisa de um produto ou descrição";
  }
  return null;
}

/**
 * Sincroniza os lançamentos financeiros (ocultos) de uma OS. Recria do zero:
 * a receita (cliente) e/ou os custos (consumo interno + combustível/serviço), já
 * realizados (recebido/pago) e marcados com service_order_id — contam nas finanças
 * (dashboard/saldo) mas NÃO aparecem na aba Contas. Só gera quando a OS está
 * 'entregue' e não tem lançamento manual legado (transaction_id). Best-effort:
 * se a coluna service_order_id ainda não existir (migration 027), não quebra.
 */
async function syncServiceOrderFinance(
  supabase: ReturnType<typeof createClient>,
  orderId: string
) {
  // Cliente de ESCRITA no financeiro: service-role (bypassa RLS). O operador que
  // finaliza a OS NÃO tem permissão direta de escrever em transactions (RLS só
  // libera admin/financeiro), mas o lançamento oculto da OS precisa nascer.
  // Best-effort: sem a SUPABASE_SERVICE_ROLE_KEY cai no client do usuário —
  // continua funcionando para admin/financeiro (operador fica sem o lançamento).
  let writeDb: ReturnType<typeof createAdminClient>;
  try {
    writeDb = createAdminClient();
  } catch {
    writeDb = supabase as unknown as ReturnType<typeof createAdminClient>;
  }

  await writeDb.from("transactions").delete().eq("service_order_id", orderId);

  const { data: o } = await supabase
    .from("service_orders")
    .select(
      "order_number, freight_type, total_amount, service_cost, fuel_cost, delivery_date, issue_date, client_name, service_description, status, transaction_id, created_by, obra_id"
    )
    .eq("id", orderId)
    .maybeSingle<{
      order_number: number;
      freight_type: string;
      total_amount: number | null;
      service_cost: number | null;
      fuel_cost: number | null;
      delivery_date: string | null;
      issue_date: string;
      client_name: string | null;
      service_description: string | null;
      status: string;
      transaction_id: string | null;
      created_by: string | null;
      obra_id: string | null;
    }>();
  if (!o) return;
  // Só OS finalizada conta; OS com lançamento manual legado fica como está.
  if (o.status !== "entregue" || o.transaction_id) return;

  // Centro de custo "Ordens de Serviço" — agrupa as OS no "Para onde foi".
  const { data: cc } = await supabase
    .from("cost_centers")
    .select("id")
    .eq("name", "Ordens de Serviço")
    .maybeSingle<{ id: string }>();
  const costCenterId = cc?.id ?? null;

  const date = o.delivery_date || o.issue_date || new Date().toISOString().split("T")[0];
  const isClient = o.freight_type === "cliente";
  const rows: Record<string, unknown>[] = [];

  const total = Number(o.total_amount ?? 0);
  if (total > 0) {
    const label =
      o.client_name?.trim() || o.service_description?.trim() || "Consumo interno";
    rows.push({
      type: isClient ? "entrada" : "saida",
      status: isClient ? "recebido" : "pago",
      amount: total,
      description: `OS #${o.order_number} - ${label}`.toUpperCase(),
      due_date: date,
      paid_date: date,
      cost_center_id: costCenterId,
      service_order_id: orderId,
      obra_id: o.obra_id,
      created_by: o.created_by,
    });
  }

  const internalCost = Number(o.service_cost ?? 0) + Number(o.fuel_cost ?? 0);
  if (internalCost > 0) {
    rows.push({
      type: "saida",
      status: "pago",
      amount: internalCost,
      description: `OS #${o.order_number} - CUSTOS INTERNOS`,
      due_date: date,
      paid_date: date,
      cost_center_id: costCenterId,
      service_order_id: orderId,
      obra_id: o.obra_id,
      created_by: o.created_by,
    });
  }

  if (rows.length > 0) {
    const { error } = await writeDb.from("transactions").insert(rows);
    if (error) console.error("Falha ao sincronizar financeiro da OS:", error.message);
  }
}

export async function createServiceOrder(input: ServiceOrderInput) {
  const err = validate(input);
  if (err) return { error: err };

  const supabase = createClient();
  const freightErr = await freightMachineError(supabase, input);
  if (freightErr) return { error: freightErr };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { data: created, error: insertErr } = await supabase
    .from("service_orders")
    .insert({ ...sanitizeOrder(input), created_by: user.id })
    .select()
    .single();
  if (insertErr || !created) return { error: insertErr?.message ?? "Erro ao criar OS" };

  const itemRows = input.items.map((it) => ({
    service_order_id: created.id,
    product_id: it.product_id || null,
    description: it.description?.trim() ? it.description.trim().toUpperCase() : null,
    quantity: it.quantity,
    unit: it.unit?.trim() || null,
    unit_price: it.unit_price,
    is_freight: it.is_freight ?? false,
  }));

  if (itemRows.length > 0) {
    const { error: itemsErr } = await supabase
      .from("service_order_items")
      .insert(itemRows);
    if (itemsErr) return { error: itemsErr.message };
  }

  revalidate();
  return { ok: true, id: created.id };
}

export async function updateServiceOrder(id: string, input: ServiceOrderInput) {
  const err = validate(input);
  if (err) return { error: err };

  const supabase = createClient();
  const freightErr = await freightMachineError(supabase, input);
  if (freightErr) return { error: freightErr };

  const { error: updateErr } = await supabase
    .from("service_orders")
    .update(sanitizeOrder(input))
    .eq("id", id);
  if (updateErr) return { error: updateErr.message };

  // Substitui itens (simples e seguro): apaga e recria
  const { error: delErr } = await supabase
    .from("service_order_items")
    .delete()
    .eq("service_order_id", id);
  if (delErr) return { error: delErr.message };

  const itemRows = input.items.map((it) => ({
    service_order_id: id,
    product_id: it.product_id || null,
    description: it.description?.trim() ? it.description.trim().toUpperCase() : null,
    quantity: it.quantity,
    unit: it.unit?.trim() || null,
    unit_price: it.unit_price,
    is_freight: it.is_freight ?? false,
  }));

  if (itemRows.length > 0) {
    const { error: itemsErr } = await supabase
      .from("service_order_items")
      .insert(itemRows);
    if (itemsErr) return { error: itemsErr.message };
  }

  await syncServiceOrderFinance(supabase, id);
  revalidate();
  return { ok: true };
}

export async function deleteServiceOrder(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("service_orders").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function updateServiceOrderStatus(
  id: string,
  status: ServiceOrderStatus,
  // Data local de quem clicou (o servidor roda em UTC na Vercel; depois das
  // 21h BRT o ISO do servidor já está no dia seguinte).
  finishedDate?: string | null
) {
  const supabase = createClient();
  const patch: Record<string, unknown> = { status };
  // Ao marcar como entregue/finalizada, registra a data real de entrega
  // (sobrescreve a previsão). Demais transições não mexem na data.
  if (status === "entregue") {
    patch.delivery_date =
      finishedDate?.trim() || new Date().toISOString().split("T")[0];
  }
  const { error } = await supabase.from("service_orders").update(patch).eq("id", id);
  if (error) return { error: error.message };
  await syncServiceOrderFinance(supabase, id);
  revalidate();
  return { ok: true };
}

/**
 * Início de OS pelo técnico (viagem/diária): registra o km do veículo e a
 * hora de saída/início junto com a mudança para "em andamento".
 */
export async function startServiceOrder(
  id: string,
  options: {
    kmStart?: number | null;
    // Leitura inicial do horímetro (serviço em máquina medida por horímetro).
    hourmeterStart?: number | null;
    startTime?: string | null;
    // "De onde" (frete diária/km): o operador informa a origem ao iniciar.
    origin?: string | null;
  } = {}
) {
  const supabase = createClient();
  const patch: Record<string, unknown> = { status: "em_andamento" };
  if (options.kmStart != null) patch.km_start = options.kmStart;
  if (options.hourmeterStart != null) patch.hourmeter_start = options.hourmeterStart;
  if (options.startTime?.trim()) patch.start_time = options.startTime.trim();
  if (options.origin?.trim()) patch.origin_address = options.origin.trim().toUpperCase();

  const { error } = await supabase.from("service_orders").update(patch).eq("id", id);
  if (error) {
    // Coluna origin_address ausente (migration 022): tenta sem ela.
    if (patch.origin_address) {
      delete patch.origin_address;
      const { error: retryErr } = await supabase
        .from("service_orders")
        .update(patch)
        .eq("id", id);
      if (retryErr) return { error: retryErr.message };
    } else {
      return { error: error.message };
    }
  }
  revalidate();
  return { ok: true };
}

/**
 * Início de UMA viagem (modo "por viagem"): o operador informa de onde vai sair
 * e a hora. Cria uma viagem EM ANDAMENTO (trip_time NULL) — ainda não conta
 * como entregue; o contador só sobe ao finalizar a viagem. Uma por OS.
 */
export async function startTrip(
  id: string,
  options: { origin?: string | null; startTime?: string | null } = {}
) {
  const supabase = createClient();

  // Próximo número de viagem = maior já registrado + 1.
  const { data: last } = await supabase
    .from("service_order_trips")
    .select("trip_number")
    .eq("service_order_id", id)
    .order("trip_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const tripNumber = (last?.trip_number ?? 0) + 1;

  const { error } = await supabase.from("service_order_trips").insert({
    service_order_id: id,
    trip_number: tripNumber,
    start_time: options.startTime?.trim() || null,
    origin: options.origin?.trim() ? options.origin.trim().toUpperCase() : null,
    trip_time: null,
  });
  if (error) return { error: error.message };

  revalidatePath("/operador");
  revalidatePath("/operacoes");
  return { ok: true, tripNumber };
}

/**
 * Fim de UMA viagem: o operador informa onde foi entregue, quem recebeu assina
 * e o GPS é gravado. Completa a viagem em andamento (trip_time = chegada) e só
 * então incrementa o contador (viagens × valor é calculado no fechamento).
 */
export async function finishTrip(
  id: string,
  options: {
    destination?: string | null;
    receivedBy?: string | null;
    signature?: string | null;
    finishTime?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    locationAccuracy?: number | null;
  } = {}
) {
  const supabase = createClient();

  // Acha a viagem em andamento (trip_time NULL) mais recente.
  const { data: open } = await supabase
    .from("service_order_trips")
    .select("id")
    .eq("service_order_id", id)
    .is("trip_time", null)
    .order("trip_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!open) return { error: "Nenhuma viagem em andamento" };

  const { error: updErr } = await supabase
    .from("service_order_trips")
    .update({
      trip_time: options.finishTime?.trim() || null,
      destination: options.destination?.trim()
        ? options.destination.trim().toUpperCase()
        : null,
      received_by: options.receivedBy?.trim()
        ? options.receivedBy.trim().toUpperCase()
        : null,
      signature: options.signature || null,
      latitude: options.latitude ?? null,
      longitude: options.longitude ?? null,
      location_accuracy: options.locationAccuracy ?? null,
    })
    .eq("id", open.id);
  if (updErr) return { error: updErr.message };

  // Conta a viagem (incremento atômico).
  const { data: trips } = await supabase.rpc("register_os_trip", {
    p_order_id: id,
    p_delta: 1,
  });

  revalidatePath("/operador");
  revalidatePath("/operacoes");
  return { ok: true, trips: trips ?? null };
}

/** Cancela a viagem em andamento (apaga a linha; não mexe no contador). */
export async function cancelOpenTrip(id: string) {
  const supabase = createClient();
  const { data: open } = await supabase
    .from("service_order_trips")
    .select("id")
    .eq("service_order_id", id)
    .is("trip_time", null)
    .order("trip_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (open) await supabase.from("service_order_trips").delete().eq("id", open.id);
  revalidatePath("/operador");
  revalidatePath("/operacoes");
  return { ok: true };
}

/** Remove a última viagem ENTREGUE (apaga a linha e abaixa o contador). */
export async function removeLastTrip(id: string) {
  const supabase = createClient();
  const { data: last } = await supabase
    .from("service_order_trips")
    .select("id")
    .eq("service_order_id", id)
    .not("trip_time", "is", null)
    .order("trip_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) return { error: "Nenhuma viagem entregue para remover" };

  await supabase.from("service_order_trips").delete().eq("id", last.id);
  const { data: trips } = await supabase.rpc("register_os_trip", {
    p_order_id: id,
    p_delta: -1,
  });

  revalidatePath("/operador");
  revalidatePath("/operacoes");
  return { ok: true, trips: trips ?? null };
}

// ─────────────────────────────────────────────────────────────────────────────
// PAUSA / RETOMADA (prestação de serviço interno que dura vários dias)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pausa um serviço em andamento (fim do expediente): grava a hora, a leitura do
 * veículo/máquina (km do hodômetro ou horímetro), a observação do dia (opcional)
 * e a localização (GPS) — tudo do relógio/aparelho do técnico. Cria uma pausa
 * EM ABERTO (resume_time null); não muda o status da OS (continua em andamento).
 */
export async function pauseServiceOrder(
  id: string,
  options: {
    pauseDate?: string | null;
    pauseTime?: string | null;
    reading?: number | null;
    notes?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    locationAccuracy?: number | null;
  } = {}
) {
  const supabase = createClient();

  // Não abre uma nova pausa se já houver uma em andamento.
  const { data: open } = await supabase
    .from("service_order_pauses")
    .select("id")
    .eq("service_order_id", id)
    .is("resume_time", null)
    .limit(1)
    .maybeSingle();
  if (open) return { error: "Este serviço já está pausado." };

  // Próximo número da pausa = maior já registrado + 1.
  const { data: last } = await supabase
    .from("service_order_pauses")
    .select("pause_number")
    .eq("service_order_id", id)
    .order("pause_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const pauseNumber = (last?.pause_number ?? 0) + 1;

  const { error } = await supabase.from("service_order_pauses").insert({
    service_order_id: id,
    pause_number: pauseNumber,
    pause_date: options.pauseDate?.trim() || null,
    pause_time: options.pauseTime?.trim() || null,
    pause_reading: options.reading ?? null,
    pause_notes: options.notes?.trim() ? options.notes.trim().toUpperCase() : null,
    latitude: options.latitude ?? null,
    longitude: options.longitude ?? null,
    location_accuracy: options.locationAccuracy ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath("/operador");
  revalidatePath("/operacoes");
  return { ok: true, pauseNumber };
}

/**
 * Retoma o serviço no dia seguinte: completa a pausa em aberto com a hora de
 * retorno e a leitura (km/horímetro) ao voltar a trabalhar.
 */
export async function resumeServiceOrder(
  id: string,
  options: {
    resumeDate?: string | null;
    resumeTime?: string | null;
    reading?: number | null;
  } = {}
) {
  const supabase = createClient();

  // Acha a pausa em andamento (resume_time null) mais recente.
  const { data: open } = await supabase
    .from("service_order_pauses")
    .select("id")
    .eq("service_order_id", id)
    .is("resume_time", null)
    .order("pause_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!open) return { error: "Este serviço não está pausado." };

  const { error } = await supabase
    .from("service_order_pauses")
    .update({
      resume_date: options.resumeDate?.trim() || null,
      resume_time: options.resumeTime?.trim() || null,
      resume_reading: options.reading ?? null,
    })
    .eq("id", open.id);
  if (error) return { error: error.message };

  revalidatePath("/operador");
  revalidatePath("/operacoes");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENCAMINHAR OS (passar a outro operador) — registra de quem, para quem e quando
// ─────────────────────────────────────────────────────────────────────────────

export async function forwardServiceOrder(
  orderId: string,
  toUserId: string,
  options: { toName?: string | null; note?: string | null } = {}
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };
  if (!toUserId) return { error: "Escolha para quem encaminhar." };
  if (toUserId === user.id) return { error: "Você já é o responsável por esta OS." };

  const fromName =
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    (user.user_metadata?.name as string | undefined)?.trim() ||
    user.email ||
    "Operador";

  // Reatribui a OS ao novo responsável — ela passa a aparecer no painel dele.
  const { error: updErr } = await supabase
    .from("service_orders")
    .update({ assigned_to: toUserId })
    .eq("id", orderId);
  if (updErr) return { error: updErr.message };

  // Registra o encaminhamento (best-effort: não quebra se a tabela ainda não
  // existir — migration 027 não aplicada no Supabase).
  const { error: logErr } = await supabase.from("service_order_forwards").insert({
    service_order_id: orderId,
    from_user: user.id,
    from_name: fromName,
    to_user: toUserId,
    to_name: options.toName?.trim() ? options.toName.trim() : null,
    note: options.note?.trim() ? options.note.trim().toUpperCase() : null,
  });
  if (logErr) console.error("Falha ao registrar encaminhamento:", logErr.message);

  revalidatePath("/operador");
  revalidatePath("/operacoes");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// LINK: gerar lançamento financeiro a partir de uma OS
// ─────────────────────────────────────────────────────────────────────────────

export async function generateTransactionFromOrder(
  serviceOrderId: string,
  options: {
    category_id?: string | null;
    cost_center_id?: string | null;
    due_date?: string | null;
    transaction_type?: "entrada" | "saida";
  } = {}
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { data: order, error: fetchErr } = await supabase
    .from("service_orders")
    .select("*")
    .eq("id", serviceOrderId)
    .single();

  if (fetchErr || !order) return { error: "OS não encontrada" };
  if (order.transaction_id) return { error: "Esta OS já tem lançamento gerado" };
  if (!order.total_amount || order.total_amount <= 0)
    return { error: "Valor total da OS é zero" };

  // Default: cliente → entrada (a receber), interno → saida (custo interno)
  const type =
    options.transaction_type ??
    (order.freight_type === "cliente" ? "entrada" : "saida");

  const description =
    order.freight_type === "cliente"
      ? `OS #${order.order_number} - ${order.client_name ?? "Cliente"}`
      : `OS #${order.order_number} - Consumo interno`;

  const dueDate = options.due_date || order.delivery_date || order.issue_date;

  // Status válido por tipo de lançamento: entrada → "recebido", saída → "pago".
  // Só nasce baixado quando a OS já foi entregue (consumo interno = custo já
  // incorrido); para cliente, a entrega não significa que ele já pagou, então
  // a receita nasce pendente (a receber) e é baixada no fluxo financeiro.
  const status =
    type === "saida" && order.status === "entregue" ? "pago" : "pendente";

  const { data: tx, error: txErr } = await supabase
    .from("transactions")
    .insert({
      type,
      description: description.toUpperCase(),
      amount: order.total_amount,
      due_date: dueDate,
      status,
      category_id: options.category_id || null,
      cost_center_id: options.cost_center_id || null,
      notes: order.notes,
      created_by: user.id,
    })
    .select()
    .single();

  if (txErr || !tx) return { error: txErr?.message ?? "Erro ao criar lançamento" };

  await supabase
    .from("service_orders")
    .update({ transaction_id: tx.id })
    .eq("id", serviceOrderId);

  revalidate();
  return { ok: true, transactionId: tx.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// FINALIZAR OS (usado pelo painel do operador)
// ─────────────────────────────────────────────────────────────────────────────

export async function finalizeServiceOrder(
  id: string,
  receivedBy: string,
  options: {
    signature?: string | null;
    hourmeterStart?: number | null;
    hourmeterEnd?: number | null;
    kmStart?: number | null;
    kmEnd?: number | null;
    tripsCount?: number | null;
    endTime?: string | null;
    finishedDate?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    locationAccuracy?: number | null;
    // "Onde foi entregue" (frete diária/km): destino informado pelo operador.
    destination?: string | null;
    // Serviço rápido: "o que foi feito" + valor gasto (vira o total da OS).
    completionNotes?: string | null;
    amount?: number | null;
  } = {}
) {
  const supabase = createClient();

  // Quem está finalizando (o operador no painel) — gravado em finalized_by para
  // o histórico "Finalizadas" do operador.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Busca a OS para saber se é prestação de serviço por horímetro a fechar.
  const { data: order, error: fetchErr } = await supabase
    .from("service_orders")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !order) return { error: "OS não encontrada" };

  const mode = order.type !== "prestacao_servico" ? order.billing_mode : null;

  // No modo viagem cada entrega já foi assinada na hora (service_order_trips),
  // então o fechamento não exige nome/assinatura final — se vier vazio, usa o
  // nome da última entrega assinada como referência no comprovante. Consumo
  // interno também dispensa o nome (não há terceiro recebendo).
  let trimmed = receivedBy.trim();
  if (!trimmed) {
    if (mode === "viagem") {
      const { data: lastSigned } = await supabase
        .from("service_order_trips")
        .select("received_by")
        .eq("service_order_id", id)
        .not("received_by", "is", null)
        .order("trip_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      trimmed = lastSigned?.received_by || "ENTREGAS ASSINADAS POR VIAGEM";
    } else if (order.freight_type === "cliente") {
      return { error: "Informe o nome de quem recebeu" };
    } else {
      trimmed = "CONSUMO INTERNO";
    }
  }

  // Ao finalizar, a data de entrega passa a ser a data real (hoje),
  // sobrescrevendo a previsão. Usa a data do celular do técnico (finishedDate);
  // o fallback do servidor é UTC e erra depois das 21h (BRT).
  const today = options.finishedDate?.trim() || new Date().toISOString().split("T")[0];
  const patch: Record<string, unknown> = {
    status: "entregue",
    received_by: trimmed.toUpperCase(),
    delivery_date: today,
  };

  // Hora de fechamento (relógio do celular do técnico) — gravada em todos os
  // fluxos, não só nos modos de cobrança.
  if (options.endTime?.trim()) patch.end_time = options.endTime.trim();

  // "Onde foi entregue" (frete diária/km): destino preenchido pelo operador no
  // fechamento — no modo viagem cada viagem tem o seu próprio destino.
  if (options.destination?.trim())
    patch.delivery_address = options.destination.trim().toUpperCase();

  // ── Fechamento de OS de frete com modo de cobrança ────────────────────────
  // viagem: viagens × valor · km: km rodado × R$/km · diária: valor fixo.
  // O item de frete (is_freight) é recriado aqui para refletir o cálculo final.
  // Keyed no billing_mode (não no type) para cobrir OS antigas de entrega de
  // material que usavam cobrança antes do tipo "frete" existir.
  if (mode) {
    // Assinatura final obrigatória só para cliente externo nos modos km e
    // diária. No modo viagem cada entrega já foi assinada na hora; em frete
    // interno não há terceiro para assinar.
    if (mode !== "viagem" && order.freight_type === "cliente" && !options.signature)
      return { error: "A assinatura de quem recebeu é obrigatória" };

    const kmStart = options.kmStart ?? order.km_start;
    const kmEnd = options.kmEnd;

    if (kmEnd == null) return { error: "Informe o km de chegada" };
    if (mode === "km" && kmStart == null) return { error: "Informe o km inicial" };
    if (kmStart != null && kmEnd <= kmStart)
      return { error: "O km de chegada deve ser maior que o km de saída" };

    // No modo viagem o contador vem das viagens marcadas pelo técnico durante
    // a OS (ou da correção feita no fechamento).
    const trips = options.tripsCount ?? order.trips_count ?? null;
    if (mode === "viagem" && !(trips != null && trips >= 1))
      return { error: "Informe quantas viagens foram feitas" };

    if (options.kmStart != null) patch.km_start = options.kmStart;
    patch.km_end = kmEnd;
    if (mode === "viagem") patch.trips_count = trips;

    const rate = order.freight_value ?? 0;
    const rateLabel = rate.toFixed(2).replace(".", ",");
    let freight: { description: string; quantity: number; unit: string; unit_price: number };

    if (mode === "viagem") {
      const tripsLabel = `${trips} ${trips === 1 ? "VIAGEM" : "VIAGENS"}`;
      freight = {
        description: rate > 0
          ? `FRETE — ${tripsLabel} × R$ ${rateLabel}/VIAGEM`
          : `FRETE — ${tripsLabel}`,
        quantity: trips as number,
        unit: "viagem",
        unit_price: rate,
      };
    } else if (mode === "km") {
      const km = Number((kmEnd - (kmStart as number)).toFixed(1));
      const kmLabel = km.toFixed(1).replace(".", ",");
      freight = {
        description: rate > 0
          ? `FRETE — ${kmLabel} KM × R$ ${rateLabel}/KM`
          : `FRETE — ${kmLabel} KM`,
        quantity: km,
        unit: "km",
        unit_price: rate,
      };
    } else {
      freight = { description: "FRETE — DIÁRIA", quantity: 1, unit: "diária", unit_price: rate };
    }

    // Substitui só a linha de frete — os materiais ficam intactos.
    await supabase
      .from("service_order_items")
      .delete()
      .eq("service_order_id", id)
      .eq("is_freight", true);
    const { error: frErr } = await supabase.from("service_order_items").insert({
      service_order_id: id,
      product_id: null,
      ...freight,
      is_freight: true,
    });
    if (frErr) return { error: frErr.message };
  }

  // Fechamento de serviço por horímetro. O técnico informa o horímetro final
  // (e o inicial, quando não foi informado no cadastro) → recalcula horas ×
  // valor. O inicial vem das options quando o técnico o digitou ao fechar.
  const end = options.hourmeterEnd;
  const start = options.hourmeterStart ?? order.hourmeter_start;

  if (order.type === "prestacao_servico" && end != null && start != null) {
    if (end <= start)
      return { error: "O horímetro final deve ser maior que o inicial" };

    patch.hourmeter_start = start;
    patch.hourmeter_end = end;

    const hours = Number((end - start).toFixed(2));
    const rate = order.hourly_rate ?? 0;
    const hoursLabel = hours.toFixed(2).replace(".", ",");
    const rateLabel = rate.toFixed(2).replace(".", ",");

    // Substitui os itens por um único item de serviço calculado.
    // O trigger recalcula o total_amount da OS automaticamente.
    await supabase.from("service_order_items").delete().eq("service_order_id", id);
    const { error: itErr } = await supabase.from("service_order_items").insert({
      service_order_id: id,
      product_id: null,
      description:
        rate > 0
          ? `PRESTAÇÃO DE SERVIÇO — ${hoursLabel}H × R$ ${rateLabel}/H`
          : `PRESTAÇÃO DE SERVIÇO — ${hoursLabel}H`,
      quantity: hours,
      unit: "h",
      unit_price: rate,
    });
    if (itErr) return { error: itErr.message };
  }

  // Prestação de serviço medida por hodômetro (km): registra a quilometragem
  // rodada (controle de uso da máquina). O valor do serviço é o combinado —
  // o km não recalcula o total, só fica gravado.
  if (order.type === "prestacao_servico" && options.kmEnd != null) {
    const ks = options.kmStart ?? order.km_start;
    if (ks != null && options.kmEnd <= ks)
      return { error: "O km final deve ser maior que o inicial" };
    if (options.kmStart != null) patch.km_start = options.kmStart;
    patch.km_end = options.kmEnd;
  }

  // Serviço rápido: o valor gasto (quando informado) vira o total da OS. Recria
  // o item único com o valor — o trigger recalcula o total_amount.
  if (order.type === "servico_rapido" && options.amount != null) {
    await supabase.from("service_order_items").delete().eq("service_order_id", id);
    const { error: itErr } = await supabase.from("service_order_items").insert({
      service_order_id: id,
      product_id: null,
      description: order.service_description?.trim() || "SERVIÇO RÁPIDO",
      quantity: 1,
      unit: "ud",
      unit_price: options.amount,
    });
    if (itErr) return { error: itErr.message };
  }

  const { error } = await supabase
    .from("service_orders")
    .update(patch)
    .eq("id", id);

  if (error) return { error: error.message };

  // Autor do fechamento (best-effort): não quebra a finalização caso a coluna
  // finalized_by ainda não exista (migration 030 não aplicada no Supabase).
  if (user) {
    const { error: fbErr } = await supabase
      .from("service_orders")
      .update({ finalized_by: user.id })
      .eq("id", id);
    if (fbErr) console.error("Falha ao salvar quem finalizou a OS:", fbErr.message);
  }

  // "O que foi feito" (best-effort): não quebra a finalização caso a coluna
  // completion_notes ainda não exista (migration 026 não aplicada no Supabase).
  if (options.completionNotes?.trim()) {
    const { error: cnErr } = await supabase
      .from("service_orders")
      .update({ completion_notes: options.completionNotes.trim().toUpperCase() })
      .eq("id", id);
    if (cnErr) console.error("Falha ao salvar o que foi feito:", cnErr.message);
  }

  // Assinatura (best-effort): não quebra a finalização caso a coluna ainda
  // não exista (migration 010 não aplicada no Supabase).
  if (options.signature) {
    const { error: sigErr } = await supabase
      .from("service_orders")
      .update({ signature: options.signature })
      .eq("id", id);
    if (sigErr) console.error("Falha ao salvar assinatura:", sigErr.message);
  }

  // Localização do fechamento (best-effort): GPS desligado ou migration 018
  // não aplicada não impedem a finalização.
  if (options.latitude != null && options.longitude != null) {
    const { error: locErr } = await supabase
      .from("service_orders")
      .update({
        end_latitude: options.latitude,
        end_longitude: options.longitude,
        end_location_accuracy: options.locationAccuracy ?? null,
      })
      .eq("id", id);
    if (locErr) console.error("Falha ao salvar localização:", locErr.message);
  }

  // Lança o valor da OS no financeiro (oculto da aba Contas). Roda depois dos
  // itens (o trigger já recalculou o total_amount).
  await syncServiceOrderFinance(supabase, id);

  revalidatePath("/operador");
  revalidatePath("/operacoes");
  revalidatePath("/dashboard");
  revalidatePath("/contas");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPROVANTES DA OS (anexos) — foto do recibo / PDF de um serviço rápido
// ─────────────────────────────────────────────────────────────────────────────

const MAX_OS_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/** Upload de um ou mais comprovantes para o bucket 'attachments' sob service_orders/<id>/. */
export async function uploadServiceOrderAttachments(orderId: string, formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Nenhum arquivo selecionado" };

  const rows: Record<string, unknown>[] = [];
  const errors: string[] = [];

  for (const file of files) {
    if (file.size > MAX_OS_FILE_SIZE) {
      errors.push(`${file.name}: maior que 10 MB`);
      continue;
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `service_orders/${orderId}/${randomUUID()}_${safeName}`;

    const { error: uploadErr } = await supabase.storage
      .from("attachments")
      .upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadErr) {
      errors.push(`${file.name}: ${uploadErr.message}`);
      continue;
    }

    rows.push({
      service_order_id: orderId,
      storage_path: path,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type || null,
      created_by: user.id,
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("service_order_attachments").insert(rows);
    if (error) return { error: error.message };
  }

  revalidatePath("/operador");
  revalidatePath("/operacoes");
  if (errors.length > 0) return { ok: true as const, warning: errors.join("; ") };
  return { ok: true as const };
}

/**
 * Lista os comprovantes de uma OS (para o escritório ver/baixar ao editar).
 * Best-effort: se a tabela ainda não existir (migration 026 não aplicada),
 * devolve lista vazia em vez de quebrar a tela.
 */
export async function listServiceOrderAttachments(orderId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("service_order_attachments")
    .select("*")
    .eq("service_order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) return { attachments: [] as Record<string, unknown>[] };
  return { attachments: data ?? [] };
}

/** Gera uma URL assinada (1h) para abrir/baixar um comprovante. */
export async function getServiceOrderAttachmentSignedUrl(storagePath: string) {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(storagePath, 60 * 60);
  if (error) return { error: error.message };
  return { url: data.signedUrl };
}

export async function deleteServiceOrderAttachment(id: string) {
  const supabase = createClient();

  const { data: att } = await supabase
    .from("service_order_attachments")
    .select("storage_path")
    .eq("id", id)
    .single();
  if (!att) return { error: "Comprovante não encontrado" };

  await supabase.storage.from("attachments").remove([att.storage_path]);

  const { error } = await supabase.from("service_order_attachments").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/operador");
  revalidatePath("/operacoes");
  return { ok: true };
}
