"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  MACHINE_SERVICO_KINDS,
  type MachineServicoKind,
  type MachineServicoStatus,
} from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// FROTA — o serviço e a despesa de cada máquina/veículo (migration 073)
// ─────────────────────────────────────────────────────────────────────────────
// Nada aqui vira lançamento no módulo Contas: é registro e relatório dentro da
// Frota, como a despesa da obra (067) e a dos animais (072).

function revalidate() {
  revalidatePath("/frota");
  // o cadastro do veículo é o mesmo de Operações
  revalidatePath("/cadastros-operacionais");
}

/** Texto de cadastro: sempre em CAIXA ALTA, vazio vira null. */
function clean(s?: string | null): string | null {
  const v = s?.trim();
  return v ? v.toUpperCase() : null;
}

/** Dinheiro sempre positivo, com 2 casas. */
function money(v?: number | null): number {
  const n = Math.abs(Number(v ?? 0));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

/** Quantidade positiva com 2 casas (dias, horas, viagens, km). */
function qty(v?: number | null): number {
  const n = Math.abs(Number(v ?? 0));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

/** Número opcional (litros, marcação do hodômetro): 0 ou vazio vira null. */
function optional(v?: number | null): number | null {
  if (v === null || v === undefined) return null;
  const n = Math.abs(Number(v));
  if (isNaN(n) || n === 0) return null;
  return Math.round(n * 1000) / 1000;
}

/** Erro de tabela que ainda não existe → recado que diz o que fazer. */
function frotaError(error: { code?: string; message: string }): string {
  if (error.code === "42P01" || error.message.includes("machine_servicos"))
    return "Rode a migration 073 no Supabase para usar a ficha das máquinas";
  if (error.message.includes("machine_despesas"))
    return "Rode a migration 073 no Supabase para lançar despesas do veículo";
  // coluna que não existe: é a `status`, que só entra na 074
  if (error.code === "42703")
    return "Rode a migration 074 no Supabase para a OS ter situação (aberta/concluída)";
  return error.message;
}

function normalizeKind(kind?: string | null): MachineServicoKind {
  const found = MACHINE_SERVICO_KINDS.find((k) => k.value === kind);
  return found ? found.value : "diaria";
}

/** A OS nasce ABERTA — é ela que fica verde no calendário do veículo. */
function normalizeStatus(status?: string | null): MachineServicoStatus {
  return status === "concluida" ? "concluida" : "aberta";
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVIÇO — a diária, a hora, a viagem, o km ou o valor fechado
// ─────────────────────────────────────────────────────────────────────────────

export interface MachineServicoInput {
  machine_id: string;
  service_date?: string | null;
  kind: MachineServicoKind;
  contratante?: string | null;
  description?: string | null;
  origin?: string | null;
  destination?: string | null;
  quantity: number;
  unit_price: number;
  operator?: string | null;
  internal?: boolean;
  status?: MachineServicoStatus;
  paid?: boolean;
  notes?: string | null;
}

function servicoRow(input: MachineServicoInput) {
  const kind = normalizeKind(input.kind);
  return {
    machine_id: input.machine_id,
    service_date: input.service_date?.trim() || undefined,
    kind,
    // no valor fechado não existe quantidade: é um serviço só
    quantity: kind === "servico" ? 1 : qty(input.quantity),
    unit_price: money(input.unit_price),
    contratante: clean(input.contratante),
    description: clean(input.description),
    origin: clean(input.origin),
    destination: clean(input.destination),
    operator: clean(input.operator),
    internal: !!input.internal,
    // dinheiro na mão é serviço acabado: recebido fecha a OS sozinho
    status: input.paid ? "concluida" : normalizeStatus(input.status),
    paid: !!input.paid,
    notes: clean(input.notes),
  };
}

function servicoInvalido(input: MachineServicoInput): string | null {
  if (!input.machine_id) return "Escolha a máquina ou o veículo";
  const kind = normalizeKind(input.kind);
  if (kind !== "servico" && qty(input.quantity) <= 0)
    return "Informe a quantidade do serviço";
  // O serviço interno pode não ter valor: é trabalho da própria firma.
  if (!input.internal && money(input.unit_price) <= 0)
    return "Informe o valor do serviço";
  return null;
}

export async function createMachineServico(input: MachineServicoInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const falta = servicoInvalido(input);
  if (falta) return { error: falta };

  const { error } = await supabase
    .from("machine_servicos")
    .insert({ ...servicoRow(input), created_by: user.id });

  if (error) return { error: frotaError(error) };
  revalidate();
  return { ok: true };
}

export async function updateMachineServico(id: string, input: MachineServicoInput) {
  const supabase = createClient();

  const falta = servicoInvalido(input);
  if (falta) return { error: falta };

  const { error } = await supabase
    .from("machine_servicos")
    .update(servicoRow(input))
    .eq("id", id);

  if (error) return { error: frotaError(error) };
  revalidate();
  return { ok: true };
}

export async function deleteMachineServico(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("machine_servicos").delete().eq("id", id);
  if (error) return { error: frotaError(error) };
  revalidate();
  return { ok: true };
}

/** Marcar/desmarcar recebido direto na ficha, sem abrir o lançamento. */
export async function setMachineServicoPaid(id: string, paid: boolean) {
  const supabase = createClient();
  // receber fecha a OS junto; desmarcar não reabre (o serviço continua feito)
  const patch = paid ? { paid, status: "concluida" } : { paid };
  const { error } = await supabase.from("machine_servicos").update(patch).eq("id", id);
  if (error) return { error: frotaError(error) };
  revalidate();
  return { ok: true };
}

/** Abrir/concluir a OS com um toque na ficha — é o verde do calendário. */
export async function setMachineServicoStatus(id: string, status: MachineServicoStatus) {
  const supabase = createClient();
  const { error } = await supabase
    .from("machine_servicos")
    .update({ status: normalizeStatus(status) })
    .eq("id", id);
  if (error) return { error: frotaError(error) };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// DESPESA — combustível, manutenção, peça, motorista, imposto
// ─────────────────────────────────────────────────────────────────────────────

export interface MachineDespesaInput {
  machine_id: string;
  expense_date?: string | null;
  category?: string | null;
  description: string;
  amount: number;
  supplier?: string | null;
  liters?: number | null;
  odometer?: number | null;
  notes?: string | null;
}

function despesaRow(input: MachineDespesaInput) {
  return {
    machine_id: input.machine_id,
    expense_date: input.expense_date?.trim() || undefined,
    category: clean(input.category),
    description: clean(input.description),
    amount: money(input.amount),
    supplier: clean(input.supplier),
    liters: optional(input.liters),
    odometer: optional(input.odometer),
    notes: clean(input.notes),
  };
}

function despesaInvalida(input: MachineDespesaInput): string | null {
  if (!input.machine_id) return "Escolha a máquina ou o veículo";
  if (!clean(input.description)) return "Escreva o que foi a despesa";
  if (money(input.amount) <= 0) return "Informe o valor da despesa";
  return null;
}

export async function createMachineDespesa(input: MachineDespesaInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const falta = despesaInvalida(input);
  if (falta) return { error: falta };

  const { error } = await supabase
    .from("machine_despesas")
    .insert({ ...despesaRow(input), created_by: user.id });

  if (error) return { error: frotaError(error) };
  revalidate();
  return { ok: true };
}

export async function updateMachineDespesa(id: string, input: MachineDespesaInput) {
  const supabase = createClient();

  const falta = despesaInvalida(input);
  if (falta) return { error: falta };

  const { error } = await supabase
    .from("machine_despesas")
    .update(despesaRow(input))
    .eq("id", id);

  if (error) return { error: frotaError(error) };
  revalidate();
  return { ok: true };
}

export async function deleteMachineDespesa(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("machine_despesas").delete().eq("id", id);
  if (error) return { error: frotaError(error) };
  revalidate();
  return { ok: true };
}
