"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { descartarAssinatura } from "@/lib/documentos-assinados";
import type { RentalContractStatus } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// ALUGUÉIS — imóveis, contratos e a baixa do aluguel de cada mês
// ─────────────────────────────────────────────────────────────────────────────
// Como no resto do sistema (obra, animais, frota), o que se lança aqui NÃO vira
// lançamento no módulo Contas: é registro e relatório dentro de Aluguéis.

function revalidate() {
  revalidatePath("/alugueis");
}

/** Texto de cadastro: sempre em CAIXA ALTA, vazio vira null. */
function clean(s?: string | null): string | null {
  const v = s?.trim();
  return v ? v.toUpperCase() : null;
}

/** Texto que NÃO sobe para caixa alta (e-mail, observação do modelo). */
function raw(s?: string | null): string | null {
  const v = s?.trim();
  return v ? v : null;
}

/** Dinheiro sempre positivo, com 2 casas. */
function money(v?: number | null): number {
  const n = Math.abs(Number(v ?? 0));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

/** Percentual opcional (multa, juros). */
function percent(v?: number | null): number | null {
  if (v === null || v === undefined) return null;
  const n = Math.abs(Number(v));
  if (isNaN(n) || n === 0) return null;
  return Math.round(n * 100) / 100;
}

function inteiro(v?: number | null): number | null {
  if (v === null || v === undefined) return null;
  const n = Math.floor(Math.abs(Number(v)));
  return isNaN(n) || n === 0 ? null : n;
}

/** Erro de tabela que ainda não existe → recado que diz o que fazer. */
function aluguelError(error: { code?: string; message: string }): string {
  // o endereço em partes do inquilino e do fiador é da 113
  if (/(tenant|guarantor)_(street|number|complement|district|city|zip)/.test(error.message))
    return "Rode a migration 113 no Supabase para guardar o endereço em partes";
  if (error.message.includes("power_account"))
    return "Rode a migration 126 no Supabase para guardar a conta contrato do imóvel";
  if (error.code === "42P01")
    return "Rode a migration 078 no Supabase para usar o módulo Aluguéis";
  if (error.code === "42703")
    return "Rode a migration 078 no Supabase — falta uma coluna do módulo Aluguéis";
  return error.message;
}

// ─────────────────────────────────────────────────────────────────────────────
// IMÓVEL
// ─────────────────────────────────────────────────────────────────────────────
// O CÓDIGO não vem daqui: quem numera é o banco, na ordem de cadastro.

export interface RentalPropertyInput {
  name?: string | null;
  kind?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  registration?: string | null;
  iptu_code?: string | null;
  water_code?: string | null;
  power_code?: string | null;
  power_account?: string | null;
  notes?: string | null;
  active?: boolean;
}

function propertyRow(input: RentalPropertyInput) {
  return {
    name: clean(input.name),
    kind: input.kind?.trim() || "casa",
    street: clean(input.street),
    number: clean(input.number),
    complement: clean(input.complement),
    district: clean(input.district),
    city: clean(input.city),
    state: clean(input.state),
    zip: raw(input.zip),
    registration: clean(input.registration),
    iptu_code: clean(input.iptu_code),
    water_code: clean(input.water_code),
    power_code: clean(input.power_code),
    power_account: raw(input.power_account),
    notes: clean(input.notes),
    ...(input.active === undefined ? {} : { active: input.active }),
  };
}

export async function createRentalProperty(input: RentalPropertyInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!clean(input.street) && !clean(input.name))
    return { error: "Escreva pelo menos a rua ou um apelido para o imóvel" };

  const { error } = await supabase
    .from("rental_properties")
    .insert({ ...propertyRow(input), created_by: user.id });

  if (error) return { error: aluguelError(error) };
  revalidate();
  return { ok: true };
}

export async function updateRentalProperty(id: string, input: RentalPropertyInput) {
  const supabase = createClient();

  if (!clean(input.street) && !clean(input.name))
    return { error: "Escreva pelo menos a rua ou um apelido para o imóvel" };

  const { error } = await supabase
    .from("rental_properties")
    .update(propertyRow(input))
    .eq("id", id);

  if (error) return { error: aluguelError(error) };
  revalidate();
  return { ok: true };
}

/** Apagar o imóvel leva junto os contratos e as baixas dele. */
export async function deleteRentalProperty(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("rental_properties").delete().eq("id", id);
  if (error) return { error: aluguelError(error) };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO
// ─────────────────────────────────────────────────────────────────────────────

export interface RentalContractInput {
  property_id: string;

  tenant_name: string;
  tenant_document?: string | null;
  tenant_rg?: string | null;
  tenant_birthplace?: string | null;
  tenant_nationality?: string | null;
  tenant_marital_status?: string | null;
  tenant_profession?: string | null;
  tenant_phone?: string | null;
  tenant_email?: string | null;
  tenant_address?: string | null;
  tenant_street?: string | null;
  tenant_number?: string | null;
  tenant_complement?: string | null;
  tenant_district?: string | null;
  tenant_city?: string | null;
  tenant_zip?: string | null;

  guarantor_name?: string | null;
  guarantor_document?: string | null;
  guarantor_rg?: string | null;
  guarantor_phone?: string | null;
  guarantor_address?: string | null;
  guarantor_street?: string | null;
  guarantor_number?: string | null;
  guarantor_complement?: string | null;
  guarantor_district?: string | null;
  guarantor_city?: string | null;
  guarantor_zip?: string | null;

  monthly_amount: number;
  due_day: number;
  deposit_amount?: number | null;
  late_fee_percent?: number | null;
  interest_percent?: number | null;
  readjust_index?: string | null;

  start_date: string;
  end_date?: string | null;
  months?: number | null;

  purpose?: string | null;
  signed_at?: string | null;
  forum_city?: string | null;

  status?: RentalContractStatus;
  notes?: string | null;
}

function contractRow(input: RentalContractInput) {
  const dia = Math.min(31, Math.max(1, Math.floor(Number(input.due_day) || 5)));
  return {
    property_id: input.property_id,

    tenant_name: clean(input.tenant_name),
    tenant_document: raw(input.tenant_document),
    tenant_rg: clean(input.tenant_rg),
    tenant_birthplace: clean(input.tenant_birthplace),
    tenant_nationality: clean(input.tenant_nationality),
    tenant_marital_status: clean(input.tenant_marital_status),
    tenant_profession: clean(input.tenant_profession),
    tenant_phone: raw(input.tenant_phone),
    tenant_email: raw(input.tenant_email),
    tenant_address: clean(input.tenant_address),
    tenant_street: clean(input.tenant_street),
    tenant_number: clean(input.tenant_number),
    tenant_complement: clean(input.tenant_complement),
    tenant_district: clean(input.tenant_district),
    tenant_city: clean(input.tenant_city),
    tenant_zip: raw(input.tenant_zip),

    guarantor_name: clean(input.guarantor_name),
    guarantor_document: raw(input.guarantor_document),
    guarantor_rg: clean(input.guarantor_rg),
    guarantor_phone: raw(input.guarantor_phone),
    guarantor_address: clean(input.guarantor_address),
    guarantor_street: clean(input.guarantor_street),
    guarantor_number: clean(input.guarantor_number),
    guarantor_complement: clean(input.guarantor_complement),
    guarantor_district: clean(input.guarantor_district),
    guarantor_city: clean(input.guarantor_city),
    guarantor_zip: raw(input.guarantor_zip),

    monthly_amount: money(input.monthly_amount),
    due_day: dia,
    deposit_amount: money(input.deposit_amount),
    late_fee_percent: percent(input.late_fee_percent),
    interest_percent: percent(input.interest_percent),
    readjust_index: clean(input.readjust_index),

    start_date: input.start_date,
    end_date: input.end_date?.trim() || null,
    months: inteiro(input.months),

    purpose: input.purpose?.trim() || "residencial",
    signed_at: input.signed_at?.trim() || null,
    forum_city: clean(input.forum_city),

    status: input.status === "encerrado" ? "encerrado" : "ativo",
    notes: clean(input.notes),
  };
}

function contractInvalido(input: RentalContractInput): string | null {
  if (!input.property_id) return "Escolha o imóvel";
  if (!clean(input.tenant_name)) return "Escreva o nome do inquilino";
  if (money(input.monthly_amount) <= 0) return "Informe o valor do aluguel";
  if (!input.start_date) return "Informe o início da locação";
  return null;
}

export async function createRentalContract(input: RentalContractInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const falta = contractInvalido(input);
  if (falta) return { error: falta };

  const { error } = await supabase
    .from("rental_contracts")
    .insert({ ...contractRow(input), created_by: user.id });

  if (error) return { error: aluguelError(error) };
  revalidate();
  return { ok: true };
}

export async function updateRentalContract(id: string, input: RentalContractInput) {
  const supabase = createClient();

  const falta = contractInvalido(input);
  if (falta) return { error: falta };

  const { error } = await supabase
    .from("rental_contracts")
    .update(contractRow(input))
    .eq("id", id);

  if (error) return { error: aluguelError(error) };
  // editado: o PDF assinado tem o texto antigo
  await descartarAssinatura("aluguel", id);
  revalidate();
  return { ok: true };
}

export async function deleteRentalContract(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("rental_contracts").delete().eq("id", id);
  if (error) return { error: aluguelError(error) };
  await descartarAssinatura("aluguel", id);
  revalidate();
  return { ok: true };
}

/** Encerrar (ou reabrir) o contrato sem abrir o cadastro inteiro. */
export async function setRentalContractStatus(id: string, status: RentalContractStatus) {
  const supabase = createClient();
  const { error } = await supabase
    .from("rental_contracts")
    .update({ status: status === "encerrado" ? "encerrado" : "ativo" })
    .eq("id", id);
  if (error) return { error: aluguelError(error) };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// A BAIXA DO ALUGUEL DE UM MÊS
// ─────────────────────────────────────────────────────────────────────────────
// Um contrato + um mês = uma linha. Dar baixa de novo CORRIGE o mês, não
// duplica. Desfazer a baixa apaga a linha: o mês volta a aparecer em aberto.

export interface RentalPaymentInput {
  contract_id: string;
  /** O mês de referência (YYYY-MM-01). */
  competencia: string;
  /** O vencimento daquele mês, como estava combinado. */
  due_date: string;
  /** O quanto era devido. */
  amount: number;
  paid_at?: string | null;
  paid_amount?: number | null;
  method?: string | null;
  notes?: string | null;
}

export async function darBaixaAluguel(input: RentalPaymentInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!input.contract_id) return { error: "Contrato não encontrado" };
  if (!input.competencia || !input.due_date) return { error: "Mês de referência inválido" };

  const pago = money(input.paid_amount);
  if (input.paid_at && pago <= 0) return { error: "Informe quanto o inquilino pagou" };

  const { error } = await supabase.from("rental_payments").upsert(
    {
      contract_id: input.contract_id,
      competencia: input.competencia,
      due_date: input.due_date,
      amount: money(input.amount),
      paid_at: input.paid_at?.trim() || null,
      paid_amount: pago,
      method: clean(input.method),
      notes: clean(input.notes),
      created_by: user.id,
    },
    { onConflict: "contract_id,competencia" }
  );

  if (error) return { error: aluguelError(error) };
  revalidate();
  return { ok: true };
}

/** Desfaz a baixa: o mês volta a aparecer em aberto na tela. */
export async function desfazerBaixaAluguel(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("rental_payments").delete().eq("id", id);
  if (error) return { error: aluguelError(error) };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// O MODELO DO CONTRATO
// ─────────────────────────────────────────────────────────────────────────────

export async function salvarModeloContrato(id: string | null, body: string, name?: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!body?.trim()) return { error: "O modelo não pode ficar vazio" };

  if (id) {
    const { error } = await supabase
      .from("rental_contract_templates")
      .update({
        body,
        ...(name?.trim() ? { name: name.trim() } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return { error: aluguelError(error) };
  } else {
    const { error } = await supabase.from("rental_contract_templates").insert({
      name: name?.trim() || "Contrato de locação",
      body,
      created_by: user.id,
    });
    if (error) return { error: aluguelError(error) };
  }

  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO DE COMPRA E VENDA DE IMÓVEL (migration 110)
// ─────────────────────────────────────────────────────────────────────────────
// A compradora é sempre a PRODUMAR, então aqui só se guarda o vendedor, o
// imóvel e as condições. Quase tudo é opcional de propósito: o que ficar em
// branco sai no papel como linha para completar à caneta.

export interface PropertySaleContractInput {
  /** Quem compra (115) — vazio = a PRODUMAR. */
  buyer_id?: string | null;
  seller_name?: string | null;
  seller_gender?: string | null;
  seller_nationality?: string | null;
  seller_marital_status?: string | null;
  seller_property_regime?: string | null;
  seller_profession?: string | null;
  seller_rg?: string | null;
  seller_document?: string | null;
  seller_address?: string | null;
  seller_street?: string | null;
  seller_number?: string | null;
  seller_complement?: string | null;
  seller_district?: string | null;
  seller_city?: string | null;
  seller_zip?: string | null;
  seller_phone?: string | null;
  seller_email?: string | null;

  spouse_name?: string | null;
  spouse_gender?: string | null;
  spouse_nationality?: string | null;
  spouse_profession?: string | null;
  spouse_rg?: string | null;
  spouse_document?: string | null;

  property_kind?: string | null;
  property_address?: string | null;
  property_street?: string | null;
  property_number?: string | null;
  property_complement?: string | null;
  property_district?: string | null;
  property_city?: string | null;
  property_zip?: string | null;
  property_area?: string | null;
  property_description?: string | null;
  property_front?: string | null;
  property_back?: string | null;
  property_right?: string | null;
  property_left?: string | null;
  property_front_with?: string | null;
  property_back_with?: string | null;
  property_right_with?: string | null;
  property_left_with?: string | null;
  property_improvements?: string | null;
  property_registration?: string | null;
  property_registry_office?: string | null;
  property_iptu_code?: string | null;

  price?: number | null;
  payment_terms?: string | null;
  payment_mode?: string | null;
  down_payment?: number | null;
  down_payment_date?: string | null;
  installments?: number | null;
  installment_amount?: number | null;
  first_installment_amount?: number | null;
  different_installment_number?: number | null;
  first_due_date?: string | null;
  payment_method?: string | null;
  seller_bank_info?: string | null;
  seller_bank_holder_name?: string | null;
  seller_bank_holder_document?: string | null;

  possession_date?: string | null;
  deed_days?: number | null;
  penalty_percent?: number | null;

  forum_city?: string | null;
  signed_at?: string | null;
  notes?: string | null;
}

/** "m" / "f" ou nada — homem ou mulher, para a palavra certa no contrato (116). */
function genero(v?: string | null): "m" | "f" | null {
  const t = v?.trim().toLowerCase();
  return t === "m" || t === "f" ? t : null;
}

type ModoDePagamento = "avista" | "entrada_parcelas" | "parcelado" | "outro";

/** Como o imóvel é pago (117) — fora da lista, fica vazio (contrato antigo). */
function modoDePagamento(v?: string | null): ModoDePagamento | null {
  return v === "avista" || v === "entrada_parcelas" || v === "parcelado" || v === "outro" ? v : null;
}

function comParcelas(v?: string | null): boolean {
  return v === "entrada_parcelas" || v === "parcelado";
}

/** A tabela vem da migration 110 — sem ela o erro do Postgres não diz nada. */
function compraVendaError(error: { code?: string; message: string }): string {
  if (/_gender\b|\bgender\b/.test(error.message))
    return "Rode a migration 116 no Supabase para guardar se é homem ou mulher";
  if (/buyer_id|property_buyers/.test(error.message))
    return "Rode a migration 115 no Supabase para escolher quem compra o imóvel";
  // as partes do endereço (rua, número, bairro...) são da 112
  if (/seller_bank_holder/.test(error.message))
    return "Rode a migration 120 no Supabase para guardar o titular da conta";
  if (/seller_bank_info/.test(error.message))
    return "Rode a migration 119 no Supabase para guardar a chave PIX ou a conta do vendedor";
  if (/different_installment_number/.test(error.message))
    return "Rode a migration 118 no Supabase para escolher qual parcela é diferente";
  if (/payment_mode|down_payment|installment|first_due_date|payment_method/.test(error.message))
    return "Rode a migration 117 no Supabase para guardar a entrada e as parcelas";
  if (/property_(front|back|right|left|improvements)/.test(error.message))
    return "Rode a migration 114 no Supabase para guardar as medidas e as divisas do imóvel";
  if (/(seller|property)_(street|number|complement|district|city|zip)/.test(error.message))
    return "Rode a migration 112 no Supabase para guardar o endereço em partes";
  if (error.code === "42P01" || error.message.includes("property_sale_contracts"))
    return "Rode a migration 110 no Supabase para guardar o contrato de compra e venda";
  return error.message;
}

/** Titular da conta quando não é o vendedor (120) — sem chave/conta, nada. */
function titularDaConta(input: PropertySaleContractInput) {
  const comConta = !!input.payment_mode && input.payment_mode !== "outro" && !!raw(input.seller_bank_info);
  const nome = comConta ? clean(input.seller_bank_holder_name) : null;
  return {
    seller_bank_holder_name: nome,
    seller_bank_holder_document: nome ? raw(input.seller_bank_holder_document) : null,
  };
}

function saleRow(input: PropertySaleContractInput) {
  return {
    buyer_id: input.buyer_id || null,
    seller_name: clean(input.seller_name),
    seller_gender: genero(input.seller_gender),
    seller_nationality: clean(input.seller_nationality),
    seller_marital_status: clean(input.seller_marital_status),
    seller_property_regime: clean(input.seller_property_regime),
    seller_profession: clean(input.seller_profession),
    seller_rg: clean(input.seller_rg),
    seller_document: raw(input.seller_document),
    seller_address: clean(input.seller_address),
    seller_street: clean(input.seller_street),
    seller_number: clean(input.seller_number),
    seller_complement: clean(input.seller_complement),
    seller_district: clean(input.seller_district),
    seller_city: clean(input.seller_city),
    seller_zip: raw(input.seller_zip),
    seller_phone: raw(input.seller_phone),
    seller_email: raw(input.seller_email),

    spouse_name: clean(input.spouse_name),
    spouse_gender: genero(input.spouse_gender),
    spouse_nationality: clean(input.spouse_nationality),
    spouse_profession: clean(input.spouse_profession),
    spouse_rg: clean(input.spouse_rg),
    spouse_document: raw(input.spouse_document),

    property_kind: clean(input.property_kind),
    property_address: clean(input.property_address),
    property_street: clean(input.property_street),
    property_number: clean(input.property_number),
    property_complement: clean(input.property_complement),
    property_district: clean(input.property_district),
    property_city: clean(input.property_city),
    property_zip: raw(input.property_zip),
    property_area: raw(input.property_area),
    // texto corrido do contrato: fica como foi escrito, sem caixa alta
    property_description: raw(input.property_description),
    property_front: raw(input.property_front),
    property_back: raw(input.property_back),
    property_right: raw(input.property_right),
    property_left: raw(input.property_left),
    property_front_with: clean(input.property_front_with),
    property_back_with: clean(input.property_back_with),
    property_right_with: clean(input.property_right_with),
    property_left_with: clean(input.property_left_with),
    property_improvements: raw(input.property_improvements),
    property_registration: clean(input.property_registration),
    property_registry_office: raw(input.property_registry_office),
    property_iptu_code: clean(input.property_iptu_code),

    price: money(input.price),
    payment_terms: raw(input.payment_terms),
    payment_mode: modoDePagamento(input.payment_mode),
    // entrada só existe no "entrada + parcelas"; parcelas, quando há parcelas
    down_payment: input.payment_mode === "entrada_parcelas" ? money(input.down_payment) || null : null,
    down_payment_date:
      input.payment_mode === "avista" || input.payment_mode === "entrada_parcelas"
        ? input.down_payment_date?.trim() || null
        : null,
    installments: comParcelas(input.payment_mode) ? inteiro(input.installments) : null,
    installment_amount: comParcelas(input.payment_mode) ? money(input.installment_amount) || null : null,
    first_installment_amount: comParcelas(input.payment_mode)
      ? money(input.first_installment_amount) || null
      : null,
    different_installment_number:
      comParcelas(input.payment_mode) && money(input.first_installment_amount) > 0
        ? inteiro(input.different_installment_number) ?? 1
        : null,
    first_due_date: comParcelas(input.payment_mode) ? input.first_due_date?.trim() || null : null,
    payment_method: input.payment_mode && input.payment_mode !== "outro" ? clean(input.payment_method) : null,
    // chave PIX pode ser e-mail: fica como foi digitada
    seller_bank_info: input.payment_mode && input.payment_mode !== "outro" ? raw(input.seller_bank_info) : null,
    // conta de outra pessoa: o titular só vale com a chave/conta preenchida
    ...titularDaConta(input),

    possession_date: input.possession_date?.trim() || null,
    deed_days: inteiro(input.deed_days),
    penalty_percent: percent(input.penalty_percent),

    forum_city: raw(input.forum_city),
    signed_at: input.signed_at?.trim() || null,
    notes: raw(input.notes),
    updated_at: new Date().toISOString(),
  };
}

export async function salvarContratoCompraVenda(
  id: string | null,
  input: PropertySaleContractInput
): Promise<{ error: string } | { ok: true; id: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (id) {
    const { error } = await supabase
      .from("property_sale_contracts")
      .update(saleRow(input))
      .eq("id", id);
    if (error) return { error: compraVendaError(error) };
    // editado: o PDF assinado tem o texto antigo
    await descartarAssinatura("compra_venda", id);
    revalidate();
    return { ok: true, id };
  }

  const { data, error } = await supabase
    .from("property_sale_contracts")
    .insert({ ...saleRow(input), created_by: user.id })
    .select("id")
    .single();
  if (error || !data) return { error: compraVendaError(error ?? { message: "Erro ao salvar" }) };
  revalidate();
  return { ok: true, id: data.id as string };
}

export async function apagarContratoCompraVenda(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("property_sale_contracts").delete().eq("id", id);
  if (error) return { error: compraVendaError(error) };
  await descartarAssinatura("compra_venda", id);
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPRADORES DE IMÓVEL (migration 115)
// ─────────────────────────────────────────────────────────────────────────────
// Outra empresa ou uma pessoa física comprando o imóvel. Fica num cadastro para
// o próximo contrato não ter de digitar tudo de novo. Sem comprador escolhido,
// a compradora do contrato é a PRODUMAR.

export interface PropertyBuyerInput {
  kind: "pj" | "pf";
  name: string;
  gender?: string | null;
  document?: string | null;
  rg?: string | null;
  nationality?: string | null;
  marital_status?: string | null;
  property_regime?: string | null;
  profession?: string | null;
  street?: string | null;
  number?: string | null;
  complement?: string | null;
  district?: string | null;
  city?: string | null;
  zip?: string | null;
  phone?: string | null;
  email?: string | null;
  rep_name?: string | null;
  rep_document?: string | null;
  rep_rg?: string | null;
  rep_role?: string | null;
}

function compradorError(error: { code?: string; message: string }): string {
  if (/\bgender\b/.test(error.message))
    return "Rode a migration 116 no Supabase para guardar se é homem ou mulher";
  if (error.code === "42P01" || error.message.includes("property_buyers"))
    return "Rode a migration 115 no Supabase para cadastrar compradores";
  // a trava "on delete restrict": o comprador está em algum contrato
  if (error.code === "23503")
    return "Este comprador está em um contrato de compra e venda — apague ou troque o comprador do contrato antes";
  return error.message;
}

function buyerRow(input: PropertyBuyerInput) {
  const pj = input.kind === "pj";
  return {
    kind: pj ? "pj" : "pf",
    name: clean(input.name),
    gender: pj ? null : genero(input.gender),
    document: raw(input.document),
    // pessoa física tem RG, estado civil e profissão; empresa tem representante
    rg: pj ? null : clean(input.rg),
    nationality: pj ? null : clean(input.nationality),
    marital_status: pj ? null : clean(input.marital_status),
    property_regime: pj ? null : clean(input.property_regime),
    profession: pj ? null : clean(input.profession),
    street: clean(input.street),
    number: clean(input.number),
    complement: clean(input.complement),
    district: clean(input.district),
    city: clean(input.city),
    zip: raw(input.zip),
    phone: raw(input.phone),
    email: raw(input.email),
    rep_name: pj ? clean(input.rep_name) : null,
    rep_document: pj ? raw(input.rep_document) : null,
    rep_rg: pj ? clean(input.rep_rg) : null,
    rep_role: pj ? clean(input.rep_role) : null,
    updated_at: new Date().toISOString(),
  };
}

export async function salvarComprador(
  id: string | null,
  input: PropertyBuyerInput
): Promise<{ error: string } | { ok: true; id: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };
  if (!clean(input.name))
    return { error: input.kind === "pj" ? "Escreva a razão social da empresa" : "Escreva o nome do comprador" };

  if (id) {
    const { error } = await supabase.from("property_buyers").update(buyerRow(input)).eq("id", id);
    if (error) return { error: compradorError(error) };
    revalidate();
    return { ok: true, id };
  }

  const { data, error } = await supabase
    .from("property_buyers")
    .insert({ ...buyerRow(input), created_by: user.id })
    .select("id")
    .single();
  if (error || !data) return { error: compradorError(error ?? { message: "Erro ao salvar" }) };
  revalidate();
  return { ok: true, id: data.id as string };
}

export async function apagarComprador(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("property_buyers").delete().eq("id", id);
  if (error) return { error: compradorError(error) };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCURAÇÕES (migration 121)
// ─────────────────────────────────────────────────────────────────────────────
// Ex.: a troca de titularidade da conta de energia na EQUATORIAL. Outorgante é
// quem dá os poderes (o titular da conta); outorgado, quem vai resolver.

export interface PowerOfAttorneyInput {
  grantor_name?: string | null;
  grantor_gender?: string | null;
  grantor_nationality?: string | null;
  grantor_marital_status?: string | null;
  grantor_profession?: string | null;
  grantor_birthplace?: string | null;
  grantor_rg?: string | null;
  grantor_document?: string | null;
  grantor_street?: string | null;
  grantor_number?: string | null;
  grantor_complement?: string | null;
  grantor_district?: string | null;
  grantor_city?: string | null;
  grantor_zip?: string | null;

  attorney_name?: string | null;
  attorney_gender?: string | null;
  attorney_nationality?: string | null;
  attorney_marital_status?: string | null;
  attorney_profession?: string | null;
  attorney_rg?: string | null;
  attorney_document?: string | null;
  attorney_street?: string | null;
  attorney_number?: string | null;
  attorney_complement?: string | null;
  attorney_district?: string | null;
  attorney_city?: string | null;
  attorney_zip?: string | null;

  grantor_kind?: string | null;
  grantor_rep_name?: string | null;
  grantor_rep_role?: string | null;
  grantor_rep_document?: string | null;
  grantor_rep_rg?: string | null;
  attorney_kind?: string | null;
  attorney_rep_name?: string | null;
  attorney_rep_role?: string | null;
  attorney_rep_document?: string | null;
  attorney_rep_rg?: string | null;

  company?: string | null;
  service?: string | null;
  account_number?: string | null;
  validity?: string | null;
  city?: string | null;
  signed_at?: string | null;
  notes?: string | null;
}

function procuracaoError(error: { code?: string; message: string }): string {
  if (/_kind|_rep_/.test(error.message)) return "Rode a migration 127 no Supabase para a procuração de empresa";
  if (error.code === "42P01" || error.code === "42703" || error.message.includes("power_of_attorneys"))
    return "Rode a migration 121 no Supabase para guardar as procurações";
  return error.message;
}

function procuracaoRow(input: PowerOfAttorneyInput) {
  return {
    grantor_name: clean(input.grantor_name),
    grantor_gender: genero(input.grantor_gender),
    grantor_nationality: clean(input.grantor_nationality),
    grantor_marital_status: clean(input.grantor_marital_status),
    grantor_profession: clean(input.grantor_profession),
    grantor_birthplace: clean(input.grantor_birthplace),
    grantor_rg: clean(input.grantor_rg),
    grantor_document: raw(input.grantor_document),
    grantor_street: clean(input.grantor_street),
    grantor_number: clean(input.grantor_number),
    grantor_complement: clean(input.grantor_complement),
    grantor_district: clean(input.grantor_district),
    grantor_city: clean(input.grantor_city),
    grantor_zip: raw(input.grantor_zip),

    attorney_name: clean(input.attorney_name),
    attorney_gender: genero(input.attorney_gender),
    attorney_nationality: clean(input.attorney_nationality),
    attorney_marital_status: clean(input.attorney_marital_status),
    attorney_profession: clean(input.attorney_profession),
    attorney_rg: clean(input.attorney_rg),
    attorney_document: raw(input.attorney_document),
    attorney_street: clean(input.attorney_street),
    attorney_number: clean(input.attorney_number),
    attorney_complement: clean(input.attorney_complement),
    attorney_district: clean(input.attorney_district),
    attorney_city: clean(input.attorney_city),
    attorney_zip: raw(input.attorney_zip),

    // empresa: name = razão social, document = CNPJ, e quem a representa
    grantor_kind: input.grantor_kind === "pj" ? "pj" : "pf",
    grantor_rep_name: input.grantor_kind === "pj" ? clean(input.grantor_rep_name) : null,
    grantor_rep_role: input.grantor_kind === "pj" ? clean(input.grantor_rep_role) : null,
    grantor_rep_document: input.grantor_kind === "pj" ? raw(input.grantor_rep_document) : null,
    grantor_rep_rg: input.grantor_kind === "pj" ? clean(input.grantor_rep_rg) : null,
    attorney_kind: input.attorney_kind === "pj" ? "pj" : "pf",
    attorney_rep_name: input.attorney_kind === "pj" ? clean(input.attorney_rep_name) : null,
    attorney_rep_role: input.attorney_kind === "pj" ? clean(input.attorney_rep_role) : null,
    attorney_rep_document: input.attorney_kind === "pj" ? raw(input.attorney_rep_document) : null,
    attorney_rep_rg: input.attorney_kind === "pj" ? clean(input.attorney_rep_rg) : null,

    company: clean(input.company),
    service: clean(input.service),
    account_number: raw(input.account_number),
    // texto corrido da folha: fica como foi escrito
    validity: raw(input.validity),
    city: raw(input.city),
    signed_at: input.signed_at?.trim() || null,
    notes: raw(input.notes),
    updated_at: new Date().toISOString(),
  };
}

export async function salvarProcuracao(
  id: string | null,
  input: PowerOfAttorneyInput,
  /** Feita de um contrato de aluguel: o imóvel sem conta contrato fica com a digitada. */
  imovelId?: string | null
): Promise<{ error: string } | { ok: true; id: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  // a conta contrato digitada na procuração vai para o cadastro do imóvel (só
  // se ele ainda não tiver uma): na próxima, já vem pronta. Falhar aqui não
  // impede a procuração de ser salva.
  const conta = raw(input.account_number);
  if (imovelId && conta && !/CAEMA/i.test(input.company ?? "")) {
    await supabase
      .from("rental_properties")
      .update({ power_account: conta })
      .eq("id", imovelId)
      .is("power_account", null);
  }

  if (id) {
    const { error } = await supabase.from("power_of_attorneys").update(procuracaoRow(input)).eq("id", id);
    if (error) return { error: procuracaoError(error) };
    // editada: o PDF assinado tem o texto antigo
    await descartarAssinatura("procuracao", id);
    revalidate();
    return { ok: true, id };
  }

  const { data, error } = await supabase
    .from("power_of_attorneys")
    .insert({ ...procuracaoRow(input), created_by: user.id })
    .select("id")
    .single();
  if (error || !data) return { error: procuracaoError(error ?? { message: "Erro ao salvar" }) };
  revalidate();
  return { ok: true, id: data.id as string };
}

export async function apagarProcuracao(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("power_of_attorneys").delete().eq("id", id);
  if (error) return { error: procuracaoError(error) };
  await descartarAssinatura("procuracao", id);
  revalidate();
  return { ok: true };
}
