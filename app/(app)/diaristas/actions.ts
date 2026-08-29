"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { WorkerType } from "@/lib/types";

/**
 * O cadastro do colaborador é do chefe (/diaristas) e o calendário é do técnico
 * (/tecnico/diaristas): as duas telas mexem nos mesmos dados, então toda ação
 * revalida as duas. O acerto também fecha serviço de obra (069), por isso
 * /obras entra junto.
 */
function revalidate() {
  revalidatePath("/diaristas");
  revalidatePath("/tecnico/diaristas");
  revalidatePath("/obras");
}

function clean(s?: string | null): string | null {
  const v = s?.trim();
  return v ? v.toUpperCase() : null;
}

/**
 * A chave PIX NÃO vai para caixa alta: e-mail e chave aleatória diferenciam
 * maiúscula de minúscula, e uma chave trocada é dinheiro no lugar errado.
 */
function cleanPix(s?: string | null): string | null {
  const v = s?.trim();
  return v ? v : null;
}

/** Dinheiro sempre positivo, com 2 casas. */
function normMoney(v?: number | null): number {
  const n = Math.abs(Number(v ?? 0));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

/** YYYY-MM-DD ou nada — não deixa lixo virar data no banco. */
function cleanDate(s?: string | null): string | null {
  const v = s?.trim();
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** O erro cru do Postgres não diz a ninguém que falta rodar a migration. */
function diaristaError(error: { code?: string; message: string }): string {
  if (error.code === "23505" && error.message.includes("uq_diarista_dia"))
    return "Esse dia já estava lançado para este diarista";
  if (error.message.includes("half_day"))
    return "Rode a migration 064 no Supabase para usar a meia diária";
  if (
    error.message.includes("worker_type") ||
    error.message.includes("profession") ||
    error.message.includes("supply_obra_servicos")
  )
    return "Rode a migration 069 no Supabase para usar empreiteiro e serviço de obra";
  if (
    error.message.includes("diarista_adiantamentos") ||
    error.message.includes("diarista_acertos") ||
    error.message.includes("acerto_id")
  )
    return "Rode a migration 068 no Supabase para usar adiantamento e acerto";
  if (error.code === "23505") return "Já existe um colaborador com esse nome";
  if (
    error.code === "42P01" ||
    error.message.includes("diarista_dias") ||
    error.message.includes("diaristas") ||
    error.message.includes("v_diaristas")
  )
    return "Rode a migration 059 no Supabase para usar os diaristas";
  return error.message;
}

// ─────────────────────────────────────────────────────────────────────────────
// CADASTRO DO DIARISTA (só o chefe)
// ─────────────────────────────────────────────────────────────────────────────

export interface DiaristaInput {
  name: string;
  phone?: string | null;
  pix_key?: string | null;
  daily_rate?: number | null;
  /** Diarista (ganha por dia) ou empreiteiro (ganha por serviço) — 069. */
  worker_type?: WorkerType | null;
  /** Pedreiro, pintor, carpinteiro... texto livre (069). */
  profession?: string | null;
  notes?: string | null;
}

/**
 * O tipo é o que decide a tela: quem é diarista aparece no calendário do
 * técnico, quem é empreiteiro recebe pelo serviço lançado no setor da obra.
 * Qualquer coisa fora dos dois vira diarista — é como sempre foi.
 */
function cleanWorkerType(v?: WorkerType | null): WorkerType {
  return v === "empreiteiro" ? "empreiteiro" : "diarista";
}

export async function createDiarista(input: DiaristaInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const name = clean(input.name);
  if (!name) return { error: "Informe o nome do colaborador" };

  const { data, error } = await supabase
    .from("diaristas")
    .insert({
      name,
      phone: clean(input.phone),
      pix_key: cleanPix(input.pix_key),
      daily_rate: normMoney(input.daily_rate),
      worker_type: cleanWorkerType(input.worker_type),
      profession: clean(input.profession),
      notes: clean(input.notes),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error ? diaristaError(error) : "Erro ao cadastrar" };
  revalidate();
  return { ok: true, diaristaId: data.id as string };
}

export async function updateDiarista(id: string, input: DiaristaInput) {
  const supabase = createClient();

  const name = clean(input.name);
  if (!name) return { error: "Informe o nome do colaborador" };

  const { error } = await supabase
    .from("diaristas")
    .update({
      name,
      phone: clean(input.phone),
      pix_key: cleanPix(input.pix_key),
      daily_rate: normMoney(input.daily_rate),
      worker_type: cleanWorkerType(input.worker_type),
      profession: clean(input.profession),
      notes: clean(input.notes),
    })
    .eq("id", id);

  if (error) return { error: diaristaError(error) };
  revalidate();
  return { ok: true };
}

/** Guarda o cadastro sem sumir com ele — o histórico de dias continua inteiro. */
export async function setDiaristaActive(id: string, active: boolean) {
  const supabase = createClient();
  const { error } = await supabase.from("diaristas").update({ active }).eq("id", id);
  if (error) return { error: diaristaError(error) };
  revalidate();
  return { ok: true };
}

/**
 * Apaga o diarista E TODOS os dias dele (o `on delete cascade` da 059). Para
 * tirar da lista sem perder o histórico existe o `setDiaristaActive`.
 */
export async function deleteDiarista(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("diaristas").delete().eq("id", id);
  if (error) return { error: diaristaError(error) };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// O CALENDÁRIO (o técnico marca, o chefe corrige)
// ─────────────────────────────────────────────────────────────────────────────

export interface DiaristaDiaCreateInput {
  diarista_id: string;
  /** O dia clicado no calendário, em YYYY-MM-DD. */
  date: string;
  description?: string | null;
  obra_id?: string | null;
  sector_id?: string | null;
  /** Veio só meio expediente: vale metade da diária (migration 064). */
  half_day?: boolean;
}

/**
 * Lança UM dia — o clique no calendário abre a tela daquele dia e o serviço é
 * descrito ali mesmo. Um dia, uma descrição: é o que o chefe precisa ler no
 * fim do mês, e é por isso que não existe lançamento em lote com um texto só.
 *
 * O valor da diária NÃO vem da tela: é lido aqui do cadastro e congelado no
 * dia. Quem marca o dia (o técnico) não decide quanto ele vale — ele só diz se
 * foi dia inteiro ou meio expediente, e a metade é feita AQUI.
 */
export async function createDiaristaDia(input: DiaristaDiaCreateInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!input.diarista_id) return { error: "Escolha o diarista" };

  const workDate = cleanDate(input.date);
  if (!workDate) return { error: "Escolha o dia no calendário" };

  const { data: diarista, error: dErr } = await supabase
    .from("diaristas")
    .select("id, daily_rate")
    .eq("id", input.diarista_id)
    .maybeSingle();
  if (dErr) return { error: diaristaError(dErr) };
  if (!diarista) return { error: "Diarista não encontrado" };

  // o nome de quem marcou vai gravado: o chefe precisa saber de quem é o recado
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  // Meia diária vale metade — e o valor JÁ ENTRA pela metade em daily_rate
  // (ver a migration 064). Nenhuma soma do app precisa lembrar de dividir.
  const half = input.half_day === true;
  const rate = normMoney(diarista.daily_rate as number);

  const { error } = await supabase.from("diarista_dias").insert({
    diarista_id: input.diarista_id,
    work_date: workDate,
    description: clean(input.description),
    obra_id: input.obra_id || null,
    sector_id: input.sector_id || null,
    daily_rate: half ? normMoney(rate / 2) : rate,
    // a coluna vem da 064: só mandamos quando é meia, para quem ainda não rodou
    // a migration continuar lançando dia inteiro normalmente
    ...(half ? { half_day: true } : {}),
    registered_by_name: clean(profile?.full_name),
    created_by: user.id,
  });

  if (error) return { error: diaristaError(error) };
  revalidate();
  return { ok: true };
}

export interface DiaristaDiaInput {
  description?: string | null;
  obra_id?: string | null;
  sector_id?: string | null;
  /** Só o chefe muda o valor de um dia já lançado (ver a policy da 059). */
  daily_rate?: number | null;
  /** Marca de meia diária. O valor vem no `daily_rate` já pela metade. */
  half_day?: boolean | null;
}

export async function updateDiaristaDia(id: string, input: DiaristaDiaInput) {
  const supabase = createClient();

  const patch: Record<string, unknown> = {
    description: clean(input.description),
    obra_id: input.obra_id || null,
    sector_id: input.sector_id || null,
  };
  if (input.daily_rate != null) patch.daily_rate = normMoney(input.daily_rate);
  if (input.half_day != null) patch.half_day = input.half_day;

  const { error } = await supabase.from("diarista_dias").update(patch).eq("id", id);
  if (error) return { error: diaristaError(error) };
  revalidate();
  return { ok: true };
}

/**
 * Apaga o dia lançado. A policy da 059 deixa o chefe apagar qualquer um e o
 * técnico só o que ele mesmo marcou — errou o dia, apaga e marca de novo.
 */
export async function deleteDiaristaDia(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("diarista_dias").delete().eq("id", id);
  if (error) return { error: diaristaError(error) };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// ADIANTAMENTO E ACERTO (migration 068)
// ─────────────────────────────────────────────────────────────────────────────
// O vale é o dinheiro que o diarista pega no meio da semana. O acerto é o
// pagamento: ele fecha os dias trabalhados, desconta os vales em aberto e, a
// partir daí, aqueles dias ficam CINZA no calendário — já foram pagos.

export interface AdiantamentoInput {
  diarista_id: string;
  advance_date?: string | null;
  amount: number;
  notes?: string | null;
}

export async function createDiaristaAdiantamento(input: AdiantamentoInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!input.diarista_id) return { error: "Diarista não informado" };
  const valor = normMoney(input.amount);
  if (valor <= 0) return { error: "Informe o valor do adiantamento" };

  const { error } = await supabase.from("diarista_adiantamentos").insert({
    diarista_id: input.diarista_id,
    advance_date: cleanDate(input.advance_date) ?? undefined,
    amount: valor,
    notes: clean(input.notes),
    created_by: user.id,
  });

  if (error) return { error: diaristaError(error) };
  revalidate();
  return { ok: true };
}

/** Só dá para apagar vale em aberto: o que já entrou num acerto está pago. */
export async function deleteDiaristaAdiantamento(id: string) {
  const supabase = createClient();

  const { data: vale } = await supabase
    .from("diarista_adiantamentos")
    .select("acerto_id")
    .eq("id", id)
    .maybeSingle();

  if (vale?.acerto_id)
    return {
      error: "Este adiantamento já entrou num acerto. Desfaça o acerto primeiro.",
    };

  const { error } = await supabase.from("diarista_adiantamentos").delete().eq("id", id);
  if (error) return { error: diaristaError(error) };
  revalidate();
  return { ok: true };
}

/**
 * Fecha a conta do colaborador: soma as diárias E os serviços ainda não
 * acertados, desconta os vales em aberto e guarda quanto saiu de dinheiro. Os
 * dias, os serviços e os vales passam a apontar para este acerto — é isso que
 * pinta o dia de cinza no calendário e tira o serviço da conta.
 *
 * O empreiteiro fecha pela MESMA porta que o diarista: quem só tem serviço não
 * tem dia nenhum no calendário, e mesmo assim acerta normalmente.
 *
 * `settled_on` também serve de corte: dia trabalhado (ou serviço feito) DEPOIS
 * dessa data continua em aberto, para o acerto de sábado não levar junto o que
 * veio no domingo.
 */
export async function createDiaristaAcerto(input: {
  diarista_id: string;
  settled_on?: string | null;
  notes?: string | null;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!input.diarista_id) return { error: "Colaborador não informado" };
  const ate = cleanDate(input.settled_on) ?? new Date().toISOString().slice(0, 10);

  const [diasRes, valesRes, servicosRes] = await Promise.all([
    supabase
      .from("diarista_dias")
      .select("id, daily_rate")
      .eq("diarista_id", input.diarista_id)
      .is("acerto_id", null)
      .lte("work_date", ate),
    supabase
      .from("diarista_adiantamentos")
      .select("id, amount")
      .eq("diarista_id", input.diarista_id)
      .is("acerto_id", null)
      .lte("advance_date", ate),
    // sem a migration 069 a tabela não existe: o acerto segue só com as
    // diárias, exatamente como era antes (ver o tratamento do erro abaixo)
    supabase
      .from("supply_obra_servicos")
      .select("id, total_value")
      .eq("diarista_id", input.diarista_id)
      .is("acerto_id", null)
      .lte("service_date", ate),
  ]);

  if (diasRes.error) return { error: diaristaError(diasRes.error) };
  if (valesRes.error) return { error: diaristaError(valesRes.error) };

  const dias = diasRes.data ?? [];
  const vales = valesRes.data ?? [];
  // a tabela pode não existir ainda (migration 069 não rodada) — nesse caso o
  // acerto continua funcionando com o que existia antes, sem quebrar a tela
  const servicos = servicosRes.error ? [] : servicosRes.data ?? [];

  if (dias.length === 0 && vales.length === 0 && servicos.length === 0)
    return { error: "Não há diária, serviço nem adiantamento em aberto até essa data" };

  const diariasTotal = normMoney(dias.reduce((s, d) => s + Number(d.daily_rate), 0));
  const servicosTotal = normMoney(
    servicos.reduce((s, v) => s + Number(v.total_value), 0)
  );
  // days_total é a coluna do recibo (068): guarda o que ele TINHA A RECEBER,
  // venha de dia trabalhado ou de serviço fechado
  const diasTotal = normMoney(diariasTotal + servicosTotal);
  const valesTotal = normMoney(vales.reduce((s, v) => s + Number(v.amount), 0));
  const aPagar = normMoney(diasTotal - valesTotal);

  // Adiantado maior que trabalhado: não há o que pagar, e fechar aqui apagaria
  // a dívida dele. O saldo negativo segue para a semana que vem.
  if (valesTotal > diasTotal)
    return {
      error:
        "O adiantado é maior que o trabalhado até essa data — não há acerto a fazer. O saldo passa para a próxima semana.",
    };

  const { data: acerto, error: acertoErr } = await supabase
    .from("diarista_acertos")
    .insert({
      diarista_id: input.diarista_id,
      settled_on: ate,
      days_total: diasTotal,
      advance_total: valesTotal,
      amount_paid: aPagar,
      notes: clean(input.notes),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (acertoErr || !acerto)
    return { error: acertoErr ? diaristaError(acertoErr) : "Erro ao registrar o acerto" };

  // Carimba os dias, os serviços e os vales. Se algo falhar aqui, o acerto é
  // desfeito: meio acerto é pior que nenhum — ficariam dias pagos e dias em
  // aberto sem razão.
  const acertoId = acerto.id as string;

  if (dias.length > 0) {
    const { error } = await supabase
      .from("diarista_dias")
      .update({ acerto_id: acertoId })
      .in("id", dias.map((d) => d.id));
    if (error) {
      await supabase.from("diarista_acertos").delete().eq("id", acertoId);
      return { error: diaristaError(error) };
    }
  }

  if (servicos.length > 0) {
    const { error } = await supabase
      .from("supply_obra_servicos")
      .update({ acerto_id: acertoId })
      .in("id", servicos.map((v) => v.id));
    if (error) {
      await supabase.from("diarista_acertos").delete().eq("id", acertoId);
      return { error: diaristaError(error) };
    }
  }

  if (vales.length > 0) {
    const { error } = await supabase
      .from("diarista_adiantamentos")
      .update({ acerto_id: acertoId })
      .in("id", vales.map((v) => v.id));
    if (error) {
      await supabase.from("diarista_acertos").delete().eq("id", acertoId);
      return { error: diaristaError(error) };
    }
  }

  revalidate();
  return { ok: true, acertoId, diasTotal, diariasTotal, servicosTotal, valesTotal, aPagar };
}

/**
 * Desfaz o acerto. Os dias voltam a ficar coloridos no calendário e os vales
 * voltam a contar como em aberto — as duas colunas são `on delete set null`.
 */
export async function deleteDiaristaAcerto(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("diarista_acertos").delete().eq("id", id);
  if (error) return { error: diaristaError(error) };
  revalidate();
  return { ok: true };
}
