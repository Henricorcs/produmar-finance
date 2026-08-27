"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { removeSupplyPhotoIfUnused } from "@/lib/supply-photos";
import type { SupplyMovementType } from "@/lib/types";
import { removerArquivos, uploadArquivo, urlDoArquivo } from "@/lib/storage";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function revalidate() {
  revalidatePath("/almoxarifado");
  // as obras do Estoque (supply_obras) são cuidadas no módulo Obras: cadastro,
  // setores e o quanto cada obra consumiu aparecem lá, então aquela tela
  // também tem que acompanhar o que muda aqui
  revalidatePath("/obras");
}

function clean(s?: string | null): string | null {
  const v = s?.trim();
  return v ? v.toUpperCase() : null;
}

/** Quantidade sempre positiva, com até 3 casas (0,5 m de cano é válido). */
function normQty(v?: number | null): number {
  const n = Math.abs(Number(v ?? 0));
  return Math.round(n * 1000) / 1000;
}

/**
 * A tabela vem da migration 049 — sem ela o erro cru do Postgres não ajuda
 * ninguém a entender o que falta fazer.
 */
function supplyError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Já existe um registro com esse nome";
  if (error.message.includes("photo_path"))
    return "Rode a migration 050 no Supabase para usar as fotos";
  if (error.message.includes("supply_requests"))
    return "Rode a migration 052 no Supabase para receber os envios do técnico";
  if (error.message.includes("supply_obra_despesas"))
    return "Rode a migration 067 no Supabase para lançar despesas na obra";
  if (error.message.includes("supply_locais") || error.message.includes("local_id"))
    return "Rode a migration 066 no Supabase para usar os locais da obra";
  if (error.message.includes("v_supply_obra_extrato"))
    return "Rode a migration 066 no Supabase para ver o extrato da obra";
  if (error.message.includes("supply_obra_sectors") || error.message.includes("sector_id"))
    return "Rode a migration 057 no Supabase para usar os setores da obra";
  if (error.message.includes("supply_obras") || error.message.includes("obra_id"))
    return "Rode a migration 051 no Supabase para usar as obras";
  if (
    error.code === "42P01" ||
    error.message.includes("supply_items") ||
    error.message.includes("supply_movements") ||
    error.message.includes("supply_categories") ||
    error.message.includes("v_supply_stock")
  )
    return "Rode a migration 049 no Supabase para usar o Estoque";
  return error.message;
}

// ─────────────────────────────────────────────────────────────────────────────
// ITEM (CRUD)
// ─────────────────────────────────────────────────────────────────────────────

export interface SupplyItemInput {
  name: string;
  code?: string | null;
  category_id?: string | null;
  unit?: string | null;
  min_quantity?: number | null;
  location?: string | null;
  notes?: string | null;
}

function normUnit(v?: string | null): string {
  const u = v?.trim();
  return u ? u : "un";
}

/**
 * Cadastra o item. Quando vem `initial_quantity`, já registra a primeira
 * entrada ("saldo inicial") — o saldo do item sempre nasce de um movimento.
 */
export async function createSupplyItem(
  input: SupplyItemInput & { initial_quantity?: number | null; initial_unit_cost?: number | null }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const name = clean(input.name);
  if (!name) return { error: "Informe o nome do item" };

  const { data, error } = await supabase
    .from("supply_items")
    .insert({
      name,
      code: clean(input.code),
      category_id: input.category_id || null,
      unit: normUnit(input.unit),
      min_quantity: normQty(input.min_quantity),
      location: clean(input.location),
      notes: clean(input.notes),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error ? supplyError(error) : "Erro ao cadastrar" };

  const initial = normQty(input.initial_quantity);
  if (initial > 0) {
    const { error: movErr } = await supabase.from("supply_movements").insert({
      item_id: data.id,
      type: "entrada",
      quantity: initial,
      unit_cost: input.initial_unit_cost ? Math.max(0, input.initial_unit_cost) : null,
      notes: "SALDO INICIAL",
      created_by: user.id,
    });
    if (movErr) return { error: supplyError(movErr) };
  }

  revalidate();
  return { ok: true, itemId: data.id as string };
}

export async function updateSupplyItem(id: string, input: SupplyItemInput) {
  const supabase = createClient();

  const name = clean(input.name);
  if (!name) return { error: "Informe o nome do item" };

  const { error } = await supabase
    .from("supply_items")
    .update({
      name,
      code: clean(input.code),
      category_id: input.category_id || null,
      unit: normUnit(input.unit),
      min_quantity: normQty(input.min_quantity),
      location: clean(input.location),
      notes: clean(input.notes),
    })
    .eq("id", id);

  if (error) return { error: supplyError(error) };
  revalidate();
  return { ok: true };
}

/** Exclui o item e todo o histórico de movimentos (por cascade). */
export async function deleteSupplyItem(id: string) {
  const supabase = createClient();

  // tira do storage a foto do item e as dos lançamentos que somem junto
  const { data: item } = await supabase
    .from("supply_items")
    .select("photo_path")
    .eq("id", id)
    .maybeSingle();
  const { data: movs } = await supabase
    .from("supply_movements")
    .select("photo_path")
    .eq("item_id", id)
    .not("photo_path", "is", null);

  const paths = [
    ...(item?.photo_path ? [item.photo_path as string] : []),
    ...(movs ?? []).map((m) => m.photo_path as string),
  ];
  if (paths.length) await removerArquivos(paths);

  const { error } = await supabase.from("supply_items").delete().eq("id", id);
  if (error) return { error: supplyError(error) };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// FOTOS (bucket 'attachments', o mesmo de Contas e Patrimônio)
// ─────────────────────────────────────────────────────────────────────────────

/** Sobe o arquivo e devolve o caminho no bucket. */
async function uploadPhoto(
  supabase: ReturnType<typeof createClient>,
  folder: string,
  file: File
): Promise<{ path: string } | { error: string }> {
  if (file.size > MAX_FILE_SIZE) return { error: "A foto deve ter no máximo 10 MB" };

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${folder}/${randomUUID()}_${safeName}`;

  const { error } = await uploadArquivo(path, file);
  if (error) return { error: error.message };
  return { path };
}

/** Foto do item. Substitui a anterior (uma foto por item). */
export async function uploadSupplyItemPhoto(itemId: string, formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Arquivo inválido" };

  const up = await uploadPhoto(supabase, `supply-items/${itemId}`, file);
  if ("error" in up) return { error: up.error };

  const { data: previous } = await supabase
    .from("supply_items")
    .select("photo_path")
    .eq("id", itemId)
    .maybeSingle();

  const { error } = await supabase
    .from("supply_items")
    .update({ photo_path: up.path })
    .eq("id", itemId);
  if (error) {
    await removerArquivos([up.path]);
    return { error: supplyError(error) };
  }

  if (previous?.photo_path) {
    await removerArquivos([previous.photo_path]);
  }

  revalidate();
  return { ok: true };
}

export async function deleteSupplyItemPhoto(itemId: string) {
  const supabase = createClient();

  const { data: item } = await supabase
    .from("supply_items")
    .select("photo_path")
    .eq("id", itemId)
    .maybeSingle();
  if (!item?.photo_path) return { ok: true };

  const { error } = await supabase
    .from("supply_items")
    .update({ photo_path: null })
    .eq("id", itemId);
  if (error) return { error: supplyError(error) };

  await removerArquivos([item.photo_path]);
  revalidate();
  return { ok: true };
}

/** Comprovante do lançamento (nota na entrada, quem levou na saída). */
export async function uploadSupplyMovementPhoto(movementId: string, formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Arquivo inválido" };

  const up = await uploadPhoto(supabase, `supply-movements/${movementId}`, file);
  if ("error" in up) return { error: up.error };

  const { error } = await supabase
    .from("supply_movements")
    .update({ photo_path: up.path })
    .eq("id", movementId);
  if (error) {
    await removerArquivos([up.path]);
    return { error: supplyError(error) };
  }

  revalidate();
  return { ok: true };
}

/**
 * URLs assinadas (1h) para exibir as fotos. Recebe vários caminhos de uma vez
 * para o detalhe do item não precisar de uma ida ao servidor por foto.
 */
export async function getSupplyPhotoUrls(paths: string[]) {
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (unique.length === 0) return { urls: {} as Record<string, string> };

  // O endereço é montado na hora, sem ida ao servidor de arquivos: quem confere
  // o acesso é a rota /api/arquivo, no momento em que a foto for aberta.
  const urls: Record<string, string> = {};
  for (const path of unique) urls[path] = urlDoArquivo(path);
  return { urls };
}

// ─────────────────────────────────────────────────────────────────────────────
// MOVIMENTOS (entrada, saída e ajuste)
// ─────────────────────────────────────────────────────────────────────────────

export interface SupplyMovementInput {
  item_id: string;
  type: SupplyMovementType;
  quantity: number;
  unit_cost?: number | null;
  person?: string | null;
  destination?: string | null;
  obra_id?: string | null;
  movement_date?: string | null;
  notes?: string | null;
}

/**
 * Registra o movimento. A saída não deixa o saldo ficar negativo — quem
 * conferiu o estoque e achou diferença usa o AJUSTE, que aceita qualquer valor.
 */
export async function createSupplyMovement(input: SupplyMovementInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!input.item_id) return { error: "Selecione o item" };

  const qty = normQty(input.quantity);
  if (qty <= 0) return { error: "Informe a quantidade" };

  if (input.type === "saida") {
    const { data: stock } = await supabase
      .from("v_supply_stock")
      .select("current_quantity, unit")
      .eq("id", input.item_id)
      .maybeSingle();
    const available = Number(stock?.current_quantity ?? 0);
    if (qty > available)
      return {
        error: `Saldo insuficiente (disponível: ${available} ${stock?.unit ?? ""})`.trim(),
      };
  }

  const { data, error } = await supabase
    .from("supply_movements")
    .insert({
      item_id: input.item_id,
      type: input.type,
      quantity: qty,
      unit_cost:
        input.type === "entrada" && input.unit_cost ? Math.max(0, input.unit_cost) : null,
      person: clean(input.person),
      destination: clean(input.destination),
      obra_id: input.type === "saida" ? input.obra_id || null : null,
      movement_date: input.movement_date || undefined,
      notes: clean(input.notes),
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error ? supplyError(error) : "Erro ao registrar" };
  revalidate();
  return { ok: true, movementId: data.id as string };
}

/**
 * Acerta o saldo para o valor contado na prateleira. Grava a DIFERENÇA como
 * ajuste (positiva ou negativa) — o histórico continua contando a história toda.
 */
export async function adjustSupplyStock(input: {
  item_id: string;
  counted_quantity: number;
  notes?: string | null;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!input.item_id) return { error: "Selecione o item" };

  const { data: stock } = await supabase
    .from("v_supply_stock")
    .select("current_quantity")
    .eq("id", input.item_id)
    .maybeSingle();
  if (!stock) return { error: "Item não encontrado" };

  const counted = normQty(input.counted_quantity);
  const diff = Math.round((counted - Number(stock.current_quantity ?? 0)) * 1000) / 1000;
  if (diff === 0) return { error: "O saldo já está correto — nada a ajustar" };

  const { error } = await supabase.from("supply_movements").insert({
    item_id: input.item_id,
    type: "ajuste",
    quantity: diff,
    notes: clean(input.notes) ?? `CONTAGEM: ${counted}`,
    created_by: user.id,
  });

  if (error) return { error: supplyError(error) };
  revalidate();
  return { ok: true };
}

/**
 * Cancela um movimento lançado errado — o saldo se acerta sozinho, porque ele é
 * derivado dos movimentos. Cancelar uma ENTRADA que o pessoal já consumiu
 * deixaria o saldo negativo: nesse caso o certo é conferir o estoque.
 */
export async function deleteSupplyMovement(id: string) {
  const supabase = createClient();

  const { data: mov } = await supabase
    .from("supply_movements")
    .select("item_id, type, quantity, photo_path")
    .eq("id", id)
    .maybeSingle();
  if (!mov) return { error: "Movimentação não encontrada" };

  if (mov.type !== "saida") {
    const { data: stock } = await supabase
      .from("v_supply_stock")
      .select("current_quantity, unit")
      .eq("id", mov.item_id)
      .maybeSingle();
    const after =
      Math.round((Number(stock?.current_quantity ?? 0) - Number(mov.quantity)) * 1000) / 1000;
    if (after < 0)
      return {
        error:
          `Não dá para cancelar: o saldo ficaria em ${after} ${stock?.unit ?? ""}`.trim() +
          ". Esse material já saiu do estoque — use Conferir para acertar a quantidade.",
      };
  }

  const { error } = await supabase.from("supply_movements").delete().eq("id", id);
  if (error) return { error: supplyError(error) };

  // o comprovante vai junto — sem o lançamento ele não serve mais pra nada
  if (mov.photo_path) {
    await removerArquivos([mov.photo_path as string]);
  }

  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORIAS
// ─────────────────────────────────────────────────────────────────────────────

export async function createSupplyCategory(name: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const n = clean(name);
  if (!n) return { error: "Informe o nome da categoria" };

  const { error } = await supabase
    .from("supply_categories")
    .insert({ name: n, created_by: user.id });
  if (error) return { error: supplyError(error) };
  revalidate();
  return { ok: true };
}

export async function renameSupplyCategory(id: string, name: string) {
  const supabase = createClient();
  const n = clean(name);
  if (!n) return { error: "Informe o nome da categoria" };

  const { error } = await supabase.from("supply_categories").update({ name: n }).eq("id", id);
  if (error) return { error: supplyError(error) };
  revalidate();
  return { ok: true };
}

/** Remove a categoria. Os itens dela NÃO somem — ficam sem categoria. */
export async function deleteSupplyCategory(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("supply_categories").delete().eq("id", id);
  if (error) return { error: supplyError(error) };
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAIS DA OBRA (migration 066)
// ─────────────────────────────────────────────────────────────────────────────
// Onde a obra acontece: Fazenda 01, Fazenda 02, Sítio... A mesma fazenda tem
// várias obras, e é o local que responde "quanto já gastei nesta fazenda".
// Cadastro livre — o dono cria quantos quiser, na hora.

export async function createSupplyLocal(name: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const nome = clean(name);
  if (!nome) return { error: "Informe o nome do local" };

  const { data, error } = await supabase
    .from("supply_locais")
    .insert({ name: nome, created_by: user.id })
    .select("id")
    .single();

  if (error || !data) return { error: error ? supplyError(error) : "Erro ao cadastrar" };
  revalidate();
  revalidatePath("/tecnico");
  return { ok: true, localId: data.id as string };
}

export async function updateSupplyLocal(id: string, name: string) {
  const supabase = createClient();

  const nome = clean(name);
  if (!nome) return { error: "Informe o nome do local" };

  const { error } = await supabase.from("supply_locais").update({ name: nome }).eq("id", id);
  if (error) return { error: supplyError(error) };
  revalidate();
  revalidatePath("/tecnico");
  return { ok: true };
}

/** Apagar o local NÃO apaga as obras dele: elas só ficam sem local. */
export async function deleteSupplyLocal(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("supply_locais").delete().eq("id", id);
  if (error) return { error: supplyError(error) };
  revalidate();
  revalidatePath("/tecnico");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// OBRAS DO ESTOQUE
// (lista própria do módulo — nada a ver com a tabela obras do módulo Obras)
// ─────────────────────────────────────────────────────────────────────────────

export interface SupplyObraInput {
  name: string;
  client?: string | null;
  notes?: string | null;
  /** Onde a obra acontece (migration 066). Vazio = obra sem local. */
  local_id?: string | null;
}

export async function createSupplyObra(input: SupplyObraInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const name = clean(input.name);
  if (!name) return { error: "Informe o nome da obra" };

  const { data, error } = await supabase
    .from("supply_obras")
    .insert({
      name,
      client: clean(input.client),
      notes: clean(input.notes),
      local_id: input.local_id || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error ? supplyError(error) : "Erro ao cadastrar" };
  revalidate();
  return { ok: true, obraId: data.id as string };
}

export async function updateSupplyObra(id: string, input: SupplyObraInput) {
  const supabase = createClient();

  const name = clean(input.name);
  if (!name) return { error: "Informe o nome da obra" };

  const { error } = await supabase
    .from("supply_obras")
    .update({
      name,
      client: clean(input.client),
      notes: clean(input.notes),
      local_id: input.local_id || null,
    })
    .eq("id", id);

  if (error) return { error: supplyError(error) };
  revalidate();
  return { ok: true };
}

/**
 * O extrato da obra: tudo que ela gastou em linha do tempo — material que saiu
 * do Estoque e diárias — vindo já somado na mesma forma pela view da migration
 * 066. É o que responde quando foi, com o que foi, quanto custou e quem usou.
 */
export async function getSupplyObraExtrato(obraId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("v_supply_obra_extrato")
    .select("*")
    .eq("obra_id", obraId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return { error: supplyError(error) };
  return { extrato: data ?? [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// DESPESA AVULSA DA OBRA (migration 067)
// ─────────────────────────────────────────────────────────────────────────────
// O gasto que não passa pelo Estoque nem pela diária: compra direta, frete,
// combustível, serviço de terceiro. NÃO cria lançamento em Contas — é registro
// e relatório dentro de Obras.

export interface SupplyObraDespesaInput {
  obra_id: string;
  expense_date?: string | null;
  category?: string | null;
  description: string;
  amount: number;
  person?: string | null;
  notes?: string | null;
}

function despesaFields(input: SupplyObraDespesaInput) {
  const fields: Record<string, unknown> = {
    category: clean(input.category),
    description: clean(input.description),
    amount: normMoney(input.amount),
    person: clean(input.person),
    notes: clean(input.notes),
  };
  // sem data informada o banco resolve sozinho (default current_date), e na
  // edição a data que já estava lá continua valendo
  if (input.expense_date) fields.expense_date = input.expense_date;
  return fields;
}

export async function createSupplyObraDespesa(input: SupplyObraDespesaInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!input.obra_id) return { error: "Obra não informada" };
  if (!clean(input.description)) return { error: "Informe o que foi a despesa" };
  if (normMoney(input.amount) <= 0) return { error: "Informe o valor da despesa" };

  const { data, error } = await supabase
    .from("supply_obra_despesas")
    .insert({ obra_id: input.obra_id, ...despesaFields(input), created_by: user.id })
    .select("id")
    .single();

  if (error || !data) return { error: error ? supplyError(error) : "Erro ao lançar" };
  revalidate();
  return { ok: true, despesaId: data.id as string };
}

export async function updateSupplyObraDespesa(id: string, input: SupplyObraDespesaInput) {
  const supabase = createClient();

  if (!clean(input.description)) return { error: "Informe o que foi a despesa" };
  if (normMoney(input.amount) <= 0) return { error: "Informe o valor da despesa" };

  const { error } = await supabase
    .from("supply_obra_despesas")
    .update(despesaFields(input))
    .eq("id", id);

  if (error) return { error: supplyError(error) };
  revalidate();
  return { ok: true };
}

/** Apaga a despesa e o comprovante dela — a foto é só desta despesa. */
export async function deleteSupplyObraDespesa(id: string) {
  const supabase = createClient();

  const { data: despesa } = await supabase
    .from("supply_obra_despesas")
    .select("photo_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("supply_obra_despesas").delete().eq("id", id);
  if (error) return { error: supplyError(error) };

  if (despesa?.photo_path) await removerArquivos([despesa.photo_path as string]);
  revalidate();
  return { ok: true };
}

/** Comprovante da despesa (nota, recibo, foto do pagamento). */
export async function uploadSupplyObraDespesaPhoto(despesaId: string, formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Arquivo inválido" };

  const up = await uploadPhoto(supabase, `supply-obra-despesas/${despesaId}`, file);
  if ("error" in up) return { error: up.error };

  // troca de foto: a antiga sai do storage, ninguém mais aponta para ela
  const { data: anterior } = await supabase
    .from("supply_obra_despesas")
    .select("photo_path")
    .eq("id", despesaId)
    .maybeSingle();

  const { error } = await supabase
    .from("supply_obra_despesas")
    .update({ photo_path: up.path })
    .eq("id", despesaId);
  if (error) {
    await removerArquivos([up.path]);
    return { error: supplyError(error) };
  }

  if (anterior?.photo_path) await removerArquivos([anterior.photo_path as string]);
  revalidate();
  return { ok: true };
}

/** Tira o comprovante sem apagar a despesa. */
export async function removeSupplyObraDespesaPhoto(despesaId: string) {
  const supabase = createClient();

  const { data: despesa } = await supabase
    .from("supply_obra_despesas")
    .select("photo_path")
    .eq("id", despesaId)
    .maybeSingle();
  if (!despesa?.photo_path) return { ok: true };

  const { error } = await supabase
    .from("supply_obra_despesas")
    .update({ photo_path: null })
    .eq("id", despesaId);
  if (error) return { error: supplyError(error) };

  await removerArquivos([despesa.photo_path as string]);
  revalidate();
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// SOLICITAÇÕES DO TÉCNICO (migration 052)
// O técnico avisa o que usou; nada sai do estoque até o chefe dar baixa aqui.
// ─────────────────────────────────────────────────────────────────────────────

export interface ApproveSupplyRequestInput {
  /** Item de verdade do cadastro — o técnico pode ter só escrito o nome. */
  item_id: string;
  quantity: number;
  obra_id?: string | null;
  destination?: string | null;
  /** Quem usou o material (vem preenchido com quem enviou o recado). */
  person?: string | null;
  movement_date?: string | null;
  notes?: string | null;
}

/**
 * Dá baixa no que o técnico avisou: nasce a saída em supply_movements (com a
 * mesma checagem de saldo do lançamento normal) e o recado morre. A foto que
 * ele mandou passa a ser o comprovante da saída.
 */
export async function approveSupplyRequest(
  requestId: string,
  input: ApproveSupplyRequestInput
) {
  const supabase = createClient();

  const { data: req, error: reqErr } = await supabase
    .from("supply_requests")
    .select("photo_path")
    .eq("id", requestId)
    .maybeSingle();
  if (reqErr) return { error: supplyError(reqErr) };
  if (!req) return { error: "Envio não encontrado — talvez já tenha sido resolvido" };

  const mov = await createSupplyMovement({
    item_id: input.item_id,
    type: "saida",
    quantity: input.quantity,
    person: input.person,
    destination: input.destination,
    obra_id: input.obra_id,
    movement_date: input.movement_date,
    notes: input.notes,
  });
  if ("error" in mov) return mov;

  // a foto continua no storage: agora ela é o comprovante do lançamento
  if (req.photo_path && mov.movementId) {
    await supabase
      .from("supply_movements")
      .update({ photo_path: req.photo_path })
      .eq("id", mov.movementId);
  }

  const { error } = await supabase.from("supply_requests").delete().eq("id", requestId);
  if (error) return { error: supplyError(error) };

  revalidate();
  revalidatePath("/tecnico");
  return { ok: true };
}

/** Descarta o recado (errado, duplicado) — nada sai do estoque. */
export async function rejectSupplyRequest(requestId: string) {
  const supabase = createClient();

  const { data: req } = await supabase
    .from("supply_requests")
    .select("photo_path")
    .eq("id", requestId)
    .maybeSingle();

  const { error } = await supabase.from("supply_requests").delete().eq("id", requestId);
  if (error) return { error: supplyError(error) };

  // a foto pode ser dos outros materiais do mesmo envio — só apaga se sobrou só ela
  await removeSupplyPhotoIfUnused(supabase, req?.photo_path as string | null);

  revalidate();
  revalidatePath("/tecnico");
  return { ok: true };
}

/**
 * Remove a obra. As saídas e as diárias dela NÃO somem — ficam sem obra. As
 * despesas avulsas somem junto (só existiam por causa desta obra), então os
 * comprovantes delas saem do storage antes.
 */
export async function deleteSupplyObra(id: string) {
  const supabase = createClient();

  const { data: despesas } = await supabase
    .from("supply_obra_despesas")
    .select("photo_path")
    .eq("obra_id", id)
    .not("photo_path", "is", null);

  const { error } = await supabase.from("supply_obras").delete().eq("id", id);
  if (error) return { error: supplyError(error) };

  const paths = (despesas ?? []).map((d) => d.photo_path as string);
  if (paths.length) await removerArquivos(paths);
  revalidate();
  revalidatePath("/tecnico");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// SETORES DA OBRA (subcadastro — migration 057)
// ─────────────────────────────────────────────────────────────────────────────
// O "onde você aplicou" do técnico virou cadastro: o chefe diz quais são os
// setores de cada obra e o técnico só escolhe. Sem isso cada um escrevia de um
// jeito e não dava para somar nada por lugar.

export async function createSupplyObraSector(obraId: string, name: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!obraId) return { error: "Obra não informada" };
  const nome = clean(name);
  if (!nome) return { error: "Informe o nome do setor" };

  const { data, error } = await supabase
    .from("supply_obra_sectors")
    .insert({ obra_id: obraId, name: nome, created_by: user.id })
    .select("id")
    .single();

  if (error || !data) return { error: error ? supplyError(error) : "Erro ao cadastrar" };
  revalidate();
  revalidatePath("/tecnico");
  return { ok: true, sectorId: data.id as string };
}

/**
 * Apaga o setor. Os envios que já apontavam para ele NÃO somem — ficam sem
 * setor (o `on delete set null` da 057).
 */
export async function deleteSupplyObraSector(id: string) {
  const supabase = createClient();
  const { error } = await supabase.from("supply_obra_sectors").delete().eq("id", id);
  if (error) return { error: supplyError(error) };
  revalidate();
  revalidatePath("/tecnico");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// CERCA — o metro feito e o preço dele (migration 063)
// ─────────────────────────────────────────────────────────────────────────────
// O técnico lança metro (actions de /tecnico). Aqui é o outro lado: o PREÇO,
// que é só do chefe, e a correção do que foi lançado.

function fenceError(error: { code?: string; message: string }): string {
  if (error.message.includes("fence_rate"))
    return "Rode a migration 063 no Supabase para usar o preço por metro";
  if (error.code === "42P01" || error.message.includes("supply_fence_runs"))
    return "Rode a migration 063 no Supabase para usar o controle de cerca";
  return supplyError(error);
}

/** Dinheiro sempre positivo, com 2 casas. */
function normMoney(v?: number | null): number {
  const n = Math.abs(Number(v ?? 0));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

/** Metro sempre positivo, com 2 casas (a coluna é numeric(12,2)). */
function normMeters(v?: number | null): number {
  const n = Math.abs(Number(v ?? 0));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

function revalidateFence() {
  revalidate();
  revalidatePath("/tecnico/cerca");
}

/**
 * Preço por metro da OBRA — vale para todos os setores dela que não tiverem um
 * preço próprio. É onde o chefe cadastra o valor uma vez só.
 */
export async function setObraFenceRate(obraId: string, rate: number) {
  const supabase = createClient();
  if (!obraId) return { error: "Obra não informada" };

  const { error } = await supabase
    .from("supply_obras")
    .update({ fence_rate: normMoney(rate) })
    .eq("id", obraId);

  if (error) return { error: fenceError(error) };
  revalidateFence();
  return { ok: true };
}

/**
 * Preço por metro SÓ deste setor — para quando um pedaço da cerca é de outro
 * tipo (mais fio, terreno pior) e vale diferente. Zero = volta a valer o preço
 * da obra.
 */
export async function setSectorFenceRate(sectorId: string, rate: number) {
  const supabase = createClient();
  if (!sectorId) return { error: "Setor não informado" };

  const { error } = await supabase
    .from("supply_obra_sectors")
    .update({ fence_rate: normMoney(rate) })
    .eq("id", sectorId);

  if (error) return { error: fenceError(error) };
  revalidateFence();
  return { ok: true };
}

export interface FenceRunInput {
  obra_id: string;
  sector_id?: string | null;
  work_date: string;
  meters: number;
  description?: string | null;
  /**
   * Preço travado deste trecho. `null` = usa o preço do setor/da obra — é o
   * normal, e é assim que entra o lançamento do técnico.
   */
  rate_per_meter?: number | null;
}

/** O chefe também lança metro (quando o técnico não lançou). */
export async function createFenceRun(input: FenceRunInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!input.obra_id) return { error: "Escolha a obra" };
  const meters = normMeters(input.meters);
  if (meters <= 0) return { error: "Informe quantos metros foram feitos" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.work_date ?? ""))
    return { error: "Informe o dia do serviço" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const { error } = await supabase.from("supply_fence_runs").insert({
    obra_id: input.obra_id,
    sector_id: input.sector_id || null,
    work_date: input.work_date,
    meters,
    description: clean(input.description),
    rate_per_meter: input.rate_per_meter == null ? null : normMoney(input.rate_per_meter),
    registered_by_name: clean(profile?.full_name),
    created_by: user.id,
  });

  if (error) return { error: fenceError(error) };
  revalidateFence();
  return { ok: true };
}

/** Corrigir o que foi lançado — metro, dia, setor e o preço travado do trecho. */
export async function updateFenceRun(id: string, input: FenceRunInput) {
  const supabase = createClient();

  const meters = normMeters(input.meters);
  if (meters <= 0) return { error: "Informe quantos metros foram feitos" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.work_date ?? ""))
    return { error: "Informe o dia do serviço" };

  const { error } = await supabase
    .from("supply_fence_runs")
    .update({
      obra_id: input.obra_id,
      sector_id: input.sector_id || null,
      work_date: input.work_date,
      meters,
      description: clean(input.description),
      rate_per_meter: input.rate_per_meter == null ? null : normMoney(input.rate_per_meter),
    })
    .eq("id", id);

  if (error) return { error: fenceError(error) };
  revalidateFence();
  return { ok: true };
}

export async function deleteFenceRun(id: string) {
  const supabase = createClient();

  const { data: run } = await supabase
    .from("supply_fence_runs")
    .select("photo_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("supply_fence_runs").delete().eq("id", id);
  if (error) return { error: fenceError(error) };

  // a foto é só deste lançamento (cada um sobe a sua), então some com ele
  if (run?.photo_path)
    await removerArquivos([run.photo_path as string]);

  revalidateFence();
  return { ok: true };
}
