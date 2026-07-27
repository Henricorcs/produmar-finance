"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AnimalSex } from "@/lib/types";

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
  return error.message;
}

// ─────────────────────────────────────────────────────────────────────────────
// ANIMAL (CRUD)
// ─────────────────────────────────────────────────────────────────────────────

export interface AnimalInput {
  tag: string;
  sex: AnimalSex;
  birth_date?: string | null;
  type_id?: string | null;
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
      birth_date: input.birth_date || null,
      type_id: input.type_id || null,
      weight: normWeight(input.weight),
      notes: clean(input.notes),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error ? dupTagError(error) : "Erro ao cadastrar" };
  revalidate();
  return { ok: true, animalId: data.id as string };
}

export async function updateAnimal(id: string, input: AnimalInput) {
  const supabase = createClient();

  const tag = clean(input.tag);
  if (!tag) return { error: "Informe o número do animal" };

  const { error } = await supabase
    .from("animals")
    .update({
      tag,
      sex: input.sex,
      birth_date: input.birth_date || null,
      type_id: input.type_id || null,
      weight: normWeight(input.weight),
      notes: clean(input.notes),
    })
    .eq("id", id);

  if (error) return { error: dupTagError(error) };
  revalidate();
  return { ok: true };
}

/** Exclui o animal e todo o histórico (fotos, tratamentos, vacinas e partos, por cascade). */
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
// TIPOS DE ANIMAL (cadastro editável)
// ─────────────────────────────────────────────────────────────────────────────

function normTypeName(v: string): string {
  return v.trim().toLowerCase();
}

function dupNameError(error: { code?: string; message: string }, what: string): string {
  if (error.code === "23505") return `${what} já existe`;
  return error.message;
}

export async function createAnimalType(name: string) {
  const supabase = createClient();
  const n = normTypeName(name);
  if (!n) return { error: "Informe o nome do tipo" };

  const { error } = await supabase.from("animal_types").insert({ name: n });
  if (error) return { error: dupNameError(error, "Esse tipo") };
  revalidate();
  return { ok: true };
}

export async function renameAnimalType(id: string, name: string) {
  const supabase = createClient();
  const n = normTypeName(name);
  if (!n) return { error: "Informe o nome do tipo" };

  const { error } = await supabase.from("animal_types").update({ name: n }).eq("id", id);
  if (error) return { error: dupNameError(error, "Esse tipo") };
  revalidate();
  return { ok: true };
}

export async function deleteAnimalType(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("animal_types").delete().eq("id", id);
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

export async function createVaccine(input: {
  name: string;
  recurrence_months?: number | null;
  notes?: string | null;
}) {
  const supabase = createClient();
  const name = normTypeName(input.name);
  if (!name) return { error: "Informe o nome da vacina" };

  const { error } = await supabase.from("animal_vaccines").insert({
    name,
    recurrence_months: normRecurrence(input.recurrence_months),
    notes: clean(input.notes),
  });
  if (error) return { error: dupNameError(error, "Essa vacina") };
  revalidate();
  return { ok: true };
}

export async function updateVaccine(
  id: string,
  input: { name: string; recurrence_months?: number | null; notes?: string | null }
) {
  const supabase = createClient();
  const name = normTypeName(input.name);
  if (!name) return { error: "Informe o nome da vacina" };

  const { error } = await supabase
    .from("animal_vaccines")
    .update({
      name,
      recurrence_months: normRecurrence(input.recurrence_months),
      notes: clean(input.notes),
    })
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

export async function registerVaccination(input: {
  animal_id: string;
  vaccine_id: string;
  applied_at?: string | null;
  dose?: string | null;
  notes?: string | null;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!input.animal_id) return { error: "Selecione o animal" };
  if (!input.vaccine_id) return { error: "Selecione a vacina" };

  const { error } = await supabase.from("animal_vaccinations").insert({
    animal_id: input.animal_id,
    vaccine_id: input.vaccine_id,
    applied_at: input.applied_at || new Date().toISOString().split("T")[0],
    dose: clean(input.dose),
    notes: clean(input.notes),
    created_by: user.id,
  });
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function deleteVaccination(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("animal_vaccinations").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// TRATAMENTOS
// ─────────────────────────────────────────────────────────────────────────────

export interface TreatmentInput {
  animal_id: string;
  description: string;
  medicine?: string | null;
  dose?: string | null;
  applied_at?: string | null;
  next_application?: string | null;
  cost?: number | null;
  notes?: string | null;
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
    next_application: input.next_application || null,
    cost: Math.max(0, input.cost ?? 0),
    notes: clean(input.notes),
    created_by: user.id,
  });
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function updateTreatment(id: string, input: TreatmentInput) {
  const supabase = createClient();

  const description = clean(input.description);
  if (!description) return { error: "Descreva o tratamento" };

  const { error } = await supabase
    .from("animal_treatments")
    .update({
      description,
      medicine: clean(input.medicine),
      dose: clean(input.dose),
      applied_at: input.applied_at || new Date().toISOString().split("T")[0],
      next_application: input.next_application || null,
      cost: Math.max(0, input.cost ?? 0),
      notes: clean(input.notes),
    })
    .eq("id", id);
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
// PARTOS (bezerros)
// ─────────────────────────────────────────────────────────────────────────────

export interface BirthInput {
  mother_id: string;
  birth_date: string;
  calf_tag?: string | null;
  calf_sex?: AnimalSex | null;
  notes?: string | null;
  /** Cria também o cadastro do bezerro como animal (exige número). */
  register_calf?: boolean;
}

export async function createBirth(input: BirthInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!input.mother_id) return { error: "Selecione a mãe" };
  if (!input.birth_date) return { error: "Informe a data de nascimento" };

  const calfTag = clean(input.calf_tag);

  // opcionalmente já cadastra o bezerro como animal (herda o tipo da mãe)
  let calfAnimalId: string | null = null;
  if (input.register_calf) {
    if (!calfTag) return { error: "Informe o número do bezerro para cadastrá-lo" };
    if (!input.calf_sex) return { error: "Informe o sexo do bezerro para cadastrá-lo" };

    const { data: mother } = await supabase
      .from("animals")
      .select("type_id")
      .eq("id", input.mother_id)
      .maybeSingle();

    const { data: calf, error: calfErr } = await supabase
      .from("animals")
      .insert({
        tag: calfTag,
        sex: input.calf_sex,
        birth_date: input.birth_date,
        type_id: mother?.type_id ?? null,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (calfErr || !calf) return { error: calfErr ? dupTagError(calfErr) : "Erro ao cadastrar o bezerro" };
    calfAnimalId = calf.id as string;
  }

  const { error } = await supabase.from("animal_births").insert({
    mother_id: input.mother_id,
    birth_date: input.birth_date,
    calf_tag: calfTag,
    calf_sex: input.calf_sex ?? null,
    calf_animal_id: calfAnimalId,
    notes: clean(input.notes),
    created_by: user.id,
  });
  if (error) {
    // desfaz o cadastro do bezerro para não deixar animal órfão
    if (calfAnimalId) await supabase.from("animals").delete().eq("id", calfAnimalId);
    return { error: error.message };
  }

  revalidate();
  return { ok: true };
}

/** Remove o registro do parto. O bezerro cadastrado como animal continua existindo. */
export async function deleteBirth(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("animal_births").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}
