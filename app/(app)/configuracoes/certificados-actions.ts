"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assinarPdf, cifrar, decifrar, lerCertificado } from "@/lib/assinatura-digital";
import type { CertificadoResumo } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────────
// CERTIFICADOS A1 — enviar, listar, apagar e assinar (migration 122)
// ─────────────────────────────────────────────────────────────────────────────
// Tudo aqui é SÓ PARA ADMIN: assinar com o certificado de alguém é assinar por
// essa pessoa. A tabela não tem regra de leitura no banco — quem lê é a chave
// de serviço, e só depois de conferir que quem pediu é admin.

async function souAdmin(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return data?.role === "admin" ? user.id : null;
}

function erroDaTabela(message: string): string {
  if (/signing_certificates/.test(message))
    return "Rode a migration 122 no Supabase para guardar os certificados";
  return message;
}

type Linha = {
  id: string;
  holder_name: string;
  holder_document: string | null;
  issuer: string | null;
  valid_until: string | null;
};

function resumo(l: Linha): CertificadoResumo {
  return {
    id: l.id,
    nome: l.holder_name,
    documento: l.holder_document,
    emissor: l.issuer,
    validoAte: l.valid_until,
  };
}

/**
 * Os certificados guardados (só os dados de quem é — nunca o arquivo). Quem
 * não é admin recebe `admin: false` e lista vazia — o botão nem aparece.
 */
export async function listarCertificados(): Promise<{
  admin: boolean;
  lista: CertificadoResumo[];
  erro?: string;
}> {
  if (!(await souAdmin())) return { admin: false, lista: [] };
  const { data, error } = await createAdminClient()
    .from("signing_certificates")
    .select("id, holder_name, holder_document, issuer, valid_until")
    .order("holder_name");
  if (error) return { admin: true, lista: [], erro: erroDaTabela(error.message) };
  return { admin: true, lista: ((data as Linha[]) ?? []).map(resumo) };
}

/**
 * Recebe o .pfx e a senha, confere que a senha abre o arquivo e guarda os dois
 * cifrados. O mesmo certificado enviado de novo (renovado, por exemplo)
 * substitui o antigo do mesmo titular.
 */
export async function enviarCertificado(
  formData: FormData
): Promise<{ error: string } | { ok: true; certificado: CertificadoResumo }> {
  const userId = await souAdmin();
  if (!userId) return { error: "Só administradores podem guardar certificados" };

  const arquivo = formData.get("arquivo");
  const senha = String(formData.get("senha") ?? "");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { error: "Escolha o arquivo do certificado (.pfx ou .p12)" };
  if (arquivo.size > 200_000) return { error: "Esse arquivo é grande demais para ser um certificado A1" };
  if (!senha) return { error: "Digite a senha do certificado" };

  const pfx = Buffer.from(await arquivo.arrayBuffer());
  let dados;
  try {
    dados = lerCertificado(pfx, senha);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível abrir o certificado" };
  }
  if (new Date(dados.validoAte) < new Date())
    return { error: `Esse certificado venceu em ${new Date(dados.validoAte).toLocaleDateString("pt-BR")}` };

  let linha;
  try {
    linha = {
      holder_name: dados.nome,
      holder_document: dados.documento,
      issuer: dados.emissor,
      valid_from: dados.validoDe,
      valid_until: dados.validoAte,
      pfx_encrypted: cifrar(pfx),
      password_encrypted: cifrar(Buffer.from(senha, "utf8")),
      created_by: userId,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível guardar o certificado" };
  }

  const admin = createAdminClient();
  // o mesmo titular de novo (certificado renovado): troca o antigo
  if (dados.documento) {
    const { error } = await admin.from("signing_certificates").delete().eq("holder_document", dados.documento);
    if (error) return { error: erroDaTabela(error.message) };
  }
  const { data, error } = await admin
    .from("signing_certificates")
    .insert(linha)
    .select("id, holder_name, holder_document, issuer, valid_until")
    .single();
  if (error || !data) return { error: erroDaTabela(error?.message ?? "Erro ao guardar") };

  revalidatePath("/configuracoes");
  return { ok: true, certificado: resumo(data as Linha) };
}

export async function apagarCertificado(id: string): Promise<{ error: string } | { ok: true }> {
  if (!(await souAdmin())) return { error: "Só administradores podem apagar certificados" };
  const { error } = await createAdminClient().from("signing_certificates").delete().eq("id", id);
  if (error) return { error: erroDaTabela(error.message) };
  revalidatePath("/configuracoes");
  return { ok: true };
}

/**
 * Assina o PDF (em base64) com os certificados escolhidos, na ordem da lista,
 * e devolve o PDF assinado em base64.
 */
export async function assinarComCertificados(
  pdfBase64: string,
  ids: string[]
): Promise<{ error: string } | { ok: true; pdf: string }> {
  if (!(await souAdmin())) return { error: "Só administradores podem assinar com certificado" };
  if (ids.length === 0) return { error: "Escolha pelo menos um certificado" };

  const { data, error } = await createAdminClient()
    .from("signing_certificates")
    .select("id, holder_name, valid_until, pfx_encrypted, password_encrypted")
    .in("id", ids);
  if (error) return { error: erroDaTabela(error.message) };
  const linhas = (data ?? []) as (Linha & { pfx_encrypted: string; password_encrypted: string })[];
  if (linhas.length !== ids.length) return { error: "Um dos certificados não foi encontrado — recarregue a tela" };

  const vencido = linhas.find((l) => l.valid_until && new Date(l.valid_until) < new Date());
  if (vencido)
    return {
      error: `O certificado de ${vencido.holder_name} venceu em ${new Date(vencido.valid_until!).toLocaleDateString("pt-BR")}`,
    };

  try {
    const porId = new Map(linhas.map((l) => [l.id, l]));
    const certificados = ids.map((id) => {
      const l = porId.get(id)!;
      return {
        nome: l.holder_name,
        pfx: decifrar(l.pfx_encrypted),
        senha: decifrar(l.password_encrypted).toString("utf8"),
      };
    });
    const assinado = await assinarPdf(Buffer.from(pdfBase64, "base64"), certificados);
    return { ok: true, pdf: assinado.toString("base64") };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível assinar o PDF" };
  }
}
