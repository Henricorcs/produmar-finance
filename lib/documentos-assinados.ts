// ─────────────────────────────────────────────────────────────────────────────
// O PDF ASSINADO GUARDADO de cada contrato/procuração (migration 123) — servidor
// ─────────────────────────────────────────────────────────────────────────────
// Um por documento: assinar de novo troca o anterior. Editar o contrato
// DESCARTA a assinatura — o PDF assinado tem o texto antigo e não valeria para
// o novo. O arquivo fica no disco do servidor (pasta "assinados/").
// ─────────────────────────────────────────────────────────────────────────────

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { removerArquivos, uploadBytes, urlDoArquivo } from "@/lib/storage";
import type { DocumentoAssinado, TipoDocumentoAssinavel } from "@/lib/types";

export const TIPOS_ASSINAVEIS: TipoDocumentoAssinavel[] = [
  "aluguel",
  "compra_venda",
  "procuracao",
  "confissao_divida",
  "anexo_mobilia",
];

/** O PDF assinado do documento, se tiver (lido com o login de quem abriu). */
export async function documentoAssinado(
  supabase: SupabaseClient,
  tipo: TipoDocumentoAssinavel,
  id: string
): Promise<DocumentoAssinado | null> {
  const { data, error } = await supabase
    .from("signed_documents")
    .select("file_path, signers, created_at")
    .eq("doc_type", tipo)
    .eq("doc_id", id)
    .maybeSingle();
  // sem a migration 123 a impressão segue normal, só sem o assinado
  if (error || !data) return null;
  return {
    url: urlDoArquivo(data.file_path as string),
    assinantes: (data.signers as string[]) ?? [],
    assinadoEm: data.created_at as string,
  };
}

/** Guarda o PDF assinado no lugar do anterior (se havia). */
export async function guardarAssinado(
  tipo: TipoDocumentoAssinavel,
  id: string,
  pdf: Buffer,
  assinantes: string[],
  userId: string
): Promise<{ error: string } | { ok: true; doc: DocumentoAssinado }> {
  const admin = createAdminClient();
  const { data: antes } = await admin
    .from("signed_documents")
    .select("file_path")
    .eq("doc_type", tipo)
    .eq("doc_id", id)
    .maybeSingle();

  const chave = `assinados/${tipo}/${id}/${randomUUID()}.pdf`;
  const up = await uploadBytes(chave, pdf);
  if (up.error) return { error: `Não foi possível guardar o PDF assinado: ${up.error.message}` };

  const { data, error } = await admin
    .from("signed_documents")
    .upsert(
      { doc_type: tipo, doc_id: id, file_path: chave, signers: assinantes, created_by: userId, created_at: new Date().toISOString() },
      { onConflict: "doc_type,doc_id" }
    )
    .select("created_at")
    .single();
  if (error || !data) {
    await removerArquivos([chave]);
    if (/signed_documents/.test(error?.message ?? ""))
      return { error: "Rode a migration 123 no Supabase para guardar o PDF assinado" };
    return { error: error?.message ?? "Não foi possível guardar o PDF assinado" };
  }
  if (antes?.file_path && antes.file_path !== chave) await removerArquivos([antes.file_path as string]);

  return { ok: true, doc: { url: urlDoArquivo(chave), assinantes, assinadoEm: data.created_at as string } };
}

export type OrigemAssinado = "avulso" | TipoDocumentoAssinavel;

/**
 * Guarda a cópia no ARQUIVO (migration 124): um registro por certificado que
 * assinou — é o que põe o documento na pasta de cada um. Histórico: não some
 * quando o contrato é editado. Falhar aqui não desfaz a assinatura.
 */
export async function arquivarAssinado(
  pdf: Buffer,
  nomeArquivo: string,
  certificados: { id: string; nome: string; documento: string | null }[],
  origem: OrigemAssinado,
  docId: string | null,
  userId: string
): Promise<{ error: string } | { ok: true; url: string }> {
  const chave = `arquivo-assinado/${randomUUID()}.pdf`;
  const up = await uploadBytes(chave, pdf);
  if (up.error) return { error: `Não foi possível guardar no arquivo: ${up.error.message}` };
  const { error } = await createAdminClient()
    .from("signed_files")
    .insert(
      certificados.map((c) => ({
        file_name: nomeArquivo,
        file_path: chave,
        size_bytes: pdf.length,
        certificate_id: c.id,
        certificate_name: c.nome,
        certificate_document: c.documento,
        origin: origem,
        doc_id: docId,
        created_by: userId,
      }))
    );
  if (error) {
    await removerArquivos([chave]);
    if (/signed_files/.test(error.message)) return { error: "Rode a migration 124 no Supabase para guardar o arquivo de assinados" };
    return { error: error.message };
  }
  return { ok: true, url: urlDoArquivo(chave) };
}

/**
 * O documento foi editado: a assinatura não vale para o texto novo — sai o
 * registro e o arquivo. Silencioso: sem migration ou sem assinatura, nada a fazer.
 */
export async function descartarAssinatura(tipo: TipoDocumentoAssinavel, id: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("signed_documents")
      .delete()
      .eq("doc_type", tipo)
      .eq("doc_id", id)
      .select("file_path");
    const chaves = ((data ?? []) as { file_path: string }[]).map((d) => d.file_path);
    if (chaves.length) await removerArquivos(chaves);
  } catch {
    // sem a chave de serviço ou sem a tabela: não há assinatura a descartar
  }
}
