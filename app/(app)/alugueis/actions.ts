"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

  guarantor_name?: string | null;
  guarantor_document?: string | null;
  guarantor_rg?: string | null;
  guarantor_phone?: string | null;
  guarantor_address?: string | null;

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

    guarantor_name: clean(input.guarantor_name),
    guarantor_document: raw(input.guarantor_document),
    guarantor_rg: clean(input.guarantor_rg),
    guarantor_phone: raw(input.guarantor_phone),
    guarantor_address: clean(input.guarantor_address),

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
  revalidate();
  return { ok: true };
}

export async function deleteRentalContract(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("rental_contracts").delete().eq("id", id);
  if (error) return { error: aluguelError(error) };
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
