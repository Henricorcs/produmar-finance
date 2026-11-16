"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import type {
  AnimalExitReason,
  AnimalLoteMovimentoKind,
  AnimalSaleMode,
  AnimalSex,
  AnimalSpecies,
} from "@/lib/types";
import { removerArquivos, uploadArquivo, urlDoArquivo } from "@/lib/storage";
import { localDateISO } from "@/lib/utils";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function revalidate() {
  revalidatePath("/animais");
  // a venda de um animal vira lançamento no financeiro
  revalidatePath("/contas");
  revalidatePath("/dashboard");
}

/** Texto de cadastro: sempre em CAIXA ALTA, vazio vira null. */
function clean(s?: string | null): string | null {
  const v = s?.trim();
  return v ? v.toUpperCase() : null;
}

function normWeight(v?: number | null): number {
  return Math.max(0, v ?? 0);
}

/**
 * Vaqueiro nível 01 (migration 146): trabalha no gado, mas não exclui animal
 * nem dá saída. O banco já recusa (RLS e gatilho); a conferência aqui vem
 * ANTES porque essas ações mexem em outra coisa primeiro — o excluir apaga as
 * fotos do storage, a saída lança no financeiro — e o meio-caminho ficaria.
 */
async function barradoParaVaqueiroN1(): Promise<{ error: string } | null> {
  const profile = await getProfile();
  if (profile?.role !== "vaqueiro_n1") return null;
  return { error: "O acesso de Vaqueiro nível 01 não permite isto. Peça ao patrão." };
}

/** Dinheiro (e quilo) sempre positivo, com 2 casas. */
function money(v?: number | null): number {
  const n = Math.abs(Number(v ?? 0));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

/** Quantidade sempre positiva, com 3 casas — nem tudo se compra inteiro. */
function qtd(v?: number | null): number {
  const n = Math.abs(Number(v ?? 0));
  return isNaN(n) ? 0 : Math.round(n * 1000) / 1000;
}

/** Nome do tipo em português para as mensagens de erro ("um SUÍNO com esse número"). */
const SPECIES_LABEL: Record<AnimalSpecies, string> = {
  bovino: "bovino",
  equino: "equino",
  caprino: "caprino",
  ovino: "ovino",
  suino: "suíno",
  piscicultura: "peixe",
  aves: "ave",
};

/**
 * Número repetido. A trava é por TIPO (migration 061): o bovino 003 e o suíno
 * 003 convivem. Enquanto a 061 não roda, a trava antiga (`uq_animals_tag`,
 * número único no rebanho inteiro) ainda barra — e o recado diz o que fazer,
 * senão o erro parece que o animal já existe quando ele nem é do mesmo bicho.
 */
function dupTagError(
  error: { code?: string; message: string },
  species?: AnimalSpecies | null
): string {
  if (error.code === "23505") {
    if (error.message.includes("uq_animals_tag"))
      return "Rode a migration 061 no Supabase para numerar cada tipo de animal separado";
    const what = species ? SPECIES_LABEL[normSpecies(species)] : "animal";
    return `Já existe um ${what} com esse número`;
  }
  return speciesColumnError(error);
}

/**
 * O tipo do animal depende de duas migrations, e o erro cru do Postgres não
 * diz qual está faltando: a coluna vem da 047, o valor 'suino' do enum vem da
 * 054. Sem separar as duas o recado manda rodar a migration errada.
 */
function speciesColumnError(error: { code?: string; message: string }): string {
  // invalid input value for enum animal_species: 'suino' — a coluna existe, o
  // que falta é o valor novo no enum
  if (error.message.includes("enum animal_species"))
    return "Rode a migration 054 no Supabase para cadastrar suíno";
  if (error.message.includes("species"))
    return "Rode a migration 047 no Supabase para usar o tipo do animal";
  return error.message;
}

/** Tipo do animal — o que não vier marcado é bovino, como sempre foi. */
function normSpecies(v?: AnimalSpecies | null): AnimalSpecies {
  return v && ["bovino", "equino", "caprino", "ovino", "suino"].includes(v) ? v : "bovino";
}

// ─────────────────────────────────────────────────────────────────────────────
// ANIMAL (CRUD)
// ─────────────────────────────────────────────────────────────────────────────

export interface AnimalInput {
  tag: string;
  sex: AnimalSex;
  /** Tipo do animal (bovino, equino, caprino, ovino, suíno). */
  species?: AnimalSpecies | null;
  birth_date?: string | null;
  breed_id?: string | null;
  weight?: number | null;
  notes?: string | null;
  /** Registro na ABCZ (Nelore PO). Sem o campo (undefined) = não mexe. */
  abcz_code?: string | null;
  /** Mãe e pai do animal PO (migration 137). Sem o campo (undefined) = não mexe. */
  mae?: string | null;
  pai?: string | null;
}

/** O registro da ABCZ e a mãe/pai só entram quando a tela mandou (128 e 137). */
function abczDoInput(input: AnimalInput) {
  return {
    ...(input.abcz_code === undefined ? {} : { abcz_code: clean(input.abcz_code) }),
    ...(input.mae === undefined ? {} : { mae: clean(input.mae) }),
    ...(input.pai === undefined ? {} : { pai: clean(input.pai) }),
  };
}

export async function createAnimal(input: AnimalInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const tag = clean(input.tag);
  if (!tag) return { error: "Informe o número do animal" };

  const { data, error } = await supabase
    .from("animals")
    .insert({
      tag,
      sex: input.sex,
      species: normSpecies(input.species),
      birth_date: input.birth_date || null,
      breed_id: input.breed_id || null,
      weight: normWeight(input.weight),
      notes: clean(input.notes),
      ...abczDoInput(input),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data)
    return { error: error ? dupTagError(error, input.species) : "Erro ao cadastrar" };

  // o peso do cadastro é a primeira pesagem (hoje) — dela sai o ganho daqui pra frente
  const weight = normWeight(input.weight);
  if (weight > 0) {
    await saveWeight(supabase, {
      animal_id: data.id as string,
      weight,
      weighed_at: new Date().toISOString().split("T")[0],
      notes: "PESO DO CADASTRO",
      created_by: user.id,
    });
  }

  revalidate();
  return { ok: true, animalId: data.id as string };
}

export async function updateAnimal(id: string, input: AnimalInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const tag = clean(input.tag);
  if (!tag) return { error: "Informe o número do animal" };

  // peso de antes: só vira pesagem nova quando ele realmente mudou
  const { data: before } = await supabase
    .from("animals")
    .select("weight")
    .eq("id", id)
    .maybeSingle();

  const weight = normWeight(input.weight);

  const { error } = await supabase
    .from("animals")
    .update({
      tag,
      sex: input.sex,
      species: normSpecies(input.species),
      birth_date: input.birth_date || null,
      breed_id: input.breed_id || null,
      weight,
      notes: clean(input.notes),
      ...abczDoInput(input),
    })
    .eq("id", id);

  if (error) return { error: dupTagError(error, input.species) };

  if (weight > 0 && Number(before?.weight ?? 0) !== weight) {
    await saveWeight(supabase, {
      animal_id: id,
      weight,
      weighed_at: new Date().toISOString().split("T")[0],
      created_by: user.id,
    });
  }

  revalidate();
  return { ok: true };
}

/**
 * Das fotos que vão ser apagadas, só as que NENHUM outro animal usa. A foto da
 * mãe que o vaqueiro tirou fica na ficha do bezerro e, às vezes, na da mãe —
 * o mesmo arquivo nas duas. Apagar numa não pode fazer sumir na outra.
 */
async function semOutroDono(
  supabase: ReturnType<typeof createClient>,
  paths: string[],
  animalId: string
): Promise<string[]> {
  if (paths.length === 0) return [];
  const { data: outros } = await supabase
    .from("animal_photos")
    .select("path")
    .in("path", paths)
    .neq("animal_id", animalId);
  const usados = new Set((outros ?? []).map((o) => o.path as string));
  return paths.filter((p) => !usados.has(p));
}

/** Exclui o animal, as fotos e o histórico de vacinação (cascade). */
export async function deleteAnimal(id: string) {
  const barrado = await barradoParaVaqueiroN1();
  if (barrado) return barrado;
  const supabase = createClient();

  // remove as fotos do storage (as linhas em animal_photos somem por cascade)
  const { data: photos } = await supabase
    .from("animal_photos")
    .select("path")
    .eq("animal_id", id);
  const paths = (photos ?? []).map((p) => p.path as string);
  const { data: animal } = await supabase
    .from("animals")
    .select("photo_path")
    .eq("id", id)
    .maybeSingle();
  if (animal?.photo_path && !paths.includes(animal.photo_path)) paths.push(animal.photo_path);
  // a foto da mãe que também está na ficha do bezerro não pode sumir da outra
  const soDeste = await semOutroDono(supabase, paths, id);
  if (soDeste.length) {
    await removerArquivos(soDeste);
  }

  const { error } = await supabase.from("animals").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// FOTOS DO ANIMAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sobe uma ou mais fotos do animal. Cada arquivo vira uma linha em
 * animal_photos; a primeira também vira a "foto principal" (animals.photo_path)
 * quando ainda não houver nenhuma, para aparecer no card da lista.
 */
export async function uploadAnimalPhotos(animalId: string, formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Nenhuma foto válida" };
  if (files.some((f) => f.size > MAX_FILE_SIZE))
    return { error: "Cada foto deve ter no máximo 10 MB" };

  const uploadedPaths: string[] = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `animals/${animalId}/${randomUUID()}_${safeName}`;

    const { error: upErr } = await uploadArquivo(path, file);
    if (upErr) {
      // desfaz o que já subiu neste lote para não deixar lixo
      if (uploadedPaths.length) await removerArquivos(uploadedPaths);
      return { error: upErr.message };
    }
    uploadedPaths.push(path);
  }

  const { error: insErr } = await supabase.from("animal_photos").insert(
    uploadedPaths.map((path) => ({ animal_id: animalId, path, created_by: user.id }))
  );
  if (insErr) {
    await removerArquivos(uploadedPaths);
    return { error: insErr.message };
  }

  // garante uma foto principal (usada no card da lista)
  const { data: animal } = await supabase
    .from("animals")
    .select("photo_path")
    .eq("id", animalId)
    .maybeSingle();
  if (!animal?.photo_path) {
    await supabase.from("animals").update({ photo_path: uploadedPaths[0] }).eq("id", animalId);
  }

  revalidate();
  return { ok: true };
}

/** Lista as fotos do animal com URL assinada (1h) para exibição. */
export async function getAnimalPhotos(animalId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("animal_photos")
    .select("id, path")
    .eq("animal_id", animalId)
    .order("created_at", { ascending: true });
  if (error) return { error: error.message };

  const photos = (data ?? []).map((p) => ({
    id: p.id as string,
    path: p.path as string,
    url: urlDoArquivo(p.path as string) as string | null,
  }));
  return { photos };
}

/** Remove uma foto do animal (storage + linha). Reajusta a foto principal. */
export async function deleteAnimalPhoto(photoId: string) {
  const supabase = createClient();

  const { data: photo } = await supabase
    .from("animal_photos")
    .select("id, animal_id, path")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return { error: "Foto não encontrada" };

  // o arquivo só sai se nenhuma outra ficha usa a mesma foto (a da mãe que
  // também está na ficha do bezerro)
  const soDeste = await semOutroDono(supabase, [photo.path], photo.animal_id);
  if (soDeste.length) await removerArquivos(soDeste);
  const { error } = await supabase.from("animal_photos").delete().eq("id", photoId);
  if (error) return { error: error.message };

  // se era a foto principal, aponta para outra remanescente (ou limpa)
  const { data: animal } = await supabase
    .from("animals")
    .select("photo_path")
    .eq("id", photo.animal_id)
    .maybeSingle();
  if (animal?.photo_path === photo.path) {
    const { data: next } = await supabase
      .from("animal_photos")
      .select("path")
      .eq("animal_id", photo.animal_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    await supabase
      .from("animals")
      .update({ photo_path: next?.path ?? null })
      .eq("id", photo.animal_id);
  }

  revalidate();
  return { ok: true };
}

/** URLs assinadas (1h) das fotos principais — usadas nas miniaturas da lista. */
export async function getAnimalThumbnails(paths: string[]) {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return { urls: {} as Record<string, string> };

  // O endereço é montado na hora, sem ida ao servidor de arquivos: quem confere
  // o acesso é a rota /api/arquivo, no momento em que a foto for aberta.
  const urls: Record<string, string> = {};
  for (const path of unique) urls[path] = urlDoArquivo(path);
  return { urls };
}

// ─────────────────────────────────────────────────────────────────────────────
// RAÇAS (cadastro editável)
// ─────────────────────────────────────────────────────────────────────────────

function normName(v: string): string {
  return v.trim().toLowerCase();
}

function dupNameError(error: { code?: string; message: string }, what: string): string {
  if (error.code === "23505") return `${what} já existe`;
  return speciesColumnError(error);
}

/** A raça é de um tipo só: nelore é de bovino, mangalarga é de equino. */
export async function createBreed(name: string, species?: AnimalSpecies | null) {
  const supabase = createClient();
  const n = normName(name);
  if (!n) return { error: "Informe o nome da raça" };

  const { error } = await supabase
    .from("animal_breeds")
    .insert({ name: n, species: normSpecies(species) });
  if (error) return { error: dupNameError(error, "Essa raça") };
  revalidate();
  return { ok: true };
}

export async function renameBreed(id: string, name: string) {
  const supabase = createClient();
  const n = normName(name);
  if (!n) return { error: "Informe o nome da raça" };

  const { error } = await supabase.from("animal_breeds").update({ name: n }).eq("id", id);
  if (error) return { error: dupNameError(error, "Essa raça") };
  revalidate();
  return { ok: true };
}

export async function deleteBreed(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("animal_breeds").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// VACINAS (cadastro) E APLICAÇÕES
// ─────────────────────────────────────────────────────────────────────────────

function normRecurrence(v?: number | null): number | null {
  if (v == null) return null;
  const n = Math.floor(v);
  return n > 0 ? n : null;
}

export interface VaccineInput {
  name: string;
  /** De que tipo de animal é a vacina (bovino, equino, caprino, ovino, suíno). */
  species?: AnimalSpecies | null;
  recurrence_months?: number | null;
  /** Dose fixa em ml. */
  default_dose_ml?: number | null;
  /** Dose por peso: X ml a cada Y kg. */
  dose_ml_per_weight?: number | null;
  dose_weight_kg?: number | null;
  default_brand?: string | null;
  notes?: string | null;
}

/** Doses só fazem sentido positivas — zero/negativo vira null (não definida). */
function normDose(v?: number | null): number | null {
  if (v == null) return null;
  return v > 0 ? v : null;
}

/** Campos de dose e marca, normalizados (usados no create e no update). */
function vaccineFields(input: VaccineInput) {
  const perWeight = normDose(input.dose_ml_per_weight);
  const weightKg = normDose(input.dose_weight_kg);
  return {
    species: normSpecies(input.species),
    recurrence_months: normRecurrence(input.recurrence_months),
    default_dose_ml: normDose(input.default_dose_ml),
    // a dose por peso só vale com os dois lados preenchidos ("X ml a cada Y kg")
    dose_ml_per_weight: perWeight && weightKg ? perWeight : null,
    dose_weight_kg: perWeight && weightKg ? weightKg : null,
    default_brand: clean(input.default_brand),
    notes: clean(input.notes),
  };
}

/**
 * Erro do cadastro de vacina. O nome agora só é único DENTRO do tipo
 * (migration 062): "raiva" existe em equino, em caprino e em ovino. Sem a 062
 * a coluna `species` nem chega no banco — aí o recado manda rodar a migration
 * em vez de mostrar o erro cru do Postgres.
 */
function vaccineError(
  error: { code?: string; message: string },
  species?: AnimalSpecies | null
): string {
  // o 23505 vem primeiro: a mensagem dele cita o índice uq_animal_vaccines_
  // species_name, que tem "species" no nome e cairia no teste de baixo
  if (error.code === "23505")
    return `Essa vacina já existe em ${SPECIES_LABEL[normSpecies(species)]}`;
  if (error.code === "PGRST204" || error.message.includes("species"))
    return "Rode a migration 062 no Supabase para cadastrar vacina por tipo de animal";
  return dupNameError(error, "Essa vacina");
}

/**
 * A coluna `species` de animal_vaccines só existe depois da migration 062.
 * Antes dela o PostgREST devolve PGRST204 ("could not find the column").
 * O 23505 é testado antes por quem chama: a mensagem dele cita o índice
 * uq_animal_vaccines_species_name e cairia neste teste por engano.
 */
function missingVaccineSpecies(error: { code?: string; message: string }): boolean {
  return error.code !== "23505" && (error.code === "PGRST204" || error.message.includes("species"));
}

export async function createVaccine(input: VaccineInput) {
  const supabase = createClient();
  const name = normName(input.name);
  if (!name) return { error: "Informe o nome da vacina" };

  const { species, ...fields } = vaccineFields(input);
  let { error } = await supabase
    .from("animal_vaccines")
    .insert({ name, species, ...fields });

  // sem a migration 062 o cadastro é um só para a fazenda toda: grava sem o
  // tipo em vez de travar o cadastro inteiro (a tela avisa o que falta rodar)
  if (error && missingVaccineSpecies(error)) {
    ({ error } = await supabase.from("animal_vaccines").insert({ name, ...fields }));
  }

  if (error) return { error: vaccineError(error, input.species) };
  revalidate();
  return { ok: true };
}

export async function updateVaccine(id: string, input: VaccineInput) {
  const supabase = createClient();
  const name = normName(input.name);
  if (!name) return { error: "Informe o nome da vacina" };

  const { species, ...fields } = vaccineFields(input);
  let { error } = await supabase
    .from("animal_vaccines")
    .update({ name, species, ...fields })
    .eq("id", id);

  if (error && missingVaccineSpecies(error)) {
    ({ error } = await supabase
      .from("animal_vaccines")
      .update({ name, ...fields })
      .eq("id", id));
  }

  if (error) return { error: vaccineError(error, input.species) };
  revalidate();
  return { ok: true };
}

/** Remove a vacina do cadastro — as aplicações já registradas somem junto (cascade). */
export async function deleteVaccine(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("animal_vaccines").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export interface ProtocolItemInput {
  vaccine_id: string;
  /** Quantidade aplicada em ml. */
  dose_ml?: number | null;
  /** Marca da vacina usada. */
  brand?: string | null;
}

/**
 * Aplica um PROTOCOLO: várias vacinas no mesmo animal, na mesma data.
 * As linhas compartilham um protocol_id para o histórico mostrar agrupado.
 *
 * O animal passa na balança na mesma ida ao curral: `weight_kg` grava a pesagem
 * do dia junto do protocolo (é dela que sai "engordou X kg em Y dias") e vira o
 * peso atual do animal — o que calcula a dose por peso da próxima vez.
 */
export async function applyVaccineProtocol(input: {
  animal_id: string;
  applied_at?: string | null;
  items: ProtocolItemInput[];
  /** Peso do animal no dia do protocolo, em kg (opcional). */
  weight_kg?: number | null;
  notes?: string | null;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!input.animal_id) return { error: "Selecione o animal" };

  const items = (input.items ?? []).filter((i) => i.vaccine_id);
  if (items.length === 0) return { error: "Marque pelo menos uma vacina" };

  // a mesma vacina não pode entrar duas vezes no protocolo
  const uniqueIds = new Set(items.map((i) => i.vaccine_id));
  if (uniqueIds.size !== items.length) return { error: "Vacina repetida no protocolo" };

  const protocolId = randomUUID();
  const appliedAt = input.applied_at || new Date().toISOString().split("T")[0];
  const notes = clean(input.notes);

  const { error } = await supabase.from("animal_vaccinations").insert(
    items.map((i) => ({
      animal_id: input.animal_id,
      vaccine_id: i.vaccine_id,
      applied_at: appliedAt,
      dose_ml: i.dose_ml && i.dose_ml > 0 ? i.dose_ml : null,
      brand: clean(i.brand),
      protocol_id: protocolId,
      notes,
      created_by: user.id,
    }))
  );
  if (error) return { error: error.message };

  // aplicou → a pendência marcada na mão para essas vacinas está resolvida
  await supabase
    .from("animal_vaccine_pending")
    .delete()
    .eq("animal_id", input.animal_id)
    .in("vaccine_id", Array.from(uniqueIds));

  // a pesagem é opcional: se falhar, a vacinação já está registrada — avisa e segue
  let warning: string | undefined;
  if (input.weight_kg && input.weight_kg > 0) {
    const w = await saveWeight(supabase, {
      animal_id: input.animal_id,
      weight: input.weight_kg,
      weighed_at: appliedAt,
      protocol_id: protocolId,
      created_by: user.id,
    });
    if (w.error) warning = `Vacinas registradas, mas o peso não: ${w.error}`;
  }

  revalidate();
  return { ok: true, protocolId, warning };
}

export async function deleteVaccination(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("animal_vaccinations").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

/**
 * Apaga o protocolo inteiro (todas as vacinas aplicadas juntas). A pesagem
 * daquele dia FICA — o boi foi pesado de verdade; ela só perde o vínculo com o
 * protocolo e vira uma pesagem avulsa no histórico.
 */
export async function deleteVaccinationProtocol(protocolId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("animal_vaccinations")
    .delete()
    .eq("protocol_id", protocolId);
  if (error) return { error: error.message };

  await supabase
    .from("animal_weights")
    .update({ protocol_id: null })
    .eq("protocol_id", protocolId);

  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// PESAGENS (quanto o animal ganhou e em quanto tempo)
// ─────────────────────────────────────────────────────────────────────────────

/** A tabela vem da migration 046 — sem ela o erro do Postgres não diz nada. */
function weightsTableError(error: { code?: string; message: string }): string {
  if (error.code === "42P01" || error.message.includes("animal_weights"))
    return "Rode a migration 046 no Supabase para registrar as pesagens";
  return error.message;
}

type Supabase = ReturnType<typeof createClient>;

/**
 * Grava a pesagem (uma por animal por dia — repesar no mesmo dia corrige) e
 * deixa animals.weight igual à pesagem mais recente: é o peso atual que calcula
 * a dose em ml por peso.
 */
async function saveWeight(
  supabase: Supabase,
  row: {
    animal_id: string;
    weight: number;
    weighed_at: string;
    protocol_id?: string | null;
    notes?: string | null;
    created_by: string;
  }
): Promise<{ error?: string }> {
  const { error } = await supabase.from("animal_weights").upsert(
    {
      animal_id: row.animal_id,
      weighed_at: row.weighed_at,
      weight: row.weight,
      protocol_id: row.protocol_id ?? null,
      notes: row.notes ?? null,
      created_by: row.created_by,
    },
    { onConflict: "animal_id,weighed_at" }
  );
  if (error) return { error: weightsTableError(error) };

  await syncCurrentWeight(supabase, row.animal_id);
  return {};
}

/** Peso atual do animal = última pesagem registrada. */
async function syncCurrentWeight(supabase: Supabase, animalId: string) {
  const { data: last } = await supabase
    .from("animal_weights")
    .select("weight")
    .eq("animal_id", animalId)
    .order("weighed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last) {
    await supabase.from("animals").update({ weight: last.weight }).eq("id", animalId);
  }
}

/** Pesagem avulsa (fora do protocolo de vacinação). */
export async function recordAnimalWeight(input: {
  animal_id: string;
  weight: number;
  weighed_at?: string | null;
  notes?: string | null;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!input.animal_id) return { error: "Selecione o animal" };
  if (!input.weight || input.weight <= 0) return { error: "Informe o peso em kg" };

  const r = await saveWeight(supabase, {
    animal_id: input.animal_id,
    weight: input.weight,
    weighed_at: input.weighed_at || new Date().toISOString().split("T")[0],
    notes: clean(input.notes),
    created_by: user.id,
  });
  if (r.error) return { error: r.error };

  revalidate();
  return { ok: true };
}

/** Apaga uma pesagem lançada errado e volta o peso atual para a anterior. */
export async function deleteAnimalWeight(id: string) {
  const supabase = createClient();

  const { data: row } = await supabase
    .from("animal_weights")
    .select("id, animal_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("animal_weights").delete().eq("id", id);
  if (error) return { error: weightsTableError(error) };

  if (row?.animal_id) await syncCurrentWeight(supabase, row.animal_id as string);

  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// TRATAMENTOS (simples: o que foi tratado + remédio usado)
// ─────────────────────────────────────────────────────────────────────────────

export interface TreatmentInput {
  animal_id: string;
  description: string;
  medicine?: string | null;
  dose?: string | null;
  applied_at?: string | null;
}

export async function createTreatment(input: TreatmentInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const description = clean(input.description);
  if (!input.animal_id) return { error: "Selecione o animal" };
  if (!description) return { error: "Descreva o tratamento" };

  const { error } = await supabase.from("animal_treatments").insert({
    animal_id: input.animal_id,
    description,
    medicine: clean(input.medicine),
    dose: clean(input.dose),
    applied_at: input.applied_at || new Date().toISOString().split("T")[0],
    created_by: user.id,
  });
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function deleteTreatment(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("animal_treatments").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTOS (uma linha por bezerro, com o sexo da cria)
// ─────────────────────────────────────────────────────────────────────────────

export interface BirthInput {
  mother_id: string;
  birth_date: string;
  calf_sex: AnimalSex;
  /** Número do bezerro — obrigatório: ele entra no rebanho junto com o parto. */
  calf_tag: string;
  /** Peso do bezerro ao nascer, em kg. */
  calf_weight?: number | null;
  notes?: string | null;
}

/**
 * Registra o parto E cadastra o bezerro no rebanho na mesma hora, atrelado à
 * mãe (animal_births.calf_animal_id): a ficha do bezerro mostra de quem ele é
 * e a da mãe lista as crias. A cria herda o tipo e a raça da mãe e nasce com a
 * data do parto — a categoria de filhote sai daí sozinha (view v_animals).
 */
export async function createBirth(input: BirthInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!input.mother_id) return { error: "Selecione a mãe" };
  if (!input.birth_date) return { error: "Informe a data do parto" };
  if (!input.calf_sex) return { error: "Informe o sexo do bezerro" };

  const calfTag = clean(input.calf_tag);
  if (!calfTag) return { error: "Informe o número do bezerro" };

  // a cria puxa da mãe o tipo e a raça — potro nasce de égua, bezerro de vaca
  const { data: mother } = await supabase
    .from("animals")
    .select("breed_id, species")
    .eq("id", input.mother_id)
    .maybeSingle();

  const { data: calf, error: calfErr } = await supabase
    .from("animals")
    .insert({
      tag: calfTag,
      sex: input.calf_sex,
      species: normSpecies(mother?.species as AnimalSpecies | null),
      birth_date: input.birth_date,
      breed_id: mother?.breed_id ?? null,
      weight: normWeight(input.calf_weight),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (calfErr || !calf)
    return {
      error: calfErr
        ? dupTagError(calfErr, mother?.species as AnimalSpecies | null)
        : "Erro ao cadastrar o bezerro",
    };
  const calfAnimalId = calf.id as string;

  const { error } = await supabase.from("animal_births").insert({
    mother_id: input.mother_id,
    birth_date: input.birth_date,
    calf_tag: calfTag,
    calf_sex: input.calf_sex,
    calf_animal_id: calfAnimalId,
    notes: clean(input.notes),
    created_by: user.id,
  });
  if (error) {
    // desfaz o cadastro do bezerro para não deixar animal órfão
    await supabase.from("animals").delete().eq("id", calfAnimalId);
    return { error: error.message };
  }

  // peso de nascimento vira a primeira pesagem: o ganho do bezerro conta daí
  const calfWeight = normWeight(input.calf_weight);
  if (calfWeight > 0) {
    await saveWeight(supabase, {
      animal_id: calfAnimalId,
      weight: calfWeight,
      weighed_at: input.birth_date,
      notes: "PESO AO NASCER",
      created_by: user.id,
    });
  }

  revalidate();
  return { ok: true, calfAnimalId };
}

/**
 * Remove o registro do parto. Lançou errado? `deleteCalf` tira junto o bezerro
 * que entrou no rebanho por causa dele — senão o bezerro continua lá, só que
 * sem mãe.
 */
export async function deleteBirth(id: string, deleteCalf = false) {
  // apagar o parto junto com o bezerro é excluir animal
  if (deleteCalf) {
    const barrado = await barradoParaVaqueiroN1();
    if (barrado) return barrado;
  }
  const supabase = createClient();

  const { data: birth } = await supabase
    .from("animal_births")
    .select("id, calf_animal_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("animal_births").delete().eq("id", id);
  if (error) return { error: error.message };

  if (deleteCalf && birth?.calf_animal_id) {
    const r = await deleteAnimal(birth.calf_animal_id as string);
    if (r && "error" in r) return { error: `Parto removido, mas o bezerro não: ${r.error}` };
  }

  revalidate();
  return { ok: true };
}

/**
 * Bezerro lançado na mãe errada: passa o parto para a mãe certa. O bezerro
 * continua o mesmo (número, peso, vacinas, histórico) — só muda de quem ele é,
 * e o "pariu" das duas vacas se acerta sozinho. Se a raça do bezerro veio da
 * mãe errada (é a mesma dela), ele passa a ter a raça da mãe certa.
 */
export async function trocarMaeDoParto(birthId: string, novaMaeId: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };
  if (!novaMaeId) return { error: "Escolha a mãe certa" };

  const { data: parto } = await supabase
    .from("animal_births")
    .select("id, mother_id, calf_animal_id")
    .eq("id", birthId)
    .maybeSingle();
  if (!parto) return { error: "Esse parto não existe mais — recarregue a página" };
  if (parto.mother_id === novaMaeId) return { error: "Essa já é a mãe dele" };
  if (parto.calf_animal_id === novaMaeId)
    return { error: "O animal não pode ser mãe dele mesmo" };

  const [{ data: novaMae }, { data: maeAntiga }, { data: cria }] = await Promise.all([
    supabase
      .from("animals")
      .select("id, sex, species, breed_id")
      .eq("id", novaMaeId)
      .maybeSingle(),
    supabase.from("animals").select("breed_id").eq("id", parto.mother_id).maybeSingle(),
    parto.calf_animal_id
      ? supabase
          .from("animals")
          .select("id, species, breed_id")
          .eq("id", parto.calf_animal_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!novaMae) return { error: "Essa mãe não está no cadastro — escolha outra na lista" };
  if (novaMae.sex !== "femea") return { error: "A mãe escolhida não é fêmea — escolha outra" };
  if (
    cria &&
    normSpecies(cria.species as AnimalSpecies | null) !==
      normSpecies(novaMae.species as AnimalSpecies | null)
  )
    return { error: "A mãe escolhida é de outro tipo de animal — escolha outra" };

  const { error } = await supabase
    .from("animal_births")
    .update({ mother_id: novaMaeId })
    .eq("id", birthId);
  if (error) return { error: error.message };

  // a raça que ele puxou da mãe errada vira a da mãe certa
  if (
    cria &&
    novaMae.breed_id &&
    cria.breed_id === (maeAntiga?.breed_id ?? null) &&
    cria.breed_id !== novaMae.breed_id
  ) {
    await supabase.from("animals").update({ breed_id: novaMae.breed_id }).eq("id", cria.id);
  }

  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// SOLICITAÇÕES DE NASCIMENTO (vaqueiro envia pelo celular, patrão confere e lança)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A tabela vem da migration 048 — sem ela o erro do Postgres não diz nada. Só o
 * código do erro decide: casar pelo nome da tabela na mensagem transformava
 * qualquer falha (RLS, constraint) num "rode a 048" enganoso.
 */
function birthRequestsTableError(error: { code?: string; message: string }): string {
  if (error.code === "42P01")
    return "Rode a migration 048 no Supabase — a PARTE 1 e a PARTE 2 em execuções separadas";
  if (error.code === "PGRST205" || error.message.includes("schema cache"))
    return "Tabela ainda não visível: recarregue o schema no Supabase (NOTIFY pgrst, 'reload schema')";
  return error.code ? `${error.message} (${error.code})` : error.message;
}

export interface ResolveBirthRequestInput {
  /**
   * A mãe — sempre uma fêmea do CADASTRO, escolhida na lista. Número que não
   * existe no rebanho não passa (a vaca 187 que o vaqueiro digitou e não está
   * cadastrada): o patrão escolhe a mãe certa entre as que existem.
   */
  mother_id: string;
  birth_date: string;
  calf_sex: AnimalSex;
  calf_tag: string;
}

/**
 * Confirma a solicitação: lança o parto de verdade com createBirth — a mesma
 * função do lançamento manual — usando a mãe que o patrão escolheu (não
 * necessariamente a que o vaqueiro digitou; ele só confere/corrige). Se veio
 * foto, ela vira a foto do bezerro. Só apaga a solicitação depois que o
 * lançamento deu certo — se createBirth falhar (ex.: número já existe), a
 * solicitação fica intacta para tentar de novo.
 */
export async function resolveBirthRequest(requestId: string, input: ResolveBirthRequestInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { data: request, error: reqErr } = await supabase
    .from("animal_birth_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) return { error: birthRequestsTableError(reqErr) };
  if (!request) return { error: "Solicitação não encontrada (já foi resolvida?)" };

  // A mãe tem que ser uma fêmea que EXISTE no cadastro — a trava fica aqui, e
  // não só na tela: número solto (mãe "só escrita") não lança nascimento.
  if (!input.mother_id) return { error: "Escolha a mãe na lista das fêmeas cadastradas" };
  const { data: maeCadastrada } = await supabase
    .from("animals")
    .select("id, sex")
    .eq("id", input.mother_id)
    .maybeSingle();
  if (!maeCadastrada) return { error: "Essa mãe não está no cadastro — escolha outra na lista" };
  if (maeCadastrada.sex !== "femea") return { error: "A mãe escolhida não é fêmea — escolha outra" };

  const result = await createBirth({
    mother_id: input.mother_id,
    birth_date: input.birth_date,
    calf_sex: input.calf_sex,
    calf_tag: input.calf_tag,
  });
  if ("error" in result) return result;

  if (request.photo_path) {
    await supabase.from("animal_photos").insert({
      animal_id: result.calfAnimalId,
      path: request.photo_path as string,
      created_by: user.id,
    });
    await supabase
      .from("animals")
      .update({ photo_path: request.photo_path })
      .eq("id", result.calfAnimalId);
  }

  // O que o vaqueiro aplicou no nascimento entra na ficha da cria, um
  // tratamento por medicamento, na data em que ela nasceu. Best-effort: a cria
  // já está no rebanho, e um tratamento que não gravou não pode desfazer isso.
  const aplicados = Array.isArray(request.protocolo_aplicado)
    ? (request.protocolo_aplicado as { medicine?: string; dose?: string | null }[])
    : [];
  const tratamentos = aplicados
    .filter((i) => i?.medicine)
    .map((i) => ({
      animal_id: result.calfAnimalId,
      description: "PROTOCOLO DO NASCIMENTO",
      medicine: clean(i.medicine),
      dose: clean(i.dose),
      applied_at: input.birth_date,
      notes: "APLICADO PELO VAQUEIRO NO ATO DO NASCIMENTO",
      created_by: (request.created_by as string | null) ?? user.id,
    }));
  if (tratamentos.length > 0) {
    await supabase.from("animal_treatments").insert(tratamentos);
  }

  // A FOTO DA MÃE que o vaqueiro tirou (migration 138):
  //   - entra SEMPRE na ficha do bezerro, junto com a foto dele (a do bezerro
  //     continua sendo a principal) — é o registro de quem é a mãe;
  //   - entra na ficha da MÃE só se ela ainda não tem foto nenhuma, e aí vira
  //     a principal dela. Mãe que já tem foto fica como está.
  // O mesmo arquivo nas duas fichas: apagar numa não apaga na outra.
  if (request.mother_photo_path) {
    const fotoDaMae = request.mother_photo_path as string;
    const quem = (request.created_by as string | null) ?? user.id;

    await supabase.from("animal_photos").insert({
      animal_id: result.calfAnimalId,
      path: fotoDaMae,
      created_by: quem,
    });

    const maeId = input.mother_id;
    if (maeId) {
      const [{ data: mae }, { count: fotosDaMae }] = await Promise.all([
        supabase.from("animals").select("photo_path").eq("id", maeId).maybeSingle(),
        supabase
          .from("animal_photos")
          .select("id", { count: "exact", head: true })
          .eq("animal_id", maeId),
      ]);
      if (mae && !mae.photo_path && (fotosDaMae ?? 0) === 0) {
        await supabase.from("animal_photos").insert({
          animal_id: maeId,
          path: fotoDaMae,
          created_by: quem,
        });
        await supabase.from("animals").update({ photo_path: fotoDaMae }).eq("id", maeId);
      }
    }
  }

  // AS CARACTERÍSTICAS que ele escreveu (pinta na testa...) viram a observação
  // da ficha da cria.
  if (request.caracteristicas) {
    await supabase
      .from("animals")
      .update({ notes: clean(request.caracteristicas as string) })
      .eq("id", result.calfAnimalId);
  }

  // O PROTOCOLO QUE FICOU PENDENTE passa a apontar para a cria — quando o
  // vaqueiro aplicar, o tratamento cai direto na ficha dela. O que ele já
  // aplicou depois do envio (antes de o patrão lançar) entra agora.
  const { data: pendencias } = await supabase
    .from("animal_protocolo_pendencias")
    .update({ calf_animal_id: result.calfAnimalId })
    .eq("birth_request_id", requestId)
    .select("medicine, dose, applied_at, applied_by");
  const jaAplicadas = (
    (pendencias ?? []) as {
      medicine: string;
      dose: string | null;
      applied_at: string | null;
      applied_by: string | null;
    }[]
  ).filter((p) => p.applied_at);
  if (jaAplicadas.length > 0) {
    await supabase.from("animal_treatments").insert(
      jaAplicadas.map((p) => ({
        animal_id: result.calfAnimalId,
        description: "PROTOCOLO DO NASCIMENTO",
        medicine: clean(p.medicine),
        dose: clean(p.dose),
        applied_at: p.applied_at,
        notes: "APLICADO PELO VAQUEIRO DEPOIS DO NASCIMENTO",
        created_by: p.applied_by ?? user.id,
      }))
    );
  }

  await supabase.from("animal_birth_requests").delete().eq("id", requestId);

  revalidate();
  return { ok: true, calfAnimalId: result.calfAnimalId };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROTOCOLO DO NASCIMENTO (o que a cria toma ao nascer — migration 095)
// ─────────────────────────────────────────────────────────────────────────────

function protocoloError(error: { code?: string; message: string }): string {
  if (error.code === "42P01" || error.code === "PGRST205")
    return "Rode a migration 095 no Supabase para montar o protocolo do nascimento";
  return error.message;
}

/**
 * Põe VÁRIOS medicamentos no protocolo de uma vez, na ordem em que vieram, no
 * fim da lista daquele bicho. Linha sem medicamento é ignorada — é a linha em
 * branco que sobrou na tela, não um erro.
 */
export async function addProtocoloItens(
  species: AnimalSpecies,
  itens: { medicine: string; dose?: string | null }[]
) {
  const supabase = createClient();
  const validos = itens
    .map((i) => ({ medicine: clean(i.medicine), dose: clean(i.dose) }))
    .filter((i): i is { medicine: string; dose: string | null } => !!i.medicine);
  if (validos.length === 0) return { error: "Escreva pelo menos um medicamento" };

  const { data: ultimo } = await supabase
    .from("animal_protocolo_nascimento")
    .select("sort_order")
    .eq("species", species)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const base = (ultimo?.sort_order as number | undefined) ?? 0;

  const { error } = await supabase.from("animal_protocolo_nascimento").insert(
    validos.map((i, n) => ({
      species,
      medicine: i.medicine,
      dose: i.dose,
      sort_order: base + n + 1,
    }))
  );
  if (error) return { error: protocoloError(error) };
  revalidate();
  revalidatePath("/vaqueiro");
  return { ok: true, adicionados: validos.length };
}

export async function updateProtocoloItem(
  id: string,
  input: { medicine: string; dose?: string | null }
) {
  const supabase = createClient();
  const medicine = clean(input.medicine);
  if (!medicine) return { error: "Escreva o medicamento" };

  const { error } = await supabase
    .from("animal_protocolo_nascimento")
    .update({ medicine, dose: clean(input.dose) })
    .eq("id", id);
  if (error) return { error: protocoloError(error) };
  revalidate();
  revalidatePath("/vaqueiro");
  return { ok: true };
}

export async function deleteProtocoloItem(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("animal_protocolo_nascimento").delete().eq("id", id);
  if (error) return { error: protocoloError(error) };
  revalidate();
  revalidatePath("/vaqueiro");
  return { ok: true };
}

/** Descarta a solicitação (duplicada, mãe sem conserto, envio errado etc). */
export async function rejectBirthRequest(requestId: string) {
  const supabase = createClient();

  const { data: request, error: reqErr } = await supabase
    .from("animal_birth_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) return { error: birthRequestsTableError(reqErr) };

  // Envio descartado: o protocolo pendente dele não vale mais (a cria não
  // existe, ou foi lançada por outro envio). Best-effort, sem a 138 não há.
  await supabase.from("animal_protocolo_pendencias").delete().eq("birth_request_id", requestId);

  const { error } = await supabase.from("animal_birth_requests").delete().eq("id", requestId);
  if (error) return { error: birthRequestsTableError(error) };

  const fotos = [request?.photo_path, request?.mother_photo_path].filter(
    (p): p is string => typeof p === "string" && !!p
  );
  if (fotos.length > 0) {
    await removerArquivos(fotos);
  }

  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// PENDÊNCIA MARCADA NA MÃO (quem decide o que falta é o dono do rebanho)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marca/desmarca "esta vacina deste animal está pendente". Aplicar a vacina
 * limpa a marca sozinho (ver applyVaccineProtocol).
 */
export async function setVaccinePending(
  animalId: string,
  vaccineId: string,
  pending: boolean,
  note?: string | null
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!animalId || !vaccineId) return { error: "Animal ou vacina não informados" };

  if (!pending) {
    const { error } = await supabase
      .from("animal_vaccine_pending")
      .delete()
      .eq("animal_id", animalId)
      .eq("vaccine_id", vaccineId);
    if (error) return { error: pendingTableError(error) };
    revalidate();
    return { ok: true };
  }

  const { error } = await supabase
    .from("animal_vaccine_pending")
    .upsert(
      { animal_id: animalId, vaccine_id: vaccineId, note: clean(note), created_by: user.id },
      { onConflict: "animal_id,vaccine_id" }
    );
  if (error) return { error: pendingTableError(error) };
  revalidate();
  return { ok: true };
}

/** A tabela vem da migration 044 — sem ela o erro do Postgres não diz nada. */
function pendingTableError(error: { code?: string; message: string }): string {
  if (error.code === "42P01" || error.message.includes("animal_vaccine_pending"))
    return "Rode a migration 044 no Supabase para usar a marcação de pendente";
  return error.message;
}

// ─────────────────────────────────────────────────────────────────────────────
// SAÍDA DO REBANHO (venda ou morte)
// ─────────────────────────────────────────────────────────────────────────────
// Animal que sai não é apagado: fica com active = false e guarda por que saiu.
// Na VENDA o valor cai no financeiro na hora, como entrada já recebida, e o id
// do lançamento fica no animal — é ele que permite desfazer a saída levando o
// dinheiro junto. Na MORTE nada vai para o financeiro.

/** As colunas vêm da migration 056 — sem ela o erro do Postgres não diz nada. */
function exitColumnError(error: { code?: string; message: string }): string {
  if (error.message.includes("sale_mode") || error.message.includes("sale_weight"))
    return "Rode a migration 072 no Supabase para vender no peso";
  if (error.code === "42703" || error.message.includes("exit_"))
    return "Rode a migration 056 no Supabase para registrar venda ou morte";
  return error.message;
}

export interface AnimalExitInput {
  animal_id: string;
  reason: AnimalExitReason;
  /** Data da venda / da morte (YYYY-MM-DD). */
  exit_date: string;
  /**
   * Só na venda — é este valor que entra no financeiro. SEMPRE o total: na
   * venda no peso ele é o resultado de peso × preço do quilo.
   */
  amount?: number | null;
  /** Só na venda — na unidade ou no peso (migration 072). */
  sale_mode?: AnimalSaleMode | null;
  /** Só na venda no peso — quantos quilos saíram. */
  sale_weight_kg?: number | null;
  /** Só na venda no peso — por quanto o quilo foi vendido. */
  sale_price_per_kg?: number | null;
  /** Só na venda — quem comprou. */
  buyer?: string | null;
  notes?: string | null;
}

export async function registerAnimalExit(input: AnimalExitInput) {
  const barrado = await barradoParaVaqueiroN1();
  if (barrado) return barrado;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const reason: AnimalExitReason = input.reason === "morte" ? "morte" : "venda";
  const isSale = reason === "venda";
  const exitDate = input.exit_date || new Date().toISOString().slice(0, 10);

  // Como foi vendido. Só a venda no peso tem peso e preço do quilo; na unidade
  // as duas colunas ficam zeradas para não sobrar número que não vale nada.
  const saleMode: AnimalSaleMode =
    isSale && input.sale_mode === "peso" ? "peso" : "unidade";
  const noPeso = isSale && saleMode === "peso";
  const weight = noPeso ? money(input.sale_weight_kg) : 0;
  const pricePerKg = noPeso ? money(input.sale_price_per_kg) : 0;

  // O TOTAL é o que entra no financeiro e o que a ficha soma. Na venda no peso
  // a conta é feita AQUI, e não na tela: quem lança digita o peso e o preço, e
  // o servidor é que decide quanto é — assim os dois nunca discordam.
  const amount = !isSale
    ? 0
    : noPeso
      ? money(weight * pricePerKg)
      : money(input.amount);

  if (!input.animal_id) return { error: "Animal não informado" };
  if (isSale && noPeso) {
    if (weight <= 0) return { error: "Informe o peso vendido" };
    if (pricePerKg <= 0) return { error: "Informe o valor do quilo" };
  }
  if (isSale && amount <= 0) return { error: "Informe o valor da venda" };

  const { data: animal } = await supabase
    .from("animals")
    .select("id, tag, active")
    .eq("id", input.animal_id)
    .maybeSingle<{ id: string; tag: string; active: boolean }>();
  if (!animal) return { error: "Animal não encontrado" };
  if (!animal.active) return { error: "Este animal já saiu do rebanho" };

  // 1) tira do rebanho primeiro: se faltar a migration, para aqui — antes de
  //    mexer no dinheiro de alguém.
  const { error: outErr } = await supabase
    .from("animals")
    .update({
      active: false,
      exit_reason: reason,
      exit_date: exitDate,
      exit_amount: amount,
      sale_mode: isSale ? saleMode : null,
      sale_weight_kg: weight,
      sale_price_per_kg: pricePerKg,
      exit_buyer: isSale ? clean(input.buyer) : null,
      exit_notes: clean(input.notes),
      exit_transaction_id: null,
    })
    .eq("id", animal.id);
  if (outErr) return { error: exitColumnError(outErr) };

  // 2) venda: o valor entra no financeiro como recebido
  if (isSale) {
    const { data: cat } = await supabase
      .from("categories")
      .select("id")
      .eq("name", "Venda de animais")
      .eq("type", "entrada")
      .maybeSingle<{ id: string }>();

    const buyer = clean(input.buyer);
    // a conta vai na descrição: quem abre Contas seis meses depois precisa ver
    // que os R$ 4.800 foram 400 kg a R$ 12,00, e não um preço fechado
    const comoFoi = noPeso
      ? ` (${weight} KG X ${pricePerKg.toFixed(2).replace(".", ",")}/KG)`
      : "";
    const { data: tx, error: txErr } = await supabase
      .from("transactions")
      .insert({
        type: "entrada",
        status: "recebido",
        amount,
        description: `VENDA DE ANIMAL Nº ${animal.tag}${comoFoi}${buyer ? ` - ${buyer}` : ""}`,
        due_date: exitDate,
        paid_date: exitDate,
        category_id: cat?.id ?? null,
        notes: clean(input.notes),
        created_by: user.id,
      })
      .select("id")
      .single();

    if (txErr || !tx) {
      // desfaz a saída para o animal não sumir do rebanho sem o dinheiro entrar
      await supabase
        .from("animals")
        .update({
          active: true,
          exit_reason: null,
          exit_date: null,
          exit_amount: 0,
          sale_mode: null,
          sale_weight_kg: 0,
          sale_price_per_kg: 0,
          exit_buyer: null,
          exit_notes: null,
          exit_transaction_id: null,
        })
        .eq("id", animal.id);
      return { error: txErr?.message ?? "Erro ao lançar a venda no financeiro" };
    }

    await supabase
      .from("animals")
      .update({ exit_transaction_id: tx.id })
      .eq("id", animal.id);
  }

  revalidate();
  return { ok: true };
}

/** Desfaz a saída: o animal volta ao rebanho e o lançamento da venda é apagado. */
export async function undoAnimalExit(animalId: string) {
  const barrado = await barradoParaVaqueiroN1();
  if (barrado) return barrado;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { data: animal, error: readErr } = await supabase
    .from("animals")
    .select("id, exit_transaction_id")
    .eq("id", animalId)
    .maybeSingle<{ id: string; exit_transaction_id: string | null }>();
  if (readErr) return { error: exitColumnError(readErr) };
  if (!animal) return { error: "Animal não encontrado" };

  if (animal.exit_transaction_id) {
    await supabase.from("transactions").delete().eq("id", animal.exit_transaction_id);
  }

  const { error } = await supabase
    .from("animals")
    .update({
      active: true,
      exit_reason: null,
      exit_date: null,
      exit_amount: 0,
      sale_mode: null,
      sale_weight_kg: 0,
      sale_price_per_kg: 0,
      exit_buyer: null,
      exit_notes: null,
      exit_transaction_id: null,
    })
    .eq("id", animalId);
  if (error) return { error: exitColumnError(error) };

  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// DESMAME (migration 145)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marca o desmame das crias (ou desfaz, com `data` null). É a data gravada
 * que tira a cria do alerta de desmame — sem ela, a cria de 8 meses aparece.
 */
export async function marcarDesmame(animalIds: string[], data: string | null) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };
  if (animalIds.length === 0) return { error: "Nenhuma cria escolhida" };
  if (data !== null && !/^\d{4}-\d{2}-\d{2}$/.test(data)) return { error: "Data inválida" };
  if (data !== null && data > localDateISO()) return { error: "O desmame não pode ser no futuro" };

  const { error } = await supabase
    .from("animals")
    .update({ desmame_em: data })
    .in("id", animalIds);
  if (error) {
    if (/desmame_em/.test(error.message)) {
      return { error: "Falta rodar a migration 145 (desmame) no banco." };
    }
    return { error: error.message };
  }

  revalidatePath("/animais");
  // o sino do topo conta as crias prontas para desmamar
  revalidatePath("/", "layout");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// DESPESA COM ANIMAIS — a ficha de custo por espécie (migration 072)
// ─────────────────────────────────────────────────────────────────────────────
// A venda já ia para o financeiro; o GASTO com os bichos não tinha onde ser
// lançado. Sem os dois lados juntos não dá para responder "o caprino se paga?".
//
// A ESPÉCIE é obrigatória de propósito: é ela que a ficha separa. Despesa sem
// espécie não entra em conta nenhuma.
//
// Isto NÃO cria lançamento no módulo Contas — é registro e relatório dentro de
// Animais, como a despesa da obra (migration 067).

/**
 * A dica de "rode a migration" só vale quando a tabela realmente não existe.
 * O nome da tabela aparece em QUALQUER erro dela — inclusive na trava da
 * espécie e no RLS —, e mandar rodar uma migration já rodada faz procurar o
 * problema no lugar errado.
 */
function despesaError(error: { code?: string; message: string }): string {
  // As colunas da conta (quantidade, unidade, valor unitário) são da 092. Sem
  // separar, o recado mandava rodar a 072 — que já tinha rodado.
  if (
    /quantity|unit_price|unit\b/.test(error.message) &&
    (error.code === "42703" || error.code === "PGRST204")
  )
    return "Rode a migration 092 no Supabase para lançar quantidade, unidade e valor unitário";

  if (error.code === "42P01" || error.code === "42703")
    return "Rode a migration 072 no Supabase para lançar despesas com animais";

  // A trava lista as espécies que a despesa aceita. Piscicultura e aves só
  // entram nela na 087 — quem rodou só a 086 esbarra exatamente aqui.
  if (
    error.code === "23514" ||
    error.message.includes("animal_despesas_species_check")
  )
    return "Este tipo de animal ainda não é aceito na despesa. Rode a migration 087 no Supabase para liberar piscicultura e aves.";

  if (error.code === "42501" || /row.level security/i.test(error.message))
    return "Seu usuário não tem permissão para lançar despesa de animais.";

  return error.code ? `${error.message} (código ${error.code})` : error.message;
}

export interface AnimalDespesaInput {
  species: AnimalSpecies;
  /** De qual ciclo é o gasto (089) — em branco, vale para a espécie. */
  lote_id?: string | null;
  /** Só quando o gasto foi de UM animal — em branco vale para a espécie toda. */
  animal_id?: string | null;
  expense_date?: string | null;
  category?: string | null;
  /** O produto comprado. */
  description: string;
  /** A conta da compra (092) — opcional: frete e diária não têm quantidade. */
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  /** O TOTAL do gasto: é este valor que a ficha soma. */
  amount: number;
  supplier?: string | null;
  notes?: string | null;
}

/** Monta a linha, com a espécie já validada contra o que o banco aceita. */
function despesaRow(input: AnimalDespesaInput) {
  return {
    species: SPECIES_LABEL[input.species] ? input.species : "bovino",
    animal_id: input.animal_id || null,
    lote_id: input.lote_id || null,
    expense_date: input.expense_date?.trim() || undefined,
    category: clean(input.category),
    description: clean(input.description),
    quantity: qtd(input.quantity),
    unit: clean(input.unit),
    unit_price: money(input.unit_price),
    // O total é o que a ficha soma. Quando não veio digitado mas a conta dá
    // para ser feita, ela vale — quem preencheu quantidade e valor unitário
    // não deve ter de repetir o resultado.
    amount: money(input.amount) || qtd(input.quantity) * money(input.unit_price),
    supplier: clean(input.supplier),
    notes: clean(input.notes),
  };
}

function despesaInvalida(input: AnimalDespesaInput): string | null {
  if (!clean(input.description)) return "Escreva qual foi o produto";
  if (despesaRow(input).amount <= 0) return "Informe o valor da despesa";
  return null;
}

export async function createAnimalDespesa(input: AnimalDespesaInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const falta = despesaInvalida(input);
  if (falta) return { error: falta };

  const { error } = await supabase
    .from("animal_despesas")
    .insert({ ...despesaRow(input), created_by: user.id });

  if (error) return { error: despesaError(error) };
  revalidate();
  return { ok: true };
}

export async function updateAnimalDespesa(id: string, input: AnimalDespesaInput) {
  const supabase = createClient();

  const falta = despesaInvalida(input);
  if (falta) return { error: falta };

  const { error } = await supabase
    .from("animal_despesas")
    .update(despesaRow(input))
    .eq("id", id);

  if (error) return { error: despesaError(error) };
  revalidate();
  return { ok: true };
}

export async function deleteAnimalDespesa(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("animal_despesas").delete().eq("id", id);
  if (error) return { error: despesaError(error) };
  revalidate();
  return { ok: true };
}

/**
 * NOTA DIVIDIDA ENTRE OS TANQUES (migration 111).
 *
 * A nota de ração é uma só, mas a ração vai para todos os tanques com peixe.
 * Ela vira uma despesa em cada ciclo, com a parte dele — a tela já fez a
 * conta (pelo peixe vivo ou em partes iguais) e manda as partes prontas. As
 * partes levam o mesmo `rateio_id`: é o que deixa apagar a nota inteira.
 */
export async function createAnimalDespesaDividida(
  input: AnimalDespesaInput,
  partes: { lote_id: string; amount: number; quantity?: number | null }[]
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const falta = despesaInvalida(input);
  if (falta) return { error: falta };

  const validas = partes.filter((p) => p.lote_id && money(p.amount) > 0);
  if (validas.length < 2) return { error: "Escolha pelo menos dois tanques para dividir" };

  // A soma das partes tem de fechar com a nota: a tela arredonda os centavos
  // no último tanque, então qualquer diferença aqui é erro, não arredondamento.
  const total = despesaRow(input).amount;
  const soma = validas.reduce((s, p) => s + money(p.amount), 0);
  if (Math.abs(soma - total) >= 0.01) {
    return { error: "A soma das partes não fecha com o valor da nota — confira a divisão" };
  }

  const rateioId = randomUUID();
  const base = despesaRow(input);
  const local = input.species === "aves" ? "GALPÕES" : "TANQUES";
  const marca = `NOTA DE ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} DIVIDIDA EM ${validas.length} ${local}`;
  const linhas = validas.map((p) => ({
    ...base,
    lote_id: p.lote_id,
    animal_id: null,
    amount: money(p.amount),
    quantity: p.quantity != null ? qtd(p.quantity) : base.quantity,
    notes: base.notes ? `${base.notes} · ${marca}` : marca,
    created_by: user.id,
  }));

  let { error } = await supabase
    .from("animal_despesas")
    .insert(linhas.map((l) => ({ ...l, rateio_id: rateioId })));

  // Sem a 111 a coluna não existe: a divisão sai igual, só sem o vínculo que
  // deixa apagar a nota inteira de uma vez.
  if (error && /rateio_id/.test(error.message)) {
    ({ error } = await supabase.from("animal_despesas").insert(linhas));
  }

  if (error) return { error: despesaError(error) };
  revalidate();
  return { ok: true };
}

/** Apaga a nota dividida inteira — a parte de todos os tanques. */
export async function deleteAnimalDespesaDividida(rateioId: string) {
  if (!rateioId) return { error: "Nota não encontrada" };
  const supabase = createClient();
  const { error } = await supabase.from("animal_despesas").delete().eq("rateio_id", rateioId);
  if (error) return { error: despesaError(error) };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// VENDA DE LOTE (migration 088) — o peixe e a ave, que não têm brinco
// ─────────────────────────────────────────────────────────────────────────────
// A venda do módulo só sabia nascer da baixa de um bicho cadastrado. Quem cria
// peixe vende "320 kg de tilápia a R$ 18,00" sem nunca ter cadastrado tilápia
// nenhuma — e esse dinheiro não tinha por onde entrar.
//
// Como a venda do animal, esta TAMBÉM vira lançamento no módulo Contas: é
// dinheiro que entrou de verdade. O id do lançamento fica guardado na linha,
// para corrigir e apagar os dois juntos.

function vendaError(error: { code?: string; message: string }): string {
  if (error.code === "42P01" || error.code === "42703")
    return "Rode a migration 088 no Supabase para lançar venda de lote";
  if (
    error.code === "23514" ||
    error.message.includes("animal_vendas_species_check") ||
    error.message.includes("animal_vendas_mode_check")
  )
    return "Este tipo de animal ou esta forma de venda ainda não é aceita. Confira se as migrations 086, 087 e 088 rodaram.";
  if (error.code === "42501" || /row.level security/i.test(error.message))
    return "Seu usuário não tem permissão para lançar venda de animais.";
  return error.code ? `${error.message} (código ${error.code})` : error.message;
}

export interface AnimalVendaInput {
  species: AnimalSpecies;
  /** De qual ciclo saiu (089) — em branco, vale para a espécie. */
  lote_id?: string | null;
  sale_date?: string | null;
  sale_mode: AnimalSaleMode;
  /** Só em "unidade". */
  quantity?: number | null;
  price_per_unit?: number | null;
  /** Só em "peso". */
  weight_kg?: number | null;
  price_per_kg?: number | null;
  description: string;
  buyer?: string | null;
  notes?: string | null;
  /**
   * O dinheiro já entrou? Falso lança em Contas como PENDENTE, sem data de
   * pagamento — é a venda fiada, que existe e precisa ser cobrada.
   */
  received?: boolean;
}

/**
 * A conta da venda, feita SEMPRE no servidor.
 *
 * O total que a tela mostra é conferência para quem digita; o que vale é este,
 * refeito aqui — senão bastaria mexer no que sobe do navegador para gravar uma
 * receita que não bate com a quantidade nem com o preço.
 */
function contaDaVenda(input: AnimalVendaInput) {
  const noPeso = input.sale_mode === "peso";
  const quantity = normWeight(input.quantity);
  const pricePerUnit = noPeso ? 0 : money(input.price_per_unit);
  const weight = noPeso ? normWeight(input.weight_kg) : 0;
  const pricePerKg = noPeso ? money(input.price_per_kg) : 0;
  const total = money(noPeso ? weight * pricePerKg : quantity * pricePerUnit);
  return { noPeso, quantity, pricePerUnit, weight, pricePerKg, total };
}

function vendaInvalida(input: AnimalVendaInput): string | null {
  if (!clean(input.description)) return "Escreva o que foi vendido";
  const c = contaDaVenda(input);
  if (c.noPeso) {
    if (c.weight <= 0) return "Informe quantos quilos foram vendidos";
    if (c.pricePerKg <= 0) return "Informe o valor do quilo";
  } else {
    if (c.quantity <= 0) return "Informe quantas unidades foram vendidas";
    if (c.pricePerUnit <= 0) return "Informe o valor da unidade";
  }
  // No peso a quantidade é opcional — nem sempre se conta peixe na despesca.
  if (c.total <= 0) return "O total da venda ficou zerado — confira a conta";
  return null;
}

function vendaRow(input: AnimalVendaInput) {
  const c = contaDaVenda(input);
  return {
    species: SPECIES_LABEL[input.species] ? input.species : "bovino",
    lote_id: input.lote_id || null,
    sale_date: input.sale_date?.trim() || undefined,
    sale_mode: c.noPeso ? "peso" : "unidade",
    quantity: c.quantity,
    price_per_unit: c.pricePerUnit,
    weight_kg: c.weight,
    price_per_kg: c.pricePerKg,
    amount: c.total,
    description: clean(input.description),
    buyer: clean(input.buyer),
    notes: clean(input.notes),
  };
}

/** A conta por extenso, para quem abrir Contas daqui a seis meses entender. */
function vendaTextoDaConta(input: AnimalVendaInput): string {
  const c = contaDaVenda(input);
  const preco = (v: number) => v.toFixed(2).replace(".", ",");
  if (!c.noPeso) return ` (${c.quantity} UN X ${preco(c.pricePerUnit)})`;
  const cabecas = c.quantity > 0 ? `${c.quantity} UN, ` : "";
  return ` (${cabecas}${c.weight} KG X ${preco(c.pricePerKg)}/KG)`;
}

/** O lançamento que a venda gera no módulo Contas. */
async function lancamentoDaVenda(
  supabase: ReturnType<typeof createClient>,
  input: AnimalVendaInput,
  userId: string
) {
  const { data: cat } = await supabase
    .from("categories")
    .select("id")
    .eq("name", "Venda de animais")
    .eq("type", "entrada")
    .maybeSingle<{ id: string }>();

  const row = vendaRow(input);
  const buyer = clean(input.buyer);
  const recebido = input.received !== false;
  const quando = row.sale_date ?? localDateISO();
  return {
    type: "entrada" as const,
    status: recebido ? ("recebido" as const) : ("pendente" as const),
    amount: row.amount,
    description: `VENDA ${row.description}${vendaTextoDaConta(input)}${buyer ? ` - ${buyer}` : ""}`,
    due_date: quando,
    paid_date: recebido ? quando : null,
    category_id: cat?.id ?? null,
    notes: clean(input.notes),
    created_by: userId,
  };
}

export async function createAnimalVenda(input: AnimalVendaInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const falta = vendaInvalida(input);
  if (falta) return { error: falta };

  const { data: tx, error: txErr } = await supabase
    .from("transactions")
    .insert(await lancamentoDaVenda(supabase, input, user.id))
    .select("id")
    .single();
  if (txErr || !tx) return { error: txErr?.message ?? "Erro ao lançar a venda no financeiro" };

  const { error } = await supabase
    .from("animal_vendas")
    .insert({ ...vendaRow(input), transaction_id: tx.id, created_by: user.id });

  if (error) {
    // o lançamento não pode ficar órfão em Contas se a venda não entrou
    await supabase.from("transactions").delete().eq("id", tx.id);
    return { error: vendaError(error) };
  }

  revalidate();
  return { ok: true };
}

export async function updateAnimalVenda(id: string, input: AnimalVendaInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const falta = vendaInvalida(input);
  if (falta) return { error: falta };

  const { data: atual } = await supabase
    .from("animal_vendas")
    .select("transaction_id")
    .eq("id", id)
    .maybeSingle<{ transaction_id: string | null }>();

  const { error } = await supabase
    .from("animal_vendas")
    .update(vendaRow(input))
    .eq("id", id);
  if (error) return { error: vendaError(error) };

  // Contas anda junto: corrigir o quilo aqui e deixar o valor velho lá seria
  // pior do que não ter o lançamento nenhum.
  const lancamento = await lancamentoDaVenda(supabase, input, user.id);
  if (atual?.transaction_id) {
    await supabase
      .from("transactions")
      .update(lancamento)
      .eq("id", atual.transaction_id);
  } else {
    const { data: tx } = await supabase
      .from("transactions")
      .insert(lancamento)
      .select("id")
      .single();
    if (tx) await supabase.from("animal_vendas").update({ transaction_id: tx.id }).eq("id", id);
  }

  revalidate();
  return { ok: true };
}

export async function deleteAnimalVenda(id: string) {
  const supabase = createClient();

  const { data: atual } = await supabase
    .from("animal_vendas")
    .select("transaction_id")
    .eq("id", id)
    .maybeSingle<{ transaction_id: string | null }>();

  const { error } = await supabase.from("animal_vendas").delete().eq("id", id);
  if (error) return { error: vendaError(error) };

  if (atual?.transaction_id) {
    await supabase.from("transactions").delete().eq("id", atual.transaction_id);
  }

  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// TANQUE, CICLO E MOVIMENTO (migration 089)
// ─────────────────────────────────────────────────────────────────────────────
// O TANQUE é o lugar e existe para sempre. O CICLO é o povoamento dele, que
// fecha na despesca. O MOVIMENTO é o que mexe na quantidade. Despesa e venda
// apontam para o ciclo — é daí que sai o bruto e o líquido de cada tanque.

function loteError(error: { code?: string; message: string }): string {
  if (error.code === "42P01" || error.code === "42703")
    return "Rode a migration 089 no Supabase para controlar tanque e ciclo";
  if (error.message.includes("uq_animal_lote_aberto"))
    return "Este tanque já tem um ciclo aberto. Feche o ciclo atual antes de abrir outro.";
  if (error.message.includes("uq_animal_tanques_nome"))
    return "Já existe um tanque com esse nome nesta criação";
  if (error.code === "23503")
    return "Não dá para apagar: ainda há lançamento amarrado a isto.";
  if (error.code === "42501" || /row.level security/i.test(error.message))
    return "Seu usuário não tem permissão para mexer em tanque e ciclo.";
  return error.code ? `${error.message} (código ${error.code})` : error.message;
}

// ── Tanque ───────────────────────────────────────────────────────────────────

export interface AnimalTanqueInput {
  species: AnimalSpecies;
  name: string;
  active?: boolean;
  notes?: string | null;
}

export async function createAnimalTanque(input: AnimalTanqueInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };
  if (!clean(input.name)) return { error: "Dê um nome ao tanque" };

  const { error } = await supabase.from("animal_tanques").insert({
    species: SPECIES_LABEL[input.species] ? input.species : "piscicultura",
    name: clean(input.name),
    active: input.active ?? true,
    notes: clean(input.notes),
    created_by: user.id,
  });

  if (error) return { error: loteError(error) };
  revalidate();
  return { ok: true };
}

export async function updateAnimalTanque(id: string, input: AnimalTanqueInput) {
  const supabase = createClient();
  if (!clean(input.name)) return { error: "Dê um nome ao tanque" };

  const { error } = await supabase
    .from("animal_tanques")
    .update({
      species: SPECIES_LABEL[input.species] ? input.species : "piscicultura",
      name: clean(input.name),
      active: input.active ?? true,
      notes: clean(input.notes),
    })
    .eq("id", id);

  if (error) return { error: loteError(error) };
  revalidate();
  return { ok: true };
}

/** Só apaga tanque vazio: com ciclo, o histórico dele iria junto. */
export async function deleteAnimalTanque(id: string) {
  const supabase = createClient();

  const { count } = await supabase
    .from("animal_lotes")
    .select("id", { count: "exact", head: true })
    .eq("tanque_id", id);

  if ((count ?? 0) > 0)
    return {
      error:
        "Este tanque já teve ciclo. Em vez de apagar, desative — assim o histórico dele fica.",
    };

  const { error } = await supabase.from("animal_tanques").delete().eq("id", id);
  if (error) return { error: loteError(error) };
  revalidate();
  return { ok: true };
}

// ── Ciclo ────────────────────────────────────────────────────────────────────

export interface AnimalLoteInput {
  tanque_id: string;
  species: AnimalSpecies;
  name?: string | null;
  start_date?: string | null;
  notes?: string | null;
  /** Só ao ABRIR: vira o primeiro movimento de entrada. */
  quantity?: number | null;
}

export async function createAnimalLote(input: AnimalLoteInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };
  if (!input.tanque_id) return { error: "Escolha o tanque" };

  const entrada = normWeight(input.quantity);
  if (entrada <= 0) return { error: "Informe quantos entraram no tanque" };

  const { data: lote, error } = await supabase
    .from("animal_lotes")
    .insert({
      tanque_id: input.tanque_id,
      species: SPECIES_LABEL[input.species] ? input.species : "piscicultura",
      name: clean(input.name),
      start_date: input.start_date?.trim() || undefined,
      notes: clean(input.notes),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !lote) return { error: loteError(error ?? { message: "Erro ao abrir o ciclo" }) };

  // A quantidade inicial É o primeiro movimento. Se ele não entrar, o ciclo
  // volta atrás: ciclo aberto com zero dentro é pior do que nenhum ciclo.
  const { error: movErr } = await supabase.from("animal_lote_movimentos").insert({
    lote_id: lote.id,
    kind: "entrada",
    moved_on: input.start_date?.trim() || undefined,
    quantity: entrada,
    notes: "ABERTURA DO CICLO",
    created_by: user.id,
  });

  if (movErr) {
    await supabase.from("animal_lotes").delete().eq("id", lote.id);
    return { error: loteError(movErr) };
  }

  revalidate();
  return { ok: true };
}

/** Corrige o cabeçalho do ciclo. A quantidade se corrige por movimento. */
export async function updateAnimalLote(id: string, input: AnimalLoteInput) {
  const supabase = createClient();
  if (!input.tanque_id) return { error: "Escolha o tanque" };

  const { error } = await supabase
    .from("animal_lotes")
    .update({
      tanque_id: input.tanque_id,
      species: SPECIES_LABEL[input.species] ? input.species : "piscicultura",
      name: clean(input.name),
      start_date: input.start_date?.trim() || undefined,
      notes: clean(input.notes),
    })
    .eq("id", id);

  if (error) return { error: loteError(error) };
  revalidate();
  return { ok: true };
}

/** Só apaga ciclo sem dinheiro amarrado — venda e despesa ficariam órfãs. */
export async function deleteAnimalLote(id: string) {
  const supabase = createClient();

  const [{ count: vendas }, { count: despesas }] = await Promise.all([
    supabase.from("animal_vendas").select("id", { count: "exact", head: true }).eq("lote_id", id),
    supabase.from("animal_despesas").select("id", { count: "exact", head: true }).eq("lote_id", id),
  ]);

  if ((vendas ?? 0) > 0 || (despesas ?? 0) > 0)
    return {
      error:
        "Este ciclo já tem venda ou despesa lançada. Desamarre esses lançamentos antes de apagar — ou feche o ciclo, em vez de apagar.",
    };

  const { error } = await supabase.from("animal_lotes").delete().eq("id", id);
  if (error) return { error: loteError(error) };
  revalidate();
  return { ok: true };
}

/**
 * Fecha o ciclo — e ZERA a sobra no mesmo ato.
 *
 * O saldo de quem cria peixe é estimativa: ninguém conta tilápia na despesca.
 * Fechar deixando 400 peixes pendurados faz o relatório mentir seis meses
 * depois, então o que sobra vira uma correção de contagem visível na lista de
 * movimentos, com o motivo escrito.
 */
export async function fecharAnimalLote(id: string, closed_at?: string | null) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { data: resumo, error: readErr } = await supabase
    .from("v_animal_lotes")
    .select("saldo, status")
    .eq("id", id)
    .maybeSingle<{ saldo: number; status: string }>();

  if (readErr) return { error: loteError(readErr) };
  if (!resumo) return { error: "Ciclo não encontrado" };
  if (resumo.status === "fechado") return { error: "Este ciclo já está fechado" };

  const sobra = Number(resumo.saldo ?? 0);
  if (sobra !== 0) {
    const { error: movErr } = await supabase.from("animal_lote_movimentos").insert({
      lote_id: id,
      kind: "ajuste",
      moved_on: closed_at?.trim() || undefined,
      quantity: -sobra,
      notes: "FECHAMENTO DO CICLO",
      created_by: user.id,
    });
    if (movErr) return { error: loteError(movErr) };
  }

  const { error } = await supabase
    .from("animal_lotes")
    .update({ status: "fechado", closed_at: closed_at?.trim() || localDateISO() })
    .eq("id", id);

  if (error) return { error: loteError(error) };
  revalidate();
  return { ok: true };
}

/** Reabre o ciclo. O ajuste do fechamento fica — some pela lista de movimentos. */
export async function reabrirAnimalLote(id: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("animal_lotes")
    .update({ status: "aberto", closed_at: null })
    .eq("id", id);

  if (error) return { error: loteError(error) };
  revalidate();
  return { ok: true };
}

// ── Movimento ────────────────────────────────────────────────────────────────

export interface AnimalLoteMovimentoInput {
  lote_id: string;
  kind: AnimalLoteMovimentoKind;
  moved_on?: string | null;
  /** Sempre positivo, menos no ajuste, que aceita negativo. */
  quantity: number;
  notes?: string | null;
}

export async function createAnimalLoteMovimento(input: AnimalLoteMovimentoInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };
  if (!input.lote_id) return { error: "Ciclo não informado" };

  const qtd =
    input.kind === "ajuste"
      ? Math.round(Number(input.quantity ?? 0) * 1000) / 1000
      : normWeight(input.quantity);

  if (input.kind === "ajuste" && qtd === 0)
    return { error: "A correção não pode ser zero" };
  if (input.kind !== "ajuste" && qtd <= 0) return { error: "Informe a quantidade" };

  const { error } = await supabase.from("animal_lote_movimentos").insert({
    lote_id: input.lote_id,
    kind: input.kind,
    moved_on: input.moved_on?.trim() || undefined,
    quantity: qtd,
    notes: clean(input.notes),
    created_by: user.id,
  });

  if (error) return { error: loteError(error) };
  revalidate();
  return { ok: true };
}

export async function deleteAnimalLoteMovimento(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("animal_lote_movimentos").delete().eq("id", id);
  if (error) return { error: loteError(error) };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// LOTES DO REBANHO (migration 134)
// ─────────────────────────────────────────────────────────────────────────────
// Bicho com brinco separado por lote, com o dia em que cada um entrou. Um
// animal fica em um lote por vez: pôr num lote novo fecha a entrada no antigo.
// (O "lote" de tanque e galpão, mais acima, é outra coisa.)

function grupoError(error: { code?: string; message: string }): string {
  // tabela que não existe: a migration ainda não rodou
  if (error.code === "42P01" || error.code === "PGRST205")
    return "Rode a migration 134 no Supabase para separar o rebanho em lotes";
  if (error.message.includes("uq_animal_grupos_nome"))
    return "Já existe um lote com esse nome neste tipo de animal";
  if (error.message.includes("uq_animal_grupo_aberto"))
    return "Algum desses animais já está em outro lote. Recarregue a página e tente de novo.";
  if (error.message.includes("animal_grupo_animais_datas_check"))
    return "A data de saída não pode ser antes da data de entrada no lote";
  if (error.code === "42501" || /row.level security/i.test(error.message))
    return "Seu usuário não tem permissão para mexer nos lotes.";
  return error.code ? `${error.message} (código ${error.code})` : error.message;
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

export interface AnimalGrupoInput {
  species: AnimalSpecies;
  name: string;
  notes?: string | null;
  active?: boolean;
}

export async function createAnimalGrupo(input: AnimalGrupoInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };
  if (!clean(input.name)) return { error: "Dê um nome ao lote" };
  if (input.species === "piscicultura" || input.species === "aves")
    return { error: "Peixe e ave já se separam por tanque e galpão" };

  const { data, error } = await supabase
    .from("animal_grupos")
    .insert({
      species: normSpecies(input.species),
      name: clean(input.name),
      notes: clean(input.notes),
      active: input.active ?? true,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) return { error: grupoError(error) };
  revalidate();
  return { ok: true, id: data.id as string };
}

/** O tipo do lote não muda: os animais dentro dele são daquele tipo. */
export async function updateAnimalGrupo(id: string, input: AnimalGrupoInput) {
  const supabase = createClient();
  if (!clean(input.name)) return { error: "Dê um nome ao lote" };

  const { error } = await supabase
    .from("animal_grupos")
    .update({
      name: clean(input.name),
      notes: clean(input.notes),
      active: input.active ?? true,
    })
    .eq("id", id);

  if (error) return { error: grupoError(error) };
  revalidate();
  return { ok: true };
}

/** Apaga o lote e o histórico de quem passou por ele. Os animais ficam. */
export async function deleteAnimalGrupo(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("animal_grupos").delete().eq("id", id);
  if (error) return { error: grupoError(error) };
  revalidate();
  return { ok: true };
}

/**
 * Põe os animais no lote, a partir do dia `joined_on`. Quem estava em outro
 * lote sai dele nesse mesmo dia (ou no dia em que entrou lá, se a entrada lá
 * for depois — a saída nunca fica antes da entrada). Quem já está neste lote
 * fica como está.
 */
export async function addAnimaisAoGrupo(input: {
  grupo_id: string;
  animal_ids: string[];
  joined_on: string;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const ids = Array.from(new Set(input.animal_ids.filter(Boolean)));
  if (ids.length === 0) return { error: "Escolha os animais" };
  if (!DATA_ISO.test(input.joined_on)) return { error: "Escolha a data de entrada" };

  const { data: grupo, error: gErr } = await supabase
    .from("animal_grupos")
    .select("id, species, name")
    .eq("id", input.grupo_id)
    .single();
  if (gErr || !grupo) return { error: gErr ? grupoError(gErr) : "Lote não encontrado" };

  const { data: bichos, error: aErr } = await supabase
    .from("animals")
    .select("id, tag, species, active")
    .in("id", ids);
  if (aErr) return { error: aErr.message };
  const outroTipo = (bichos ?? []).filter(
    (a) => normSpecies(a.species as AnimalSpecies | null) !== grupo.species
  );
  if (outroTipo.length > 0)
    return {
      error: `O lote ${grupo.name} é de ${SPECIES_LABEL[grupo.species as AnimalSpecies]}. Tire da escolha: ${outroTipo
        .map((a) => a.tag)
        .join(", ")}`,
    };

  // onde cada um está hoje
  const { data: abertas, error: oErr } = await supabase
    .from("animal_grupo_animais")
    .select("id, grupo_id, animal_id, joined_on")
    .in("animal_id", ids)
    .is("left_on", null);
  if (oErr) return { error: grupoError(oErr) };

  const jaAqui = new Set(
    (abertas ?? []).filter((m) => m.grupo_id === grupo.id).map((m) => m.animal_id as string)
  );
  const mudam = (abertas ?? []).filter((m) => m.grupo_id !== grupo.id);

  // fecha a entrada no lote antigo
  const noDia = mudam.filter((m) => (m.joined_on as string) <= input.joined_on).map((m) => m.id);
  if (noDia.length > 0) {
    const { error } = await supabase
      .from("animal_grupo_animais")
      .update({ left_on: input.joined_on })
      .in("id", noDia);
    if (error) return { error: grupoError(error) };
  }
  for (const m of mudam.filter((m) => (m.joined_on as string) > input.joined_on)) {
    const { error } = await supabase
      .from("animal_grupo_animais")
      .update({ left_on: m.joined_on })
      .eq("id", m.id);
    if (error) return { error: grupoError(error) };
  }

  const novos = ids.filter((id) => !jaAqui.has(id));
  if (novos.length > 0) {
    const { error } = await supabase.from("animal_grupo_animais").insert(
      novos.map((animal_id) => ({
        grupo_id: grupo.id,
        animal_id,
        joined_on: input.joined_on,
        created_by: user.id,
      }))
    );
    if (error) return { error: grupoError(error) };
  }

  revalidate();
  return { ok: true, adicionados: novos.length, mudaramDeLote: mudam.length };
}

/** Tira o animal do lote no dia `left_on` — a passagem dele fica no histórico. */
export async function tirarAnimalDoGrupo(membroId: string, left_on: string) {
  const supabase = createClient();
  if (!DATA_ISO.test(left_on)) return { error: "Escolha a data de saída" };
  const { error } = await supabase
    .from("animal_grupo_animais")
    .update({ left_on })
    .eq("id", membroId);
  if (error) return { error: grupoError(error) };
  revalidate();
  return { ok: true };
}

/** Corrige o dia em que o animal entrou no lote. */
export async function updateEntradaNoGrupo(membroId: string, joined_on: string) {
  const supabase = createClient();
  if (!DATA_ISO.test(joined_on)) return { error: "Escolha a data de entrada" };
  const { error } = await supabase
    .from("animal_grupo_animais")
    .update({ joined_on })
    .eq("id", membroId);
  if (error) return { error: grupoError(error) };
  revalidate();
  return { ok: true };
}

/** Apaga a passagem pelo lote — para o animal que foi posto ali por engano. */
export async function deleteEntradaNoGrupo(membroId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("animal_grupo_animais").delete().eq("id", membroId);
  if (error) return { error: grupoError(error) };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// PROTOCOLOS DE MEDICAMENTO (migration 108)
// ─────────────────────────────────────────────────────────────────────────────
// Medicamento (com a regra de dose) → protocolo (quais e em que dia) →
// programação (o protocolo num grupo de animais, a partir de uma data). Cada
// etapa marcada como aplicada vira tratamento na ficha de cada animal.

function protocolosError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Já existe um medicamento com esse nome nesse tipo de animal";
  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message.includes("animal_medicamentos") ||
    error.message.includes("animal_protocolo") ||
    error.message.includes("protocolo_aplicacao_id")
  )
    return "Rode a migration 108 no Supabase para usar os protocolos de medicamento";
  return error.message;
}

export interface MedicamentoInput {
  species: AnimalSpecies;
  name: string;
  default_dose_ml?: number | null;
  dose_ml_per_weight?: number | null;
  dose_weight_kg?: number | null;
  notes?: string | null;
}

function medicamentoFields(input: MedicamentoInput) {
  const perWeight = normDose(input.dose_ml_per_weight);
  const weightKg = normDose(input.dose_weight_kg);
  return {
    species: normSpecies(input.species),
    name: clean(input.name),
    default_dose_ml: normDose(input.default_dose_ml),
    // a dose por peso só vale com os dois lados preenchidos ("X ml a cada Y kg")
    dose_ml_per_weight: perWeight && weightKg ? perWeight : null,
    dose_weight_kg: perWeight && weightKg ? weightKg : null,
    notes: clean(input.notes),
  };
}

export async function createMedicamento(input: MedicamentoInput) {
  const supabase = createClient();
  const fields = medicamentoFields(input);
  if (!fields.name) return { error: "Informe o nome do medicamento" };
  if (!fields.default_dose_ml && !fields.dose_ml_per_weight)
    return { error: "Informe a dose: fixa em ml ou ml a cada tantos kg" };

  const { data, error } = await supabase
    .from("animal_medicamentos")
    .insert(fields)
    .select("id")
    .single();
  if (error || !data) return { error: error ? protocolosError(error) : "Erro ao cadastrar" };
  revalidate();
  return { ok: true, id: data.id as string };
}

export async function updateMedicamento(id: string, input: MedicamentoInput) {
  const supabase = createClient();
  const fields = medicamentoFields(input);
  if (!fields.name) return { error: "Informe o nome do medicamento" };
  if (!fields.default_dose_ml && !fields.dose_ml_per_weight)
    return { error: "Informe a dose: fixa em ml ou ml a cada tantos kg" };

  const { error } = await supabase.from("animal_medicamentos").update(fields).eq("id", id);
  if (error) return { error: protocolosError(error) };
  revalidate();
  return { ok: true };
}

/**
 * Tira do cadastro. Sai também dos protocolos-modelo (cascade), mas as
 * programações em andamento guardam a fotografia e seguem calculando.
 */
export async function deleteMedicamento(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("animal_medicamentos").delete().eq("id", id);
  if (error) return { error: protocolosError(error) };
  revalidate();
  return { ok: true };
}

export interface ProtocoloInput {
  species: AnimalSpecies;
  name: string;
  notes?: string | null;
  itens: { medicamento_id: string; dia: number }[];
}

/** Grava o modelo. Os itens são trocados inteiros — é uma lista curta. */
export async function saveProtocolo(id: string | null, input: ProtocoloInput) {
  const supabase = createClient();
  const name = clean(input.name);
  if (!name) return { error: "Dê um nome ao protocolo" };

  const itens = (input.itens ?? [])
    .filter((i) => i.medicamento_id)
    .map((i) => ({ medicamento_id: i.medicamento_id, dia: Math.max(0, Math.floor(i.dia || 0)) }));
  if (itens.length === 0) return { error: "Escolha pelo menos um medicamento" };

  const repetidos = new Set<string>();
  for (const i of itens) {
    const k = `${i.dia}|${i.medicamento_id}`;
    if (repetidos.has(k)) return { error: "O mesmo medicamento está duas vezes no mesmo dia" };
    repetidos.add(k);
  }

  const row = { species: normSpecies(input.species), name, notes: clean(input.notes) };
  let protocoloId = id;
  if (protocoloId) {
    const { error } = await supabase.from("animal_protocolos").update(row).eq("id", protocoloId);
    if (error) return { error: protocolosError(error) };
    const { error: delErr } = await supabase
      .from("animal_protocolo_itens")
      .delete()
      .eq("protocolo_id", protocoloId);
    if (delErr) return { error: protocolosError(delErr) };
  } else {
    const { data, error } = await supabase
      .from("animal_protocolos")
      .insert(row)
      .select("id")
      .single();
    if (error || !data) return { error: error ? protocolosError(error) : "Erro ao salvar" };
    protocoloId = data.id as string;
  }

  const { error: itensErr } = await supabase.from("animal_protocolo_itens").insert(
    itens.map((i, idx) => ({ ...i, protocolo_id: protocoloId, sort_order: idx }))
  );
  if (itensErr) return { error: protocolosError(itensErr) };

  revalidate();
  return { ok: true, id: protocoloId };
}

/** Apaga o modelo. As programações feitas com ele continuam (fotografia). */
export async function deleteProtocolo(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("animal_protocolos").delete().eq("id", id);
  if (error) return { error: protocolosError(error) };
  revalidate();
  return { ok: true };
}

/**
 * Cria a programação (a "leva") do protocolo a partir de `start_date`. Guarda a
 * fotografia dos itens com a regra de dose de cada medicamento — é ela que
 * calcula as etapas daqui pra frente, mesmo que o cadastro mude.
 */
async function novaProgramacao(
  supabase: ReturnType<typeof createClient>,
  protocoloId: string,
  startDate: string,
  notes?: string | null
): Promise<{ id: string } | { error: string }> {
  const { data: protocolo, error: pErr } = await supabase
    .from("animal_protocolos")
    .select("id, name, species")
    .eq("id", protocoloId)
    .maybeSingle();
  if (pErr) return { error: protocolosError(pErr) };
  if (!protocolo) return { error: "Protocolo não encontrado" };

  const { data: itens, error: iErr } = await supabase
    .from("animal_protocolo_itens")
    .select("dia, sort_order, medicamento_id")
    .eq("protocolo_id", protocolo.id)
    .order("dia", { ascending: true })
    .order("sort_order", { ascending: true });
  if (iErr) return { error: protocolosError(iErr) };
  if (!itens || itens.length === 0) return { error: "Esse protocolo não tem medicamentos" };

  const { data: meds, error: mErr } = await supabase
    .from("animal_medicamentos")
    .select("id, name, default_dose_ml, dose_ml_per_weight, dose_weight_kg")
    .in("id", Array.from(new Set(itens.map((i) => i.medicamento_id as string))));
  if (mErr) return { error: protocolosError(mErr) };
  const medById = new Map((meds ?? []).map((m) => [m.id as string, m]));

  const foto = itens.map((i) => {
    const m = medById.get(i.medicamento_id as string);
    return {
      dia: i.dia as number,
      medicamento_id: i.medicamento_id as string,
      name: (m?.name as string) ?? "MEDICAMENTO",
      default_dose_ml: (m?.default_dose_ml as number | null) ?? null,
      dose_ml_per_weight: (m?.dose_ml_per_weight as number | null) ?? null,
      dose_weight_kg: (m?.dose_weight_kg as number | null) ?? null,
    };
  });

  const { data: aplicacao, error: aErr } = await supabase
    .from("animal_protocolo_aplicacoes")
    .insert({
      protocolo_id: protocolo.id,
      name: protocolo.name,
      species: protocolo.species,
      start_date: startDate,
      itens: foto,
      notes: clean(notes),
    })
    .select("id")
    .single();
  if (aErr || !aplicacao) return { error: aErr ? protocolosError(aErr) : "Erro ao programar" };
  return { id: aplicacao.id as string };
}

/** Programa o protocolo num grupo de animais a partir de `start_date`. */
export async function createProtocoloAplicacao(input: {
  protocolo_id: string;
  start_date: string;
  animais: { animal_id: string; weight_kg?: number | null }[];
  notes?: string | null;
}) {
  const supabase = createClient();
  if (!input.protocolo_id) return { error: "Escolha o protocolo" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start_date ?? ""))
    return { error: "Informe a data de início" };

  const animais = Array.from(
    new Map(
      (input.animais ?? []).filter((a) => a.animal_id).map((a) => [a.animal_id, a])
    ).values()
  );
  if (animais.length === 0) return { error: "Escolha os animais" };

  const aplicacao = await novaProgramacao(
    supabase,
    input.protocolo_id,
    input.start_date,
    input.notes
  );
  if ("error" in aplicacao) return { error: aplicacao.error };

  const { error: anErr } = await supabase.from("animal_protocolo_aplicacao_animais").insert(
    animais.map((a) => ({
      aplicacao_id: aplicacao.id,
      animal_id: a.animal_id,
      weight_kg: a.weight_kg && a.weight_kg > 0 ? money(a.weight_kg) : null,
    }))
  );
  if (anErr) {
    await supabase.from("animal_protocolo_aplicacoes").delete().eq("id", aplicacao.id);
    return { error: protocolosError(anErr) };
  }

  revalidate();
  return { ok: true, id: aplicacao.id as string };
}

/**
 * Cancela a programação. As doses já aplicadas FICAM na ficha de cada animal —
 * foram dadas de verdade; só perdem o vínculo com a programação.
 */
export async function deleteProtocoloAplicacao(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("animal_protocolo_aplicacoes").delete().eq("id", id);
  if (error) return { error: protocolosError(error) };
  revalidate();
  return { ok: true };
}

interface EtapaAnimalInput {
  animal_id: string;
  weight_kg?: number | null;
  /** true quando o peso foi digitado na hora (pesado no curral). */
  pesado?: boolean;
  doses: { medicamento_id: string; dose_ml?: number | null }[];
}

/**
 * Marca uma etapa como aplicada: cada dose de cada animal vira um tratamento
 * na ficha dele, com o dia da próxima etapa como "próxima aplicação". O peso
 * usado fica na programação (é o ponto de partida da etapa seguinte) e, se foi
 * pesado no curral, vira pesagem do animal.
 *
 * Dá para marcar aos poucos — um animal de cada vez no curral. Quem já tomou
 * a etapa fica de fora (não dobra a dose).
 */
export async function aplicarEtapaProtocolo(input: {
  aplicacao_id: string;
  dia: number;
  applied_at: string;
  animais: EtapaAnimalInput[];
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };
  const r = await registrarEtapa(supabase, user.id, input);
  if ("error" in r) return { error: r.error };
  revalidate();
  return { ok: true, warning: r.warning };
}

async function registrarEtapa(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  input: { aplicacao_id: string; dia: number; applied_at: string; animais: EtapaAnimalInput[] }
): Promise<{ ok: true; warning?: string } | { error: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.applied_at ?? ""))
    return { error: "Informe o dia da aplicação" };

  const { data: aplicacao, error: aErr } = await supabase
    .from("animal_protocolo_aplicacoes")
    .select("id, name, start_date, itens")
    .eq("id", input.aplicacao_id)
    .maybeSingle();
  if (aErr) return { error: protocolosError(aErr) };
  if (!aplicacao) return { error: "Programação não encontrada" };

  // quem já tomou esta etapa não toma de novo
  const { data: jaFeitas, error: fErr } = await supabase
    .from("animal_treatments")
    .select("animal_id")
    .eq("protocolo_aplicacao_id", aplicacao.id)
    .eq("protocolo_dia", input.dia);
  if (fErr) return { error: protocolosError(fErr) };
  const jaTomou = new Set((jaFeitas ?? []).map((t) => t.animal_id as string));
  const animais = (input.animais ?? []).filter((a) => !jaTomou.has(a.animal_id));
  if (animais.length === 0)
    return {
      error:
        (input.animais ?? []).length === 1
          ? "Esse animal já recebeu essa etapa"
          : "Esses animais já receberam essa etapa",
    };

  const itens = (aplicacao.itens ?? []) as { dia: number; medicamento_id: string; name: string }[];
  const daEtapa = new Map(
    itens.filter((i) => i.dia === input.dia).map((i) => [i.medicamento_id, i])
  );
  if (daEtapa.size === 0) return { error: "Essa etapa não existe na programação" };

  // a próxima etapa vira "próxima aplicação" na ficha
  const proximoDia = itens
    .map((i) => i.dia)
    .filter((d) => d > input.dia)
    .sort((a, b) => a - b)[0];
  const next_application =
    proximoDia != null ? addDaysISO(aplicacao.start_date as string, proximoDia) : null;

  const descricao = `PROTOCOLO ${aplicacao.name} · ${
    input.dia === 0 ? "INÍCIO" : `DIA ${input.dia}`
  }`;
  const linhas = [];
  for (const a of animais) {
    for (const d of a.doses ?? []) {
      const item = daEtapa.get(d.medicamento_id);
      if (!item) continue;
      const ml = d.dose_ml && d.dose_ml > 0 ? Math.round(d.dose_ml * 10) / 10 : null;
      linhas.push({
        animal_id: a.animal_id,
        description: descricao,
        medicine: item.name,
        dose: ml ? `${String(ml).replace(".", ",")} ML` : null,
        applied_at: input.applied_at,
        next_application,
        protocolo_aplicacao_id: aplicacao.id,
        protocolo_dia: input.dia,
        created_by: userId,
      });
    }
  }
  if (linhas.length === 0) return { error: "Marque pelo menos um animal" };

  const { error: tErr } = await supabase.from("animal_treatments").insert(linhas);
  if (tErr) return { error: protocolosError(tErr) };

  // o peso usado segue para a próxima etapa; pesado no curral vira pesagem
  let warning: string | undefined;
  for (const a of animais) {
    if (!a.weight_kg || a.weight_kg <= 0) continue;
    await supabase
      .from("animal_protocolo_aplicacao_animais")
      .update({ weight_kg: money(a.weight_kg) })
      .eq("aplicacao_id", aplicacao.id)
      .eq("animal_id", a.animal_id);
    if (a.pesado) {
      const w = await saveWeight(supabase, {
        animal_id: a.animal_id,
        weight: money(a.weight_kg),
        weighed_at: input.applied_at,
        notes: `PROTOCOLO ${aplicacao.name}`,
        created_by: userId,
      });
      if (w.error) warning = `Etapa registrada, mas algum peso não: ${w.error}`;
    }
  }

  return { ok: true, warning };
}

/**
 * O curral um animal por vez: escolheu o nº, aplica a primeira etapa do
 * protocolo NELE e já deixa as próximas programadas. Os animais aplicados no
 * mesmo dia com o mesmo protocolo entram na mesma programação (a "leva") — é
 * ela que aparece em "Em andamento" com a data do reforço.
 */
export async function aplicarProtocoloNoAnimal(input: {
  protocolo_id: string;
  /** O dia da aplicação — é o início da leva. */
  start_date: string;
  animal: EtapaAnimalInput;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };
  if (!input.protocolo_id) return { error: "Escolha o protocolo" };
  if (!input.animal?.animal_id) return { error: "Escolha o animal" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start_date ?? ""))
    return { error: "Informe o dia da aplicação" };

  // a leva do dia: reaproveita a programação desse protocolo com essa data
  const { data: existente, error: eErr } = await supabase
    .from("animal_protocolo_aplicacoes")
    .select("id, itens")
    .eq("protocolo_id", input.protocolo_id)
    .eq("start_date", input.start_date)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (eErr) return { error: protocolosError(eErr) };

  let aplicacaoId = existente?.id as string | undefined;
  let itens = (existente?.itens ?? []) as { dia: number }[];
  if (!aplicacaoId) {
    const nova = await novaProgramacao(supabase, input.protocolo_id, input.start_date);
    if ("error" in nova) return { error: nova.error };
    aplicacaoId = nova.id;
    const { data } = await supabase
      .from("animal_protocolo_aplicacoes")
      .select("itens")
      .eq("id", aplicacaoId)
      .maybeSingle();
    itens = (data?.itens ?? []) as { dia: number }[];
  }

  const peso = input.animal.weight_kg && input.animal.weight_kg > 0 ? money(input.animal.weight_kg) : null;
  const { error: anErr } = await supabase
    .from("animal_protocolo_aplicacao_animais")
    .upsert(
      { aplicacao_id: aplicacaoId, animal_id: input.animal.animal_id, weight_kg: peso },
      { onConflict: "aplicacao_id,animal_id" }
    );
  if (anErr) return { error: protocolosError(anErr) };

  const primeiroDia = Math.min(...itens.map((i) => i.dia));
  if (!Number.isFinite(primeiroDia)) return { error: "Esse protocolo não tem medicamentos" };

  const r = await registrarEtapa(supabase, user.id, {
    aplicacao_id: aplicacaoId,
    dia: primeiroDia,
    applied_at: addDaysISO(input.start_date, primeiroDia),
    animais: [input.animal],
  });
  if ("error" in r) return { error: r.error };

  revalidate();
  return { ok: true, aplicacao_id: aplicacaoId, warning: r.warning };
}

/**
 * Desfaz o "aplicar" de um animal só (tocou no nº errado): as doses dele saem
 * da ficha e ele sai da leva. Se a leva ficar vazia, some também.
 */
export async function desfazerProtocoloNoAnimal(aplicacaoId: string, animalId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("animal_treatments")
    .delete()
    .eq("protocolo_aplicacao_id", aplicacaoId)
    .eq("animal_id", animalId);
  if (error) return { error: protocolosError(error) };

  const { error: anErr } = await supabase
    .from("animal_protocolo_aplicacao_animais")
    .delete()
    .eq("aplicacao_id", aplicacaoId)
    .eq("animal_id", animalId);
  if (anErr) return { error: protocolosError(anErr) };

  const { count } = await supabase
    .from("animal_protocolo_aplicacao_animais")
    .select("animal_id", { count: "exact", head: true })
    .eq("aplicacao_id", aplicacaoId);
  if (count === 0) {
    await supabase.from("animal_protocolo_aplicacoes").delete().eq("id", aplicacaoId);
  }
  await apagarSemNumeroSobrando(supabase, animalId);

  revalidate();
  return { ok: true };
}

/**
 * Desfaz a etapa marcada por engano: os tratamentos dela saem das fichas. Com
 * `animalId`, desfaz só a daquele animal.
 */
export async function desfazerEtapaProtocolo(aplicacaoId: string, dia: number, animalId?: string) {
  const supabase = createClient();
  let q = supabase
    .from("animal_treatments")
    .delete()
    .eq("protocolo_aplicacao_id", aplicacaoId)
    .eq("protocolo_dia", dia);
  if (animalId) q = q.eq("animal_id", animalId);
  const { error } = await q;
  if (error) return { error: protocolosError(error) };
  revalidate();
  return { ok: true };
}

/** O começo do nº de quem foi aplicado sem número ("S/N MALHADA"). */
const SEM_NUMERO = "S/N";

/**
 * Animal sem número no curral: para não perder o momento, ele entra no
 * rebanho com uma identificação provisória ("S/N MALHADA DO CHIFRE TORTO") e
 * já toma o protocolo. Quando ganhar o brinco, é só dar o número — a ficha e
 * as doses seguem com ele.
 */
export async function aplicarProtocoloSemNumero(input: {
  protocolo_id: string;
  start_date: string;
  identificacao: string;
  sex: AnimalSex;
  weight_kg?: number | null;
  doses: { medicamento_id: string; dose_ml?: number | null }[];
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const ident = clean(input.identificacao);
  if (!ident) return { error: "Escreva uma identificação (ex.: MALHADA DO CHIFRE TORTO)" };
  const tag = ident.startsWith(SEM_NUMERO) ? ident : `${SEM_NUMERO} ${ident}`;

  const { data: protocolo, error: pErr } = await supabase
    .from("animal_protocolos")
    .select("species, name")
    .eq("id", input.protocolo_id)
    .maybeSingle();
  if (pErr) return { error: protocolosError(pErr) };
  if (!protocolo) return { error: "Protocolo não encontrado" };

  const weight = input.weight_kg && input.weight_kg > 0 ? money(input.weight_kg) : 0;
  const { data: animal, error: aErr } = await supabase
    .from("animals")
    .insert({
      tag,
      sex: input.sex,
      species: protocolo.species,
      weight,
      notes: `SEM NÚMERO — entrou pelo protocolo ${protocolo.name}. Trocar pelo nº do brinco.`,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (aErr || !animal)
    return {
      error:
        aErr?.code === "23505"
          ? "Já existe um animal com essa identificação — escreva outra"
          : aErr
            ? dupTagError(aErr, protocolo.species as AnimalSpecies)
            : "Erro ao cadastrar o animal",
    };

  const r = await aplicarProtocoloNoAnimal({
    protocolo_id: input.protocolo_id,
    start_date: input.start_date,
    animal: {
      animal_id: animal.id as string,
      weight_kg: weight || null,
      pesado: weight > 0,
      doses: input.doses,
    },
  });
  if (r && "error" in r) {
    // não deixa o animal solto no rebanho se a aplicação não entrou
    await supabase.from("animals").delete().eq("id", animal.id);
    return { error: r.error };
  }
  return { ...r, animal_id: animal.id as string, tag };
}

/** Dá o número (brinco) a um animal — usado para o "S/N" que ganhou número. */
export async function numerarAnimal(animalId: string, tag: string) {
  const supabase = createClient();
  const novo = clean(tag);
  if (!novo) return { error: "Informe o número" };
  const { data: animal } = await supabase
    .from("animals")
    .select("species")
    .eq("id", animalId)
    .maybeSingle();
  const { error } = await supabase.from("animals").update({ tag: novo }).eq("id", animalId);
  if (error) return { error: dupTagError(error, (animal?.species as AnimalSpecies) ?? null) };
  revalidate();
  return { ok: true };
}

/**
 * Corrige a aplicação de um animal numa etapa: a data, os ml de cada remédio
 * e, se foi lançada no animal errado, passa para o animal certo.
 */
export async function editarAplicacaoAnimal(input: {
  aplicacao_id: string;
  dia: number;
  animal_id: string;
  /** O animal certo, quando foi lançado no nº errado. */
  novo_animal_id?: string | null;
  applied_at: string;
  doses: { id: string; dose_ml: number | null }[];
}) {
  const supabase = createClient();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.applied_at ?? ""))
    return { error: "Informe o dia da aplicação" };

  const { data: atuais, error: tErr } = await supabase
    .from("animal_treatments")
    .select("id")
    .eq("protocolo_aplicacao_id", input.aplicacao_id)
    .eq("protocolo_dia", input.dia)
    .eq("animal_id", input.animal_id);
  if (tErr) return { error: protocolosError(tErr) };
  const ids = new Set((atuais ?? []).map((t) => t.id as string));
  if (ids.size === 0) return { error: "Essa aplicação não existe mais" };

  const novo = input.novo_animal_id && input.novo_animal_id !== input.animal_id ? input.novo_animal_id : null;
  if (novo) {
    const { count } = await supabase
      .from("animal_treatments")
      .select("id", { count: "exact", head: true })
      .eq("protocolo_aplicacao_id", input.aplicacao_id)
      .eq("protocolo_dia", input.dia)
      .eq("animal_id", novo);
    if (count && count > 0) return { error: "O outro animal já tem essa etapa aplicada" };
  }

  for (const d of input.doses ?? []) {
    if (!ids.has(d.id)) continue;
    const ml = d.dose_ml && d.dose_ml > 0 ? Math.round(d.dose_ml * 10) / 10 : null;
    const { error } = await supabase
      .from("animal_treatments")
      .update({
        applied_at: input.applied_at,
        dose: ml ? `${String(ml).replace(".", ",")} ML` : null,
        ...(novo ? { animal_id: novo } : {}),
      })
      .eq("id", d.id);
    if (error) return { error: protocolosError(error) };
  }
  // doses que não vieram na lista também mudam de data/animal
  const resto = Array.from(ids).filter((id) => !(input.doses ?? []).some((d) => d.id === id));
  if (resto.length > 0) {
    const { error } = await supabase
      .from("animal_treatments")
      .update({ applied_at: input.applied_at, ...(novo ? { animal_id: novo } : {}) })
      .in("id", resto);
    if (error) return { error: protocolosError(error) };
  }

  if (novo) {
    const { data: antigo } = await supabase
      .from("animal_protocolo_aplicacao_animais")
      .select("weight_kg")
      .eq("aplicacao_id", input.aplicacao_id)
      .eq("animal_id", input.animal_id)
      .maybeSingle();
    const { error: upErr } = await supabase
      .from("animal_protocolo_aplicacao_animais")
      .upsert(
        { aplicacao_id: input.aplicacao_id, animal_id: novo, weight_kg: antigo?.weight_kg ?? null },
        { onConflict: "aplicacao_id,animal_id" }
      );
    if (upErr) return { error: protocolosError(upErr) };
    await tirarDaLevaSeVazio(supabase, input.aplicacao_id, input.animal_id);
  }

  revalidate();
  return { ok: true };
}

/**
 * Exclui a aplicação lançada errado: as doses daquela etapa saem da ficha do
 * animal. Se ele não tomou mais nada dessa programação, sai dela também (não
 * fica cobrando o reforço).
 */
export async function excluirAplicacaoAnimal(aplicacaoId: string, dia: number, animalId: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("animal_treatments")
    .delete()
    .eq("protocolo_aplicacao_id", aplicacaoId)
    .eq("protocolo_dia", dia)
    .eq("animal_id", animalId);
  if (error) return { error: protocolosError(error) };
  await tirarDaLevaSeVazio(supabase, aplicacaoId, animalId);
  revalidate();
  return { ok: true };
}

/** Tira o animal da programação quando não sobrou dose dele nela; leva vazia some. */
async function tirarDaLevaSeVazio(
  supabase: ReturnType<typeof createClient>,
  aplicacaoId: string,
  animalId: string
) {
  const { count } = await supabase
    .from("animal_treatments")
    .select("id", { count: "exact", head: true })
    .eq("protocolo_aplicacao_id", aplicacaoId)
    .eq("animal_id", animalId);
  if (count && count > 0) return;
  await supabase
    .from("animal_protocolo_aplicacao_animais")
    .delete()
    .eq("aplicacao_id", aplicacaoId)
    .eq("animal_id", animalId);
  const { count: restam } = await supabase
    .from("animal_protocolo_aplicacao_animais")
    .select("animal_id", { count: "exact", head: true })
    .eq("aplicacao_id", aplicacaoId);
  if (restam === 0) await supabase.from("animal_protocolo_aplicacoes").delete().eq("id", aplicacaoId);
  await apagarSemNumeroSobrando(supabase, animalId);
}

/**
 * O "S/N" só existia por causa do protocolo: se a aplicação dele foi desfeita
 * (ou passou para o animal certo) e não sobrou nenhuma dose, ele sai do rebanho.
 */
async function apagarSemNumeroSobrando(
  supabase: ReturnType<typeof createClient>,
  animalId: string
) {
  const { data: animal } = await supabase
    .from("animals")
    .select("tag")
    .eq("id", animalId)
    .maybeSingle();
  if (!animal || !String(animal.tag).startsWith(SEM_NUMERO)) return;
  const { count } = await supabase
    .from("animal_treatments")
    .select("id", { count: "exact", head: true })
    .eq("animal_id", animalId);
  if (count === 0) await supabase.from("animals").delete().eq("id", animalId);
}

/** Data + N dias, em YYYY-MM-DD (sem fuso: a data é do calendário). */
function addDaysISO(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// ── Gado PO: o número vira o código de compra ────────────────────────────────

/** "gsc  7893" → "GSC 7893"; "cscn21368" → "CSCN 21368". */
function codigoPO(codigo: string): string | null {
  const v = codigo
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/^([A-Z]+)(\d)/, "$1 $2");
  return v || null;
}

/**
 * Troca o número de vários animais PO pelo código de compra (GSC 7893, CSCN
 * 21368...). O número de antes fica guardado em `tag_antigo` — o PRIMEIRO
 * número, se o código for corrigido de novo — para a busca e a ficha ainda
 * acharem o animal pelo brinco velho. Cada animal é gravado sozinho: um código
 * repetido barra só aquele, os outros passam.
 */
export async function trocarCodigosPO(itens: { animal_id: string; codigo: string }[]) {
  const supabase = createClient();

  const novos = itens
    .map((i) => ({ animal_id: i.animal_id, tag: codigoPO(i.codigo) }))
    .filter((i): i is { animal_id: string; tag: string } => !!i.tag);
  if (novos.length === 0) return { error: "Preencha o código de pelo menos um animal" };

  // o mesmo código digitado em dois animais: nem tenta
  const vistos = new Map<string, number>();
  for (const n of novos) vistos.set(n.tag, (vistos.get(n.tag) ?? 0) + 1);
  const repetidos = Array.from(vistos.entries()).filter(([, c]) => c > 1).map(([t]) => t);
  if (repetidos.length > 0)
    return { error: `O código ${repetidos.join(", ")} foi digitado em mais de um animal` };

  const { data: atuais, error: errLer } = await supabase
    .from("animals")
    .select("id, tag, tag_antigo, species")
    .in(
      "id",
      novos.map((n) => n.animal_id)
    );
  if (errLer) {
    if (errLer.message.includes("tag_antigo"))
      return { error: "Rode a migration 136 no Supabase para trocar o número pelo código de compra" };
    return { error: errLer.message };
  }
  const porId = new Map(
    ((atuais ?? []) as { id: string; tag: string; tag_antigo: string | null; species: AnimalSpecies }[]).map(
      (a) => [a.id, a]
    )
  );

  let trocados = 0;
  const falhas: string[] = [];
  for (const n of novos) {
    const a = porId.get(n.animal_id);
    if (!a || a.tag === n.tag) continue;
    const { error } = await supabase
      .from("animals")
      .update({ tag: n.tag, tag_antigo: a.tag_antigo ?? a.tag })
      .eq("id", n.animal_id);
    if (error) falhas.push(`${a.tag} → ${n.tag}: ${dupTagError(error, a.species)}`);
    else trocados++;
  }

  if (trocados > 0) revalidate();
  if (falhas.length > 0)
    return {
      error: `${trocados} trocado(s). Não deu em ${falhas.length}: ${falhas.join("; ")}`,
      trocados,
    };
  return { ok: true, trocados };
}
