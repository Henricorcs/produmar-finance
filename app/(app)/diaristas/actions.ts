"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PaymentMode, WorkerType } from "@/lib/types";
import { erroDoHorimetro, erroDoNovoServico } from "@/lib/maquina-na-diaria";

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

/**
 * O erro cru do Postgres não diz a ninguém o que fazer.
 *
 * A dica de "rode a migration" só vale quando a tabela ou a coluna REALMENTE
 * não existe (42P01 / 42703). Antes bastava o nome da tabela aparecer no texto
 * do erro para o app mandar rodar a migration — e o nome da tabela aparece em
 * QUALQUER erro dela, inclusive quando o RLS barra a gravação. Quem levava um
 * "não" por falta de permissão era mandado rodar uma migration que já estava
 * rodada, e ia caçar o problema no lugar errado.
 */
function diaristaError(error: { code?: string; message: string }): string {
  if (error.code === "23505" && error.message.includes("uq_diarista_dia"))
    return "Esse dia já estava lançado para este diarista";
  if (error.code === "23505" && error.message.includes("uq_diarista_acerto_mes"))
    return "O salário desse mês já foi pago. Desfaça o pagamento antes de pagar de novo.";
  if (error.code === "23505") return "Já existe um colaborador com esse nome";

  // Os serviços de máquina nascem na 133. O PostgREST responde PGRST205 quando
  // a tabela não está no cache dele; o Postgres, 42P01.
  if (
    (error.code === "42P01" || error.code === "PGRST205") &&
    error.message.includes("diarista_dia_maquinas")
  )
    return RECADO_133;
  if (error.code === "23505" && error.message.includes("uq_diarista_dia_maquina_aberta"))
    return SERVICO_JA_ABERTO;
  if (error.code === "23514" && error.message.includes("horimetro"))
    return "O horímetro final tem que ser maior que o inicial";

  // O banco ainda só conhece diarista e empreiteiro: falta a 098.
  if (error.code === "23514" && error.message.includes("worker_type"))
    return "Rode a migration 098 no Supabase para cadastrar funcionário CLT";

  // A ligação colaborador × encarregado de obra nasce na 099. O PostgREST
  // responde PGRST205 quando a tabela não está no cache dele.
  if (
    (error.code === "42P01" || error.code === "PGRST205") &&
    error.message.includes("diarista_tecnicos")
  )
    return "Rode a migration 099 no Supabase para liberar colaborador por encarregado de obra";

  // O banco recusou por permissão: o RLS de adiantamento e acerto só deixa
  // gravar quem manda no dinheiro (admin, financeiro, ou operador com o
  // módulo liberado). Não tem nada a ver com migration.
  if (error.code === "42501" || /row.level security/i.test(error.message))
    return "Seu usuário não tem permissão para lançar isso. Adiantamento e acerto são liberados para admin e financeiro.";

  // Falta rodar migration — só quando a tabela/coluna não existe mesmo.
  if (error.code === "42P01" || error.code === "42703") {
    if (error.message.includes("half_day"))
      return "Rode a migration 064 no Supabase para usar a meia diária";
    if (
      error.message.includes("monthly_salary") ||
      error.message.includes("reference_month") ||
      error.message.includes("salary_total")
    )
      return "Rode a migration 098 no Supabase para usar o salário do funcionário CLT";
    if (
      error.message.includes("payment_mode") ||
      error.message.includes("meter_rate") ||
      error.message.includes("job_rate")
    )
      return "Rode a migration 070 no Supabase para usar a forma de pagamento do colaborador";
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
    return "Rode a migration 059 no Supabase para usar os diaristas";
  }

  // Qualquer outra coisa vai crua, com o código do Postgres junto: é o que
  // permite descobrir o que houve de verdade em vez de chutar.
  return error.code ? `${error.message} (código ${error.code})` : error.message;
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
  /** Como ele costuma ser pago: diária, metro ou valor da obra (070). */
  payment_mode?: PaymentMode | null;
  /** Preço combinado do metro (070). */
  meter_rate?: number | null;
  /** Preço combinado da obra inteira (070). */
  job_rate?: number | null;
  /** Salário do mês — só do CLT (098). */
  monthly_salary?: number | null;
  notes?: string | null;
}

/**
 * O tipo é o que decide a tela: quem é diarista aparece no calendário do
 * técnico, quem é empreiteiro recebe pelo serviço lançado no setor da obra, e
 * o CLT recebe o salário do mês. Qualquer coisa fora dos três vira diarista —
 * é como sempre foi.
 */
function cleanWorkerType(v?: WorkerType | null): WorkerType {
  return v === "empreiteiro" || v === "clt" ? v : "diarista";
}

/**
 * O salário só vai para o banco quando a pessoa é CLT. Mandar a coluna sempre
 * faria o cadastro de QUALQUER colaborador falhar enquanto a migration 098 não
 * roda — e quem deixa de ser CLT guarda o número antigo, que nada mais lê.
 */
function salarioDoCadastro(input: DiaristaInput) {
  return cleanWorkerType(input.worker_type) === "clt"
    ? { monthly_salary: normMoney(input.monthly_salary) }
    : {};
}

/**
 * A forma de pagamento. Qualquer coisa fora das três vira "diaria", que é como
 * o sistema inteiro funcionava antes da migration 070.
 */
function cleanPaymentMode(v?: PaymentMode | null): PaymentMode {
  return v === "metro" || v === "obra" ? v : "diaria";
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
      payment_mode: cleanPaymentMode(input.payment_mode),
      meter_rate: normMoney(input.meter_rate),
      job_rate: normMoney(input.job_rate),
      ...salarioDoCadastro(input),
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
      payment_mode: cleanPaymentMode(input.payment_mode),
      meter_rate: normMoney(input.meter_rate),
      job_rate: normMoney(input.job_rate),
      ...salarioDoCadastro(input),
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
// QUEM CUIDA DE QUEM (migration 099)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Diz quais encarregados de obra podem ver e lançar dia para o colaborador.
 * A lista que chega é a lista INTEIRA: quem não veio nela deixa de ver a
 * pessoa. Mexe só na diferença — não apaga e regrava quem já estava.
 */
export async function setDiaristaTecnicos(diaristaId: string, tecnicoIds: string[]) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };
  if (!diaristaId) return { error: "Colaborador não informado" };

  const querem = Array.from(new Set((tecnicoIds ?? []).filter(Boolean)));

  const { data: atuais, error: lerErr } = await supabase
    .from("diarista_tecnicos")
    .select("tecnico_id")
    .eq("diarista_id", diaristaId);
  if (lerErr) return { error: diaristaError(lerErr) };

  const tinham = new Set((atuais ?? []).map((r) => r.tecnico_id as string));
  const sair = Array.from(tinham).filter((id) => !querem.includes(id));
  const entrar = querem.filter((id) => !tinham.has(id));

  if (sair.length > 0) {
    const { error } = await supabase
      .from("diarista_tecnicos")
      .delete()
      .eq("diarista_id", diaristaId)
      .in("tecnico_id", sair);
    if (error) return { error: vinculoError(error) };
  }

  if (entrar.length > 0) {
    const { error } = await supabase.from("diarista_tecnicos").insert(
      entrar.map((tecnicoId) => ({
        diarista_id: diaristaId,
        tecnico_id: tecnicoId,
        created_by: user.id,
      }))
    );
    if (error) return { error: vinculoError(error) };
  }

  revalidate();
  return { ok: true };
}

/** O "não" do RLS aqui é de cadastro, não de dinheiro — a mensagem geral fala de acerto. */
function vinculoError(error: { code?: string; message: string }): string {
  if (error.code === "42501" || /row.level security/i.test(error.message))
    return "Seu usuário não tem permissão para liberar colaborador. Isso é de quem cuida do cadastro de colaboradores.";
  return diaristaError(error);
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
  /**
   * Máquina pesada usada no dia (migration 133). Só vem quando a resposta de
   * "Usou máquina pesada?" foi Sim; aí o horímetro inicial é obrigatório e o
   * final pode ficar para quando o serviço terminar.
   */
  machine_id?: string | null;
  hourmeter_start?: number | null;
  hourmeter_end?: number | null;
}

/** O banco ainda não tem a tabela dos serviços de máquina. */
const RECADO_133 =
  "Para lançar a máquina pesada na diária, falta rodar a migration 133 no Supabase. Por enquanto lance a diária sem a máquina.";

const SERVICO_JA_ABERTO = "Já tem um serviço aberto neste dia. Feche ele antes de começar outro.";

interface ServicoDeMaquinaInput {
  machine_id: string;
  obra_id: string | null;
  sector_id?: string | null;
  description?: string | null;
  hourmeter_start: number | null;
  hourmeter_end?: number | null;
}

/**
 * Grava um serviço de máquina na diária e devolve o erro, se houver. O valor
 * da hora vem do CADASTRO da máquina, nunca do que chegou da tela: quem lança
 * anota o horímetro, não o preço.
 */
async function gravarServicoDeMaquina(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  diaId: string,
  input: ServicoDeMaquinaInput
): Promise<string | null> {
  const { data: machine, error: mErr } = await supabase
    .from("machines")
    .select("id, hourly_rate")
    .eq("id", input.machine_id)
    .maybeSingle();
  if (mErr) return diaristaError(mErr);
  if (!machine) return "Máquina não encontrada. Escolha de novo.";

  const valorHora = Number(machine.hourly_rate ?? 0);
  const final = input.hourmeter_end ?? null;
  const { error } = await supabase.from("diarista_dia_maquinas").insert({
    dia_id: diaId,
    machine_id: input.machine_id,
    obra_id: input.obra_id,
    sector_id: input.sector_id || null,
    description: clean(input.description),
    hourmeter_start: input.hourmeter_start,
    hourmeter_end: final,
    // sem valor da hora no cadastro, fica vazio: a obra passa a usar o do
    // cadastro assim que ele for preenchido
    machine_hourly_rate: valorHora > 0 ? normMoney(valorHora) : null,
    closed_at: final != null ? new Date().toISOString() : null,
    created_by: userId,
  });
  if (error && (error.code === "42501" || /row.level security/i.test(error.message)))
    return "Este colaborador não está liberado para você. Peça ao chefe para liberar em Colaboradores.";
  return error ? diaristaError(error) : null;
}

/**
 * Lança UM dia — o clique no calendário abre a tela daquele dia e o serviço é
 * descrito ali mesmo. Um dia, uma descrição: é o que o chefe precisa ler no
 * fim do mês, e é por isso que não existe lançamento em lote com um texto só.
 *
 * O valor da diária NÃO vem da tela: é lido aqui do cadastro e congelado no
 * dia. Quem marca o dia (o técnico) não decide quanto ele vale — ele só diz se
 * foi dia inteiro ou meio expediente, e a metade é feita AQUI.
 *
 * A OBRA é obrigatória: toda diária é de uma obra, e é ela que leva o dia para
 * o custo da obra (o card "Diárias" em Obras sai daqui). Dia lançado sem obra
 * ficava solto — ninguém via, e o custo da obra saía menor do que foi.
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
  if (!input.obra_id) return { error: "Diga em qual obra ele trabalhou" };

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

  // Máquina pesada (133): a conta é refeita aqui com a mesma regra da tela.
  if (input.machine_id) {
    const errHorimetro = erroDoNovoServico(
      input.hourmeter_start ?? null,
      input.hourmeter_end ?? null
    );
    if (errHorimetro) return { error: errHorimetro };
  }

  const { data: novoDia, error } = await supabase.from("diarista_dias").insert({
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
  }).select("id").single();

  // Quem manda no módulo nunca é barrado aqui: o "não" do RLS neste insert é o
  // encarregado de obra lançando para alguém que não é da turma dele (099).
  if (error && (error.code === "42501" || /row.level security/i.test(error.message)))
    return {
      error:
        "Este colaborador não está liberado para você. Peça ao chefe para liberar em Colaboradores.",
    };
  if (error || !novoDia)
    return { error: error ? diaristaError(error) : "Erro ao lançar o dia" };

  if (input.machine_id) {
    const errServico = await gravarServicoDeMaquina(supabase, user.id, novoDia.id as string, {
      machine_id: input.machine_id,
      obra_id: input.obra_id,
      sector_id: input.sector_id,
      description: input.description,
      hourmeter_start: input.hourmeter_start ?? null,
      hourmeter_end: input.hourmeter_end ?? null,
    });
    // a diária sem o serviço enganaria quem marcou que usou máquina: desfaz e
    // deixa a pessoa lançar de novo
    if (errServico) {
      await supabase.from("diarista_dias").delete().eq("id", novoDia.id);
      return { error: errServico };
    }
  }

  revalidate();
  return { ok: true };
}

/**
 * Mais um serviço de máquina numa diária que já existe: de manhã gradeou um
 * piquete, à tarde foi jogar calcário em outra área. A diária continua uma só;
 * cada serviço leva o seu custo para a sua obra.
 */
export async function iniciarServicoDeMaquina(input: ServicoDeMaquinaInput & { dia_id: string }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!input.machine_id) return { error: "Escolha a máquina que ele usou" };
  if (!input.obra_id) return { error: "Diga em qual obra foi o serviço" };
  if (!clean(input.description)) return { error: "Escreva o que ele fez neste serviço" };

  const inicial = input.hourmeter_start ?? null;
  const errHorimetro = erroDoNovoServico(inicial, input.hourmeter_end ?? null);
  if (errHorimetro) return { error: errHorimetro };

  const { data: doDia, error: lerErr } = await supabase
    .from("diarista_dia_maquinas")
    .select("machine_id, hourmeter_end")
    .eq("dia_id", input.dia_id);
  if (lerErr) return { error: diaristaError(lerErr) };

  if ((doDia ?? []).some((s) => s.hourmeter_end == null)) return { error: SERVICO_JA_ABERTO };

  // A mesma máquina não anda para trás no mesmo dia: começar antes do final do
  // serviço anterior contaria as mesmas horas duas vezes na obra.
  const ultimoFinal = Math.max(
    0,
    ...(doDia ?? [])
      .filter((s) => s.machine_id === input.machine_id)
      .map((s) => Number(s.hourmeter_end))
  );
  if (inicial != null && inicial < ultimoFinal)
    return {
      error: `O horímetro inicial não pode ser menor que o final do serviço anterior (${ultimoFinal.toLocaleString("pt-BR")})`,
    };

  const err = await gravarServicoDeMaquina(supabase, user.id, input.dia_id, input);
  if (err) return { error: err };
  revalidate();
  return { ok: true };
}

/** Anota o horímetro final: o serviço fecha e as horas entram no custo da obra. */
/**
 * Fecha o serviço com o horímetro final.
 *
 * `inicialCorrigido`: o horímetro do começo foi digitado errado (um zero a
 * mais, a vírgula esquecida) e quem fecha corrigiu na conferência. Sem isso o
 * serviço ficava preso: todo final verdadeiro dava "menor que o inicial".
 */
export async function fecharServicoDeMaquina(
  id: string,
  final: number | null,
  inicialCorrigido?: number | null
) {
  const supabase = createClient();

  const { data: servico, error: lerErr } = await supabase
    .from("diarista_dia_maquinas")
    .select("hourmeter_start, hourmeter_end")
    .eq("id", id)
    .maybeSingle();
  if (lerErr) return { error: diaristaError(lerErr) };
  if (!servico) return { error: "Serviço não encontrado. Ele pode ter sido apagado." };
  if (servico.hourmeter_end != null) return { error: "Este serviço já foi fechado." };

  const corrigiu =
    inicialCorrigido != null && inicialCorrigido !== Number(servico.hourmeter_start);
  const inicial = corrigiu ? inicialCorrigido : Number(servico.hourmeter_start);

  const errHorimetro = erroDoHorimetro(inicial, final);
  if (errHorimetro) return { error: errHorimetro };

  // só fecha se continuar aberto: dois aparelhos não gravam um por cima do outro
  const { data, error } = await supabase
    .from("diarista_dia_maquinas")
    .update({
      ...(corrigiu ? { hourmeter_start: inicial } : {}),
      hourmeter_end: final,
      closed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("hourmeter_end", null)
    .select("id");
  if (error) return { error: diaristaError(error) };
  if ((data ?? []).length === 0)
    return {
      error:
        "Não deu para fechar: este colaborador não está liberado para você, ou o serviço já foi fechado.",
    };

  revalidate();
  return { ok: true };
}

/**
 * Onde a máquina parou no último serviço fechado — a pista para conferir o
 * horímetro do começo antes de fechar (se o começo está acima de onde ela
 * parou, quase sempre foi digitado errado).
 */
export async function ultimoHorimetroDaMaquina(
  machineId: string,
  exceto: string
): Promise<{ final: number; em: string | null } | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("diarista_dia_maquinas")
    .select("hourmeter_end, closed_at")
    .eq("machine_id", machineId)
    .neq("id", exceto)
    .not("hourmeter_end", "is", null)
    .order("closed_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!data || data.hourmeter_end == null) return null;
  return { final: Number(data.hourmeter_end), em: data.closed_at ?? null };
}

/** Lançou errado: apaga o serviço e a diária continua. */
export async function apagarServicoDeMaquina(id: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("diarista_dia_maquinas")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { error: diaristaError(error) };
  if ((data ?? []).length === 0)
    return { error: "Só o chefe ou quem lançou este serviço pode apagar." };
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

  // mesma regra do lançamento: corrigir um dia não pode deixá-lo sem obra
  if (!input.obra_id) return { error: "Diga em qual obra ele trabalhou" };

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
 * Põe na obra as diárias que já foram lançadas soltas, de uma vez.
 *
 * A obra só passou a ser obrigatória agora: o que foi lançado antes ficou sem
 * obra e nunca chegou ao custo dela. Em vez de abrir dia por dia, o chefe marca
 * na tela da obra quais daqueles dias são dela.
 *
 * Só mexe no que AINDA está sem obra: se alguém atribuiu no meio do caminho,
 * aquele dia fica onde já foi posto em vez de ser puxado por cima.
 */
export async function assignDiariasToObra(obraId: string, ids: string[]) {
  const supabase = createClient();

  if (!obraId) return { error: "Escolha a obra" };
  const alvos = (ids ?? []).filter(Boolean);
  if (alvos.length === 0) return { error: "Marque as diárias que são desta obra" };

  const { data, error } = await supabase
    .from("diarista_dias")
    .update({ obra_id: obraId })
    .in("id", alvos)
    .is("obra_id", null)
    .select("id");

  if (error) return { error: diaristaError(error) };
  revalidate();
  return { ok: true, count: (data ?? []).length };
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
 *
 * O CLT (098) paga o SALDO DO MÊS pela mesma porta, com duas diferenças:
 *   • o salário do cadastro entra no que ele tem a receber, e o acerto guarda
 *     de qual mês ele é (`reference_month`) — o mesmo mês não sai duas vezes;
 *   • o corte é o ÚLTIMO DIA daquele mês, e não o dia do pagamento: o salário
 *     de setembro, pago em 5 de outubro, desconta os vales de setembro e deixa
 *     o de outubro para o salário de outubro.
 */
export async function createDiaristaAcerto(input: {
  diarista_id: string;
  settled_on?: string | null;
  notes?: string | null;
  /** CLT: o mês do salário que está sendo pago, em YYYY-MM (098). */
  reference_month?: string | null;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!input.diarista_id) return { error: "Colaborador não informado" };
  const pagoEm = cleanDate(input.settled_on) ?? new Date().toISOString().slice(0, 10);

  // `select *` e não a lista de colunas: sem a migration 098 a coluna do
  // salário não existe, e o acerto do diarista não pode quebrar por causa dela
  const { data: pessoa, error: pessoaErr } = await supabase
    .from("diaristas")
    .select("*")
    .eq("id", input.diarista_id)
    .maybeSingle();
  if (pessoaErr) return { error: diaristaError(pessoaErr) };
  if (!pessoa) return { error: "Colaborador não encontrado" };

  const clt = pessoa.worker_type === "clt";
  let mesReferencia: string | null = null;
  let salario = 0;
  let ate = pagoEm;

  if (clt) {
    const m = /^(\d{4})-(\d{2})$/.exec(input.reference_month?.trim() ?? "");
    const ano = m ? Number(m[1]) : NaN;
    const mes = m ? Number(m[2]) : NaN;
    if (!m || mes < 1 || mes > 12) return { error: "Escolha o mês do salário" };

    salario = normMoney(pessoa.monthly_salary as number);
    if (salario <= 0)
      return { error: "Informe o salário mensal no cadastro dele antes de pagar o mês" };

    mesReferencia = `${m[1]}-${m[2]}-01`;
    // Date.UTC(ano, mes, 0) = dia 0 do mês seguinte = último dia deste mês
    ate = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);

    const { data: jaPago } = await supabase
      .from("diarista_acertos")
      .select("settled_on")
      .eq("diarista_id", input.diarista_id)
      .eq("reference_month", mesReferencia)
      .maybeSingle();
    if (jaPago)
      return {
        error: `O salário de ${m[2]}/${m[1]} já foi pago em ${String(jaPago.settled_on)
          .split("-")
          .reverse()
          .join("/")}. Desfaça aquele pagamento antes de pagar de novo.`,
      };
  }

  const [diasRes, valesRes, servicosRes] = await Promise.all([
    supabase
      .from("diarista_dias")
      .select("id, daily_rate, work_date")
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

  // Diária com serviço de máquina aberto ainda não fechou: pagar agora deixaria
  // as horas da máquina esquecidas. Sem a 133 a consulta falha e nada trava.
  if (dias.length > 0) {
    const { data: abertos } = await supabase
      .from("diarista_dia_maquinas")
      .select("dia_id")
      .is("hourmeter_end", null)
      .in("dia_id", dias.map((d) => d.id));
    const idsAbertos = new Set((abertos ?? []).map((a) => a.dia_id as string));
    const diaAberto = dias.find((d) => idsAbertos.has(d.id as string));
    if (diaAberto)
      return {
        error: `A diária de ${String(diaAberto.work_date)
          .split("-")
          .reverse()
          .join("/")} está com serviço de máquina aberto. Coloque o horímetro final antes do acerto.`,
      };
  }

  const vales = valesRes.data ?? [];
  // a tabela pode não existir ainda (migration 069 não rodada) — nesse caso o
  // acerto continua funcionando com o que existia antes, sem quebrar a tela
  const servicos = servicosRes.error ? [] : servicosRes.data ?? [];

  // o CLT sempre tem o salário a receber, então para ele nunca cai aqui
  if (!clt && dias.length === 0 && vales.length === 0 && servicos.length === 0)
    return { error: "Não há diária, serviço nem adiantamento em aberto até essa data" };

  const diariasTotal = normMoney(dias.reduce((s, d) => s + Number(d.daily_rate), 0));
  const servicosTotal = normMoney(
    servicos.reduce((s, v) => s + Number(v.total_value), 0)
  );
  // days_total é a coluna do recibo (068): guarda o que ele TINHA A RECEBER,
  // venha de dia trabalhado, de serviço fechado ou do salário do mês (098)
  const diasTotal = normMoney(diariasTotal + servicosTotal + salario);
  const valesTotal = normMoney(vales.reduce((s, v) => s + Number(v.amount), 0));
  const aPagar = normMoney(diasTotal - valesTotal);

  // Adiantado maior que trabalhado: não há o que pagar, e fechar aqui apagaria
  // a dívida dele. O saldo negativo segue para a semana que vem.
  if (valesTotal > diasTotal)
    return {
      error: clt
        ? "O adiantado passa do salário do mês — não há saldo a pagar. Confira as datas dos adiantamentos."
        : "O adiantado é maior que o trabalhado até essa data — não há acerto a fazer. O saldo passa para a próxima semana.",
    };

  const { data: acerto, error: acertoErr } = await supabase
    .from("diarista_acertos")
    .insert({
      diarista_id: input.diarista_id,
      // no CLT é o dia em que o saldo foi pago; nos outros, o próprio corte
      settled_on: clt ? pagoEm : ate,
      days_total: diasTotal,
      advance_total: valesTotal,
      amount_paid: aPagar,
      // as colunas da 098 só vão no pagamento do CLT: o acerto do diarista
      // continua gravando mesmo com a migration por rodar
      ...(clt ? { reference_month: mesReferencia, salary_total: salario } : {}),
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
  return {
    ok: true,
    acertoId,
    diasTotal,
    diariasTotal,
    servicosTotal,
    salario,
    valesTotal,
    aPagar,
  };
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
