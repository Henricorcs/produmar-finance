"use server";

import { revalidatePath } from "next/cache";
import { avisarNoCelular } from "@/lib/push";
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
  // a OS enviada aparece (e some) no painel do operador
  revalidatePath("/operador");
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
  // coluna que não existe: são as da 074 (situação) e da 075 (envio ao operador)
  if (error.code === "42703")
    return "Rode as migrations 074 e 075 no Supabase para a OS ter situação e ser enviada ao operador";
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
  /** Operador para quem a OS vai — vazio deixa a OS só no escritório. */
  assigned_to?: string | null;
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
    assigned_to: input.assigned_to || null,
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

/** O que o celular dele mostra na tela de bloqueio. */
function recadoDoServico(input: MachineServicoInput): string {
  const partes: string[] = [];

  const tarefa = clean(input.description);
  if (tarefa) partes.push(tarefa.length > 90 ? tarefa.slice(0, 90) + "..." : tarefa);

  const de = clean(input.origin);
  const para = clean(input.destination);
  if (de && para) partes.push(`${de} → ${para}`);
  else if (para) partes.push("Para " + para);

  return partes.join(" · ") || "Abra o app para ver os detalhes.";
}

export async function createMachineServico(input: MachineServicoInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const falta = servicoInvalido(input);
  if (falta) return { error: falta };

  const { data: criado, error } = await supabase
    .from("machine_servicos")
    .insert({ ...servicoRow(input), created_by: user.id })
    .select("id")
    .single();

  if (error || !criado) return { error: error ? frotaError(error) : "Erro ao criar a OS" };

  // O celular dele apita agora. A OS da máquina cai no MESMO painel da OS de
  // Operações (migration 075) e a tela aqui promete que "a OS cai no celular
  // dele" — mas o aviso só existia do lado de Operações, e por isso o celular
  // ficava mudo. Como lá, avisar é acessório: falhou, a OS continua lançada.
  const aviso = input.assigned_to
    ? await avisarNoCelular(input.assigned_to, {
        titulo: "OS nova pra você",
        corpo: recadoDoServico(input),
        url: "/operador",
        assunto: "servico-" + criado.id,
      })
    : null;

  revalidate();
  return { ok: true, avisoNaoEntregue: aviso?.motivo ?? null };
}

export async function updateMachineServico(id: string, input: MachineServicoInput) {
  const supabase = createClient();

  const falta = servicoInvalido(input);
  if (falta) return { error: falta };

  // Quem era o dono antes: avisa SÓ quando a OS troca de mão. Reeditar uma OS
  // que já era dele não é novidade, e celular que apita à toa é celular que ele
  // silencia.
  const { data: antes } = await supabase
    .from("machine_servicos")
    .select("assigned_to")
    .eq("id", id)
    .maybeSingle<{ assigned_to: string | null }>();

  const { error } = await supabase
    .from("machine_servicos")
    .update(servicoRow(input))
    .eq("id", id);

  if (error) return { error: frotaError(error) };

  const trocouDeMao = !!input.assigned_to && input.assigned_to !== antes?.assigned_to;
  const aviso = trocouDeMao
    ? await avisarNoCelular(input.assigned_to as string, {
        titulo: "OS nova pra você",
        corpo: recadoDoServico(input),
        url: "/operador",
        assunto: "servico-" + id,
      })
    : null;

  revalidate();
  return { ok: true, avisoNaoEntregue: aviso?.motivo ?? null };
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
// O PAINEL DO OPERADOR — a OS enviada para o celular dele
// ─────────────────────────────────────────────────────────────────────────────
// O operador só alcança a OS que foi enviada a ele: as duas actions abaixo
// filtram por assigned_to, e a policy da migration 075 faz o mesmo no banco.

/** INICIAR: marca a hora em que a máquina começou o serviço. */
export async function iniciarMachineServico(id: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { error } = await supabase
    .from("machine_servicos")
    .update({ started_at: new Date().toISOString() })
    .eq("id", id)
    .eq("assigned_to", user.id);

  if (error) return { error: frotaError(error) };
  revalidate();
  return { ok: true };
}

/**
 * FINALIZAR: fecha a OS pelo painel. O operador conta o que realmente fez —
 * se foram 4 viagens e não 3, o valor acompanha, porque quem estava na rua era
 * ele. A OS vira concluída e o dia deixa de ficar verde no calendário.
 */
export async function finalizarMachineServico(
  id: string,
  input: { quantity?: number | null; completion_notes?: string | null }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const patch: Record<string, unknown> = {
    status: "concluida",
    finished_at: new Date().toISOString(),
    finalized_by: user.id,
    completion_notes: clean(input.completion_notes),
  };
  // quantidade só entra se veio preenchida: em branco mantém a combinada
  if (input.quantity !== null && input.quantity !== undefined && qty(input.quantity) > 0)
    patch.quantity = qty(input.quantity);

  const { error } = await supabase
    .from("machine_servicos")
    .update(patch)
    .eq("id", id)
    .eq("assigned_to", user.id);

  if (error) return { error: frotaError(error) };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// O HISTÓRICO DE UMA OS DE OPERAÇÕES
// ─────────────────────────────────────────────────────────────────────────────
// A ficha do veículo mostra a OS de Operações como uma linha só, com o valor.
// Mas quem olha a máquina quer o que está DENTRO dela: as horas do horímetro,
// o km rodado, cada viagem e o material carregado.
//
// Isso é pesado demais para vir junto com a tela — são três tabelas filhas para
// cada OS. Então vem sob demanda: só quando alguém abre o histórico daquela
// linha. Somente leitura; quem corrige a OS continua sendo o módulo Operações.

export async function historicoDaOs(id: string) {
  const supabase = createClient();

  const { data: order, error } = await supabase
    .from("service_orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return { error: frotaError(error) };
  if (!order) return { error: "Esta OS não existe mais." };

  // As três de uma vez: nenhuma depende da outra. Best-effort — se alguma
  // tabela ainda não existe (migrations 016/025/026), aquela lista vem vazia e
  // o histórico mostra o resto.
  const [tripsRes, itemsRes, pausesRes] = await Promise.all([
    supabase
      .from("service_order_trips")
      .select("*")
      .eq("service_order_id", id)
      .order("trip_number", { ascending: true }),
    supabase
      .from("service_order_items")
      .select("*, products(name)")
      .eq("service_order_id", id),
    supabase
      .from("service_order_pauses")
      .select("*")
      .eq("service_order_id", id)
      .order("pause_number", { ascending: true }),
  ]);

  return {
    historico: {
      order,
      trips: tripsRes.data ?? [],
      items: itemsRes.data ?? [],
      pauses: pausesRes.data ?? [],
    },
  };
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

// ─────────────────────────────────────────────────────────────────────────────
// PARCEIRO — a troca de diárias de máquina (migration 076)
// ─────────────────────────────────────────────────────────────────────────────
// Aqui não entra dinheiro: é dia de máquina pagando dia de máquina. Por isso
// nada disto soma na receita nem na despesa da ficha do veículo.

/** Erro das tabelas da parceria → recado que diz o que fazer. */
function parceriaError(error: { code?: string; message: string }): string {
  if (error.code === "42P01" || error.message.includes("machine_parceiro_veiculos"))
    return "Rode as migrations 076 e 077 no Supabase para usar a troca com o parceiro";
  // coluna que falta aqui é veiculos_dele/veiculos_meus, da 077
  if (error.code === "42703")
    return "Rode a migration 077 no Supabase para marcar as placas no dia da troca";
  if (error.code === "23505" && error.message.includes("uq_machine_parceiros_nome"))
    return "Já existe um parceiro com esse nome";
  return error.message;
}

export interface MachineParceiroInput {
  name: string;
  phone?: string | null;
  notes?: string | null;
  active?: boolean;
}

export async function createMachineParceiro(input: MachineParceiroInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!clean(input.name)) return { error: "Escreva o nome do parceiro" };

  const { error } = await supabase.from("machine_parceiros").insert({
    name: clean(input.name),
    phone: input.phone?.trim() || null,
    notes: clean(input.notes),
    created_by: user.id,
  });

  if (error) return { error: parceriaError(error) };
  revalidate();
  return { ok: true };
}

export async function updateMachineParceiro(id: string, input: MachineParceiroInput) {
  const supabase = createClient();

  if (!clean(input.name)) return { error: "Escreva o nome do parceiro" };

  const { error } = await supabase
    .from("machine_parceiros")
    .update({
      name: clean(input.name),
      phone: input.phone?.trim() || null,
      notes: clean(input.notes),
      ...(input.active === undefined ? {} : { active: input.active }),
    })
    .eq("id", id);

  if (error) return { error: parceriaError(error) };
  revalidate();
  return { ok: true };
}

/** Apagar o parceiro leva junto o histórico de troca dele (on delete cascade). */
export async function deleteMachineParceiro(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("machine_parceiros").delete().eq("id", id);
  if (error) return { error: parceriaError(error) };
  revalidate();
  return { ok: true };
}

export interface MachineTrocaInput {
  parceiro_id: string;
  entry_date: string;
  category: string;
  /** Quantas máquinas DELE trabalharam para nós no dia. */
  recebidas: number;
  /** Quantas máquinas NOSSAS trabalharam para ele no dia. */
  cedidas: number;
  /** Quais foram — placas do momento, marcadas na caixa do dia. */
  veiculos_dele?: string | null;
  veiculos_meus?: string | null;
  notes?: string | null;
}

/** Diária de máquina: nunca negativa, e aceita a metade (0,5). */
function diarias(v?: number | null): number {
  const n = Math.abs(Number(v ?? 0));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

/**
 * O DIA DA TROCA — grava (ou corrige) o dia inteiro de um tipo de máquina.
 *
 * Um dia + um tipo = uma linha só: salvar de novo corrige o que estava lá, não
 * soma escondido. Zerar os dois números APAGA o dia — é assim que se desmarca
 * um dia lançado por engano.
 */
export async function salvarMachineTroca(input: MachineTrocaInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!input.parceiro_id) return { error: "Escolha o parceiro" };
  if (!input.entry_date) return { error: "Escolha o dia" };

  const recebidas = diarias(input.recebidas);
  const cedidas = diarias(input.cedidas);
  const category = input.category?.trim() || "cacamba";

  // Dia zerado nos dois lados não é troca nenhuma: sai do calendário.
  if (recebidas === 0 && cedidas === 0) {
    const { error } = await supabase
      .from("machine_trocas")
      .delete()
      .eq("parceiro_id", input.parceiro_id)
      .eq("entry_date", input.entry_date)
      .eq("category", category);
    if (error) return { error: parceriaError(error) };
    revalidate();
    return { ok: true };
  }

  const { error } = await supabase.from("machine_trocas").upsert(
    {
      parceiro_id: input.parceiro_id,
      entry_date: input.entry_date,
      category,
      recebidas,
      cedidas,
      veiculos_dele: clean(input.veiculos_dele),
      veiculos_meus: clean(input.veiculos_meus),
      notes: clean(input.notes),
      created_by: user.id,
    },
    { onConflict: "parceiro_id,entry_date,category" }
  );

  if (error) return { error: parceriaError(error) };
  revalidate();
  return { ok: true };
}

export async function deleteMachineTroca(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("machine_trocas").delete().eq("id", id);
  if (error) return { error: parceriaError(error) };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// OS VEÍCULOS DO PARCEIRO (migration 077)
// ─────────────────────────────────────────────────────────────────────────────
// A placa é o que identifica o veículo na conversa do fim do mês: "a caçamba
// ABC-1234 trabalhou dia 12 e parou dia 13".

export interface MachineParceiroVeiculoInput {
  parceiro_id: string;
  plate?: string | null;
  name?: string | null;
  category?: string | null;
  notes?: string | null;
  active?: boolean;
}

function veiculoRow(input: MachineParceiroVeiculoInput) {
  return {
    parceiro_id: input.parceiro_id,
    plate: clean(input.plate),
    name: clean(input.name),
    category: input.category?.trim() || "cacamba",
    notes: clean(input.notes),
    ...(input.active === undefined ? {} : { active: input.active }),
  };
}

/** Sem placa e sem apelido ninguém reconhece o veículo no dia. */
function veiculoInvalido(input: MachineParceiroVeiculoInput): string | null {
  if (!input.parceiro_id) return "Escolha o parceiro";
  if (!clean(input.plate) && !clean(input.name))
    return "Informe a placa (ou pelo menos um apelido)";
  return null;
}

export async function createMachineParceiroVeiculo(input: MachineParceiroVeiculoInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const falta = veiculoInvalido(input);
  if (falta) return { error: falta };

  const { error } = await supabase
    .from("machine_parceiro_veiculos")
    .insert({ ...veiculoRow(input), created_by: user.id });

  if (error) return { error: parceriaError(error) };
  revalidate();
  return { ok: true };
}

export async function updateMachineParceiroVeiculo(
  id: string,
  input: MachineParceiroVeiculoInput
) {
  const supabase = createClient();

  const falta = veiculoInvalido(input);
  if (falta) return { error: falta };

  const { error } = await supabase
    .from("machine_parceiro_veiculos")
    .update(veiculoRow(input))
    .eq("id", id);

  if (error) return { error: parceriaError(error) };
  revalidate();
  return { ok: true };
}

/**
 * Apagar o veículo do cadastro NÃO apaga o histórico: o dia guardou a placa
 * como texto, então o que já passou continua contando a história certa.
 */
export async function deleteMachineParceiroVeiculo(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("machine_parceiro_veiculos").delete().eq("id", id);
  if (error) return { error: parceriaError(error) };
  revalidate();
  return { ok: true };
}
