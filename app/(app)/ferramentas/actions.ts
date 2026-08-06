"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ToolCondition } from "@/lib/types";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function revalidate() {
  revalidatePath("/ferramentas");
}

function clean(s?: string | null): string | null {
  const v = s?.trim();
  return v ? v.toUpperCase() : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// FERRAMENTA (CRUD)
// ─────────────────────────────────────────────────────────────────────────────

export interface ToolInput {
  name: string;
  code?: string | null;
  condition?: ToolCondition | null;
  quantity?: number | null;
  unit?: string | null;
  unit_value?: number | null;
  replacement_value?: number | null;
  /** Almoxarifado onde o item fica guardado. */
  warehouse_id?: string | null;
  notes?: string | null;
}

function normQuantity(v?: number | null): number {
  return Math.max(1, Math.floor(v ?? 1));
}
function normMoney(v?: number | null): number {
  return Math.max(0, v ?? 0);
}
function normUnit(v?: string | null): string {
  const u = v?.trim();
  return u ? u : "unidade";
}

export async function createTool(input: ToolInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const name = clean(input.name);
  if (!name) return { error: "Informe o nome do patrimônio" };

  const { data, error } = await supabase
    .from("tools")
    .insert({
      name,
      code: clean(input.code),
      condition: input.condition ?? "bom",
      quantity: normQuantity(input.quantity),
      unit: normUnit(input.unit),
      unit_value: normMoney(input.unit_value),
      replacement_value: normMoney(input.replacement_value),
      warehouse_id: input.warehouse_id || null,
      notes: clean(input.notes),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Erro ao cadastrar" };
  revalidate();
  return { ok: true, toolId: data.id as string };
}

export async function updateTool(id: string, input: ToolInput) {
  const supabase = createClient();

  const name = clean(input.name);
  if (!name) return { error: "Informe o nome do patrimônio" };

  const { error } = await supabase
    .from("tools")
    .update({
      name,
      code: clean(input.code),
      condition: input.condition ?? "bom",
      quantity: normQuantity(input.quantity),
      unit: normUnit(input.unit),
      unit_value: normMoney(input.unit_value),
      replacement_value: normMoney(input.replacement_value),
      warehouse_id: input.warehouse_id || null,
      notes: clean(input.notes),
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

/** Exclui o patrimônio e todo o histórico (empréstimos, manutenções e inutilizações, por cascade). */
export async function deleteTool(id: string) {
  const supabase = createClient();

  // remove as fotos do storage (as linhas em tool_photos somem por cascade)
  const { data: photos } = await supabase
    .from("tool_photos")
    .select("path")
    .eq("tool_id", id);
  const paths = (photos ?? []).map((p) => p.path as string);
  const { data: tool } = await supabase
    .from("tools")
    .select("photo_path")
    .eq("id", id)
    .maybeSingle();
  if (tool?.photo_path && !paths.includes(tool.photo_path)) paths.push(tool.photo_path);
  if (paths.length) {
    await supabase.storage.from("attachments").remove(paths);
  }

  const { error } = await supabase.from("tools").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// FOTO DA FERRAMENTA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sobe uma ou mais fotos do patrimônio. Cada arquivo vira uma linha em
 * tool_photos; a primeira também vira a "foto principal" (tools.photo_path)
 * quando ainda não houver nenhuma, mantendo compatibilidade com a lista/consultas.
 */
export async function uploadToolPhotos(toolId: string, formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Nenhuma foto válida" };
  if (files.some((f) => f.size > MAX_FILE_SIZE)) return { error: "Cada foto deve ter no máximo 10 MB" };

  const uploadedPaths: string[] = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `tools/${toolId}/${randomUUID()}_${safeName}`;

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

  const { error: insErr } = await supabase.from("tool_photos").insert(
    uploadedPaths.map((path) => ({ tool_id: toolId, path, created_by: user.id }))
  );
  if (insErr) {
    await supabase.storage.from("attachments").remove(uploadedPaths);
    return { error: insErr.message };
  }

  // garante uma foto principal (usada na lista / consultas antigas)
  const { data: tool } = await supabase
    .from("tools")
    .select("photo_path")
    .eq("id", toolId)
    .maybeSingle();
  if (!tool?.photo_path) {
    await supabase.from("tools").update({ photo_path: uploadedPaths[0] }).eq("id", toolId);
  }

  revalidate();
  return { ok: true };
}

/** Lista as fotos do patrimônio com URL assinada (1h) para exibição. */
export async function getToolPhotos(toolId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tool_photos")
    .select("id, path")
    .eq("tool_id", toolId)
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

/** Remove uma foto do patrimônio (storage + linha). Reajusta a foto principal. */
export async function deleteToolPhoto(photoId: string) {
  const supabase = createClient();

  const { data: photo } = await supabase
    .from("tool_photos")
    .select("id, tool_id, path")
    .eq("id", photoId)
    .maybeSingle();
  if (!photo) return { error: "Foto não encontrada" };

  await supabase.storage.from("attachments").remove([photo.path]);
  const { error } = await supabase.from("tool_photos").delete().eq("id", photoId);
  if (error) return { error: error.message };

  // se era a foto principal, aponta para outra remanescente (ou limpa)
  const { data: tool } = await supabase
    .from("tools")
    .select("photo_path")
    .eq("id", photo.tool_id)
    .maybeSingle();
  if (tool?.photo_path === photo.path) {
    const { data: next } = await supabase
      .from("tool_photos")
      .select("path")
      .eq("tool_id", photo.tool_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    await supabase
      .from("tools")
      .update({ photo_path: next?.path ?? null })
      .eq("id", photo.tool_id);
  }

  revalidate();
  return { ok: true };
}

/** Gera uma URL assinada (1h) para exibir uma foto avulsa (ex.: quem pegou emprestado). */
export async function getToolPhotoUrl(storagePath: string) {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(storagePath, 60 * 60);
  if (error || !data) return { error: error?.message ?? "Erro ao abrir foto" };
  return { url: data.signedUrl };
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPRÉSTIMO E DEVOLUÇÃO
// (a tabela continua tool_loans — só o rótulo na tela mudou de "baixa"
//  para "empréstimo", que é o que sempre foi: sai e volta)
// ─────────────────────────────────────────────────────────────────────────────

export async function checkoutTool(input: {
  tool_id: string;
  quantity?: number | null;
  borrower_name: string;
  destination?: string | null;
  obra_id?: string | null;
  expected_return_date?: string | null;
  notes?: string | null;
  receiver_signature?: string | null;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const borrower = clean(input.borrower_name);
  if (!input.tool_id) return { error: "Selecione o patrimônio" };
  if (!borrower) return { error: "Informe quem está levando emprestado" };

  const qty = normQuantity(input.quantity);

  // precisa haver saldo disponível
  const { data: t } = await supabase
    .from("v_tool_status")
    .select("available_qty, open_maintenance_id, name")
    .eq("id", input.tool_id)
    .maybeSingle();
  if (!t) return { error: "Patrimônio não encontrado" };
  if (t.open_maintenance_id) return { error: "Este item está em manutenção" };
  if (qty > (t.available_qty ?? 0))
    return { error: `Saldo insuficiente (disponível: ${t.available_qty ?? 0})` };

  const { data, error } = await supabase
    .from("tool_loans")
    .insert({
      tool_id: input.tool_id,
      quantity: qty,
      borrower_name: borrower,
      destination: clean(input.destination),
      obra_id: input.obra_id || null,
      expected_return_date: input.expected_return_date || null,
      notes: clean(input.notes),
      receiver_signature: input.receiver_signature || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Erro ao registrar o empréstimo" };
  revalidate();
  return { ok: true, loanId: data.id as string };
}

/** Foto de quem recebeu a ferramenta, tirada no momento do empréstimo. */
export async function uploadLoanReceiverPhoto(loanId: string, formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Arquivo inválido" };
  if (file.size > MAX_FILE_SIZE) return { error: "Arquivo maior que 10 MB" };

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `tool-loans/${loanId}/${randomUUID()}_${safeName}`;

  const { error: upErr } = await supabase.storage
    .from("attachments")
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (upErr) return { error: upErr.message };

  const { error } = await supabase
    .from("tool_loans")
    .update({ receiver_photo_path: path })
    .eq("id", loanId);
  if (error) return { error: error.message };

  revalidate();
  return { ok: true };
}

export async function returnTool(input: {
  loan_id: string;
  condition?: ToolCondition | null;
  notes?: string | null;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { data: loan } = await supabase
    .from("tool_loans")
    .select("id, tool_id, returned_at")
    .eq("id", input.loan_id)
    .maybeSingle();
  if (!loan) return { error: "Empréstimo não encontrado" };
  if (loan.returned_at) return { error: "Este empréstimo já foi devolvido" };

  const { error } = await supabase
    .from("tool_loans")
    .update({
      returned_at: new Date().toISOString(),
      return_condition: input.condition ?? null,
      return_notes: clean(input.notes),
    })
    .eq("id", input.loan_id);
  if (error) return { error: error.message };

  // devolução atualiza o estado atual da ferramenta
  if (input.condition) {
    await supabase
      .from("tools")
      .update({ condition: input.condition })
      .eq("id", loan.tool_id);
  }

  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// MANUTENÇÃO
// ─────────────────────────────────────────────────────────────────────────────

export async function openMaintenance(input: {
  tool_id: string;
  description: string;
  notes?: string | null;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const description = clean(input.description);
  if (!input.tool_id) return { error: "Selecione o patrimônio" };
  if (!description) return { error: "Descreva a manutenção" };

  // manutenção é do item inteiro — não pode haver nada em uso nem outra aberta
  const { data: t } = await supabase
    .from("v_tool_status")
    .select("status, in_use_qty")
    .eq("id", input.tool_id)
    .maybeSingle();
  if (!t) return { error: "Patrimônio não encontrado" };
  if ((t.in_use_qty ?? 0) > 0)
    return { error: "Receba de volta os empréstimos em aberto antes de enviar para manutenção" };
  if (t.status === "manutencao")
    return { error: "Este item já está em manutenção" };

  const { error } = await supabase.from("tool_maintenance").insert({
    tool_id: input.tool_id,
    description,
    notes: clean(input.notes),
    created_by: user.id,
  });

  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

export async function finishMaintenance(input: {
  maintenance_id: string;
  cost?: number | null;
  condition?: ToolCondition | null;
  notes?: string | null;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { data: m } = await supabase
    .from("tool_maintenance")
    .select("id, tool_id, finished_at, notes")
    .eq("id", input.maintenance_id)
    .maybeSingle();
  if (!m) return { error: "Manutenção não encontrada" };
  if (m.finished_at) return { error: "Esta manutenção já foi concluída" };

  const cost = Math.max(0, input.cost ?? 0);
  const extraNotes = clean(input.notes);

  const { error } = await supabase
    .from("tool_maintenance")
    .update({
      finished_at: new Date().toISOString().split("T")[0],
      cost,
      notes: extraNotes ? (m.notes ? `${m.notes} · ${extraNotes}` : extraNotes) : m.notes,
    })
    .eq("id", input.maintenance_id);
  if (error) return { error: error.message };

  // manutenção concluída pode atualizar o estado da ferramenta
  if (input.condition) {
    await supabase
      .from("tools")
      .update({ condition: input.condition })
      .eq("id", m.tool_id);
  }

  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// INUTILIZAÇÃO (perda definitiva)
// ─────────────────────────────────────────────────────────────────────────────

/** Inutiliza N unidades (perda/sucata). Valida o saldo disponível. */
export async function writeOffTool(input: {
  tool_id: string;
  quantity?: number | null;
  reason?: string | null;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!input.tool_id) return { error: "Selecione o patrimônio" };
  const qty = normQuantity(input.quantity);

  const { data: t } = await supabase
    .from("v_tool_status")
    .select("available_qty")
    .eq("id", input.tool_id)
    .maybeSingle();
  if (!t) return { error: "Patrimônio não encontrado" };
  if (qty > (t.available_qty ?? 0))
    return { error: `Saldo insuficiente (disponível: ${t.available_qty ?? 0})` };

  const { error } = await supabase.from("tool_writeoffs").insert({
    tool_id: input.tool_id,
    quantity: qty,
    reason: clean(input.reason),
    created_by: user.id,
  });
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

/** Desfaz uma inutilização — repõe o saldo. */
export async function undoWriteoff(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("tool_writeoffs").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS DE UNIDADE (cadastro editável)
// ─────────────────────────────────────────────────────────────────────────────

function normUnitName(v: string): string {
  return v.trim().toLowerCase();
}

function unitError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Essa unidade já existe";
  return error.message;
}

export async function createToolUnit(name: string) {
  const supabase = createClient();
  const n = normUnitName(name);
  if (!n) return { error: "Informe o nome da unidade" };

  const { error } = await supabase.from("tool_units").insert({ name: n });
  if (error) return { error: unitError(error) };
  revalidate();
  return { ok: true };
}

export async function renameToolUnit(id: string, name: string) {
  const supabase = createClient();
  const n = normUnitName(name);
  if (!n) return { error: "Informe o nome da unidade" };

  const { error } = await supabase.from("tool_units").update({ name: n }).eq("id", id);
  if (error) return { error: unitError(error) };
  revalidate();
  return { ok: true };
}

export async function deleteToolUnit(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("tool_units").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// ALMOXARIFADOS (onde o patrimônio fica guardado)
// ─────────────────────────────────────────────────────────────────────────────

export interface WarehouseInput {
  name: string;
  location?: string | null;
  notes?: string | null;
}

/** A tabela vem da migration 045 — sem ela o erro do Postgres não diz nada. */
function warehouseError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Já existe um almoxarifado com esse nome";
  if (error.code === "42P01" || error.message.includes("tool_warehouses"))
    return "Rode a migration 045 no Supabase para usar os almoxarifados";
  return error.message;
}

export async function createWarehouse(input: WarehouseInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const name = clean(input.name);
  if (!name) return { error: "Informe o nome do almoxarifado" };

  const { data, error } = await supabase
    .from("tool_warehouses")
    .insert({
      name,
      location: clean(input.location),
      notes: clean(input.notes),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error ? warehouseError(error) : "Erro ao cadastrar" };
  revalidate();
  return { ok: true, warehouseId: data.id as string };
}

export async function updateWarehouse(id: string, input: WarehouseInput) {
  const supabase = createClient();

  const name = clean(input.name);
  if (!name) return { error: "Informe o nome do almoxarifado" };

  const { error } = await supabase
    .from("tool_warehouses")
    .update({ name, location: clean(input.location), notes: clean(input.notes) })
    .eq("id", id);

  if (error) return { error: warehouseError(error) };
  revalidate();
  return { ok: true };
}

/**
 * Remove o almoxarifado. Os itens guardados nele NÃO são apagados — ficam sem
 * almoxarifado (aparecem em "Sem almoxarifado") até serem realocados.
 */
export async function deleteWarehouse(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("tool_warehouses").delete().eq("id", id);
  if (error) return { error: warehouseError(error) };
  revalidate();
  return { ok: true };
}

/** Move um item de patrimônio para outro almoxarifado. */
export async function moveToolToWarehouse(toolId: string, warehouseId: string | null) {
  const supabase = createClient();
  const { error } = await supabase
    .from("tools")
    .update({ warehouse_id: warehouseId || null })
    .eq("id", toolId);
  if (error) return { error: warehouseError(error) };
  revalidate();
  return { ok: true };
}
