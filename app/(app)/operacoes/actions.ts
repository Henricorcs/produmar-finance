"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

function revalidate() {
  revalidatePath("/operacoes");
  revalidatePath("/configuracoes");
  revalidatePath("/dashboard");
  revalidatePath("/contas");
  revalidatePath("/estoque");
  revalidatePath("/operador");
}

// ─────────────────────────────────────────────────────────────────────────────
// MACHINES
// ─────────────────────────────────────────────────────────────────────────────

export async function createMachine(input: {
  name: string;
  plate?: string | null;
  type?: string | null;
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
  input: Partial<Pick<Machine, "name" | "plate" | "type" | "tracking_type" | "notes" | "active">>
) {
  const supabase = createClient();
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim().toUpperCase();
  if (input.plate !== undefined) patch.plate = input.plate?.toString().trim().toUpperCase() || null;
  if (input.type !== undefined) patch.type = input.type?.toString().trim() || null;
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

  const { data, error } = await supabase
    .from("products")
    .insert({
      name: name.toUpperCase(),
      unit: input.unit?.trim() || "m³",
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
  if (input.unit !== undefined) patch.unit = input.unit?.trim() || "m³";
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
  pickup_location_id?: string | null;
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
    pickup_location_id: input.pickup_location_id || null,
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
  if (!["entrega_material", "prestacao_servico", "frete"].includes(input.type))
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

export async function createServiceOrder(input: ServiceOrderInput) {
  const err = validate(input);
  if (err) return { error: err };

  const supabase = createClient();
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
  revalidate();
  return { ok: true };
}

/**
 * Início de OS pelo técnico (viagem/diária): registra o km do veículo e a
 * hora de saída/início junto com a mudança para "em andamento".
 */
export async function startServiceOrder(
  id: string,
  options: { kmStart?: number | null; startTime?: string | null } = {}
) {
  const supabase = createClient();
  const patch: Record<string, unknown> = { status: "em_andamento" };
  if (options.kmStart != null) patch.km_start = options.kmStart;
  if (options.startTime?.trim()) patch.start_time = options.startTime.trim();

  const { error } = await supabase.from("service_orders").update(patch).eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

/**
 * Registro de viagem pelo técnico (modo "por viagem"): cada viagem concluída
 * incrementa o contador da OS em andamento e grava o horário no log
 * (service_order_trips). O frete (viagens × valor) é calculado no fechamento.
 */
export async function registerTrip(
  id: string,
  delta: 1 | -1 = 1,
  tripTime?: string | null
) {
  const supabase = createClient();

  // Incremento atômico no banco (evita perder viagens em toques rápidos).
  const { data: trips, error } = await supabase.rpc("register_os_trip", {
    p_order_id: id,
    p_delta: delta,
  });
  if (error || trips == null) return { error: error?.message ?? "OS não encontrada" };

  // Log de horários (best-effort): não quebra a marcação caso a tabela ainda
  // não exista (migration 016 não aplicada no Supabase).
  if (delta === 1) {
    const { error: logErr } = await supabase.from("service_order_trips").insert({
      service_order_id: id,
      trip_number: trips,
      trip_time: tripTime?.trim() || null,
    });
    if (logErr) console.error("Falha ao gravar horário da viagem:", logErr.message);
  } else {
    const { data: last } = await supabase
      .from("service_order_trips")
      .select("id")
      .eq("service_order_id", id)
      .order("trip_number", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last) await supabase.from("service_order_trips").delete().eq("id", last.id);
  }

  revalidatePath("/operador");
  revalidatePath("/operacoes");
  return { ok: true, trips };
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
  } = {}
) {
  const supabase = createClient();

  const trimmed = receivedBy.trim();
  if (!trimmed) return { error: "Informe o nome de quem recebeu" };

  // Busca a OS para saber se é prestação de serviço por horímetro a fechar.
  const { data: order, error: fetchErr } = await supabase
    .from("service_orders")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !order) return { error: "OS não encontrada" };

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

  // ── Fechamento de OS de frete com modo de cobrança ────────────────────────
  // viagem: viagens × valor · km: km rodado × R$/km · diária: valor fixo.
  // O item de frete (is_freight) é recriado aqui para refletir o cálculo final.
  // Keyed no billing_mode (não no type) para cobrir OS antigas de entrega de
  // material que usavam cobrança antes do tipo "frete" existir.
  const mode = order.type !== "prestacao_servico" ? order.billing_mode : null;
  if (mode) {
    // Assinatura obrigatória só quando há cliente externo recebendo; em frete
    // interno (entre obras da própria empresa) não há terceiro para assinar.
    if (order.freight_type === "cliente" && !options.signature)
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

  const { error } = await supabase
    .from("service_orders")
    .update(patch)
    .eq("id", id);

  if (error) return { error: error.message };

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

  revalidatePath("/operador");
  revalidatePath("/operacoes");
  revalidatePath("/dashboard");
  revalidatePath("/contas");
  return { ok: true };
}
