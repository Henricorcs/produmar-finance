"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AnimalSex, AnimalSpecies } from "@/lib/types";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function revalidate() {
  revalidatePath("/animais");
}

/** Texto de cadastro: sempre em CAIXA ALTA, vazio vira null. */
function clean(s?: string | null): string | null {
  const v = s?.trim();
  return v ? v.toUpperCase() : null;
}

function normWeight(v?: number | null): number {
  return Math.max(0, v ?? 0);
}

function dupTagError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Já existe um animal com esse número";
  return speciesColumnError(error);
}

/** A coluna do tipo vem da migration 047 — sem ela o erro não diz nada. */
function speciesColumnError(error: { code?: string; message: string }): string {
  if (error.message.includes("species"))
    return "Rode a migration 047 no Supabase para usar o tipo do animal";
  return error.message;
}

/** Tipo do animal — o que não vier marcado é bovino, como sempre foi. */
function normSpecies(v?: AnimalSpecies | null): AnimalSpecies {
  return v && ["bovino", "equino", "caprino", "ovino"].includes(v) ? v : "bovino";
}

// ─────────────────────────────────────────────────────────────────────────────
// ANIMAL (CRUD)
// ─────────────────────────────────────────────────────────────────────────────

export interface AnimalInput {
  tag: string;
  sex: AnimalSex;
  /** Tipo do animal (bovino, equino, caprino, ovino). */
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

  if (error || !data) return { error: error ? dupTagError(error) : "Erro ao cadastrar" };

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

  if (error) return { error: dupTagError(error) };

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
    await supabase.storage.from("attachments").remove(paths);
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

    const { error: upErr } = await supabase.storage
      .from("attachments")
      .upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (upErr) {
      // desfaz o que já subiu neste lote para não deixar lixo
      if (uploadedPaths.length) await supabase.storage.from("attachments").remove(uploadedPaths);
      return { error: upErr.message };
    }
    uploadedPaths.push(path);
  }

  const { error: insErr } = await supabase.from("animal_photos").insert(
    uploadedPaths.map((path) => ({ animal_id: animalId, path, created_by: user.id }))
  );
  if (insErr) {
    await supabase.storage.from("attachments").remove(uploadedPaths);
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

  const photos = await Promise.all(
    (data ?? []).map(async (p) => {
      const { data: signed } = await supabase.storage
        .from("attachments")
        .createSignedUrl(p.path, 60 * 60);
      return { id: p.id as string, path: p.path as string, url: signed?.signedUrl ?? null };
    })
  );
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

  await supabase.storage.from("attachments").remove([photo.path]);
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
  const supabase = createClient();
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return { urls: {} as Record<string, string> };

  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrls(unique, 60 * 60);
  if (error) return { error: error.message };

  const urls: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
  }
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
    recurrence_months: normRecurrence(input.recurrence_months),
    default_dose_ml: normDose(input.default_dose_ml),
    // a dose por peso só vale com os dois lados preenchidos ("X ml a cada Y kg")
    dose_ml_per_weight: perWeight && weightKg ? perWeight : null,
    dose_weight_kg: perWeight && weightKg ? weightKg : null,
    default_brand: clean(input.default_brand),
    notes: clean(input.notes),
  };
}

export async function createVaccine(input: VaccineInput) {
  const supabase = createClient();
  const name = normName(input.name);
  if (!name) return { error: "Informe o nome da vacina" };

  const { error } = await supabase
    .from("animal_vaccines")
    .insert({ name, ...vaccineFields(input) });
  if (error) return { error: dupNameError(error, "Essa vacina") };
  revalidate();
  return { ok: true };
}

export async function updateVaccine(id: string, input: VaccineInput) {
  const supabase = createClient();
  const name = normName(input.name);
  if (!name) return { error: "Informe o nome da vacina" };

  const { error } = await supabase
    .from("animal_vaccines")
    .update({ name, ...vaccineFields(input) })
    .eq("id", id);
  if (error) return { error: dupNameError(error, "Essa vacina") };
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
    return { error: calfErr ? dupTagError(calfErr) : "Erro ao cadastrar o bezerro" };
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
    await supabase.storage.from("attachments").remove([request.photo_path as string]);
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
