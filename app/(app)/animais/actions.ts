"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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

/** Exclui o animal, as fotos e o histórico de vacinação (cascade). */
export async function deleteAnimal(id: string) {
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
  if (paths.length) {
    await removerArquivos(paths);
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

  await removerArquivos([photo.path]);
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
    .select("photo_path")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) return { error: birthRequestsTableError(reqErr) };
  if (!request) return { error: "Solicitação não encontrada (já foi resolvida?)" };

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

  await supabase.from("animal_birth_requests").delete().eq("id", requestId);

  revalidate();
  return { ok: true, calfAnimalId: result.calfAnimalId };
}

/** Descarta a solicitação (duplicada, mãe sem conserto, envio errado etc). */
export async function rejectBirthRequest(requestId: string) {
  const supabase = createClient();

  const { data: request, error: reqErr } = await supabase
    .from("animal_birth_requests")
    .select("photo_path")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) return { error: birthRequestsTableError(reqErr) };

  const { error } = await supabase.from("animal_birth_requests").delete().eq("id", requestId);
  if (error) return { error: birthRequestsTableError(error) };

  if (request?.photo_path) {
    await removerArquivos([request.photo_path as string]);
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
