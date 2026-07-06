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
  notes?: string | null;
}

export async function createTool(input: ToolInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const name = clean(input.name);
  if (!name) return { error: "Informe o nome da ferramenta" };

  const { data, error } = await supabase
    .from("tools")
    .insert({
      name,
      code: clean(input.code),
      condition: input.condition ?? "bom",
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
  if (!name) return { error: "Informe o nome da ferramenta" };

  const { error } = await supabase
    .from("tools")
    .update({
      name,
      code: clean(input.code),
      condition: input.condition ?? "bom",
      notes: clean(input.notes),
    })
    .eq("id", id);

  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

/** Baixa (desativa) ou reativa uma ferramenta — histórico permanece. */
export async function setToolActive(id: string, active: boolean) {
  const supabase = createClient();
  const { error } = await supabase.from("tools").update({ active }).eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

/** Exclui a ferramenta e todo o histórico (retiradas e manutenções, por cascade). */
export async function deleteTool(id: string) {
  const supabase = createClient();

  // remove a foto do storage, se houver
  const { data: tool } = await supabase
    .from("tools")
    .select("photo_path")
    .eq("id", id)
    .maybeSingle();
  if (tool?.photo_path) {
    await supabase.storage.from("attachments").remove([tool.photo_path]);
  }

  const { error } = await supabase.from("tools").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// FOTO DA FERRAMENTA
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadToolPhoto(toolId: string, formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Arquivo inválido" };
  if (file.size > MAX_FILE_SIZE) return { error: "Arquivo maior que 10 MB" };

  // apaga a foto anterior para não acumular lixo no storage
  const { data: tool } = await supabase
    .from("tools")
    .select("photo_path")
    .eq("id", toolId)
    .maybeSingle();
  if (tool?.photo_path) {
    await supabase.storage.from("attachments").remove([tool.photo_path]);
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `tools/${toolId}/${randomUUID()}_${safeName}`;

  const { error: upErr } = await supabase.storage
    .from("attachments")
    .upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (upErr) return { error: upErr.message };

  const { error } = await supabase
    .from("tools")
    .update({ photo_path: path })
    .eq("id", toolId);
  if (error) return { error: error.message };

  revalidate();
  return { ok: true };
}

/** Gera uma URL assinada (1h) para exibir a foto da ferramenta. */
export async function getToolPhotoUrl(storagePath: string) {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(storagePath, 60 * 60);
  if (error || !data) return { error: error?.message ?? "Erro ao abrir foto" };
  return { url: data.signedUrl };
}

// ─────────────────────────────────────────────────────────────────────────────
// RETIRADA E DEVOLUÇÃO
// ─────────────────────────────────────────────────────────────────────────────

export async function checkoutTool(input: {
  tool_id: string;
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
  if (!input.tool_id) return { error: "Selecione a ferramenta" };
  if (!borrower) return { error: "Informe quem está retirando" };

  // a ferramenta precisa estar disponível
  const { data: t } = await supabase
    .from("v_tool_status")
    .select("status, name")
    .eq("id", input.tool_id)
    .maybeSingle();
  if (!t) return { error: "Ferramenta não encontrada" };
  if (t.status === "em_uso") return { error: "Esta ferramenta já está em uso" };
  if (t.status === "manutencao") return { error: "Esta ferramenta está em manutenção" };
  if (t.status === "baixada") return { error: "Esta ferramenta está baixada" };

  const { data, error } = await supabase
    .from("tool_loans")
    .insert({
      tool_id: input.tool_id,
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

  if (error || !data) return { error: error?.message ?? "Erro ao registrar retirada" };
  revalidate();
  return { ok: true, loanId: data.id as string };
}

/** Foto de quem recebeu a ferramenta, tirada no momento da retirada. */
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
  if (!loan) return { error: "Retirada não encontrada" };
  if (loan.returned_at) return { error: "Esta retirada já foi devolvida" };

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
  if (!input.tool_id) return { error: "Selecione a ferramenta" };
  if (!description) return { error: "Descreva a manutenção" };

  const { data: t } = await supabase
    .from("v_tool_status")
    .select("status")
    .eq("id", input.tool_id)
    .maybeSingle();
  if (!t) return { error: "Ferramenta não encontrada" };
  if (t.status === "em_uso")
    return { error: "Devolva a ferramenta antes de enviar para manutenção" };
  if (t.status === "manutencao")
    return { error: "Esta ferramenta já está em manutenção" };
  if (t.status === "baixada") return { error: "Esta ferramenta está baixada" };

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
