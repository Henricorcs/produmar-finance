"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assinarPdf, cifrar, decifrar, lerCertificado, prepararPdfDeFora } from "@/lib/assinatura-digital";
import { TIPOS_ASSINAVEIS, arquivarAssinado, guardarAssinado } from "@/lib/documentos-assinados";
import { carimboDoCertificado } from "@/lib/certificado-na-folha";
import { removerArquivos, urlDoArquivo } from "@/lib/storage";
import type { CertificadoResumo, DocumentoAssinado, TipoDocumentoAssinavel } from "@/lib/types";

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

type CertificadoAberto = {
  id: string;
  nome: string;
  documento: string | null;
  pfx: Buffer;
  senha: string;
};

/** Busca os certificados escolhidos, confere a validade e abre o cofre — na ordem dos ids. */
async function abrirCertificados(ids: string[]): Promise<{ error: string } | { certificados: CertificadoAberto[] }> {
  if (ids.length === 0) return { error: "Escolha pelo menos um certificado" };
  const { data, error } = await createAdminClient()
    .from("signing_certificates")
    .select("id, holder_name, holder_document, valid_until, pfx_encrypted, password_encrypted")
    .in("id", ids);
  if (error) return { error: erroDaTabela(error.message) };
  const linhas = (data ?? []) as (Linha & { pfx_encrypted: string; password_encrypted: string })[];
  if (linhas.length !== new Set(ids).size) return { error: "Um dos certificados não foi encontrado — recarregue a tela" };

  const vencido = linhas.find((l) => l.valid_until && new Date(l.valid_until) < new Date());
  if (vencido)
    return {
      error: `O certificado de ${vencido.holder_name} venceu em ${new Date(vencido.valid_until!).toLocaleDateString("pt-BR")}`,
    };

  try {
    const porId = new Map(linhas.map((l) => [l.id, l]));
    return {
      certificados: ids.map((id) => {
        const l = porId.get(id)!;
        return {
          id: l.id,
          nome: l.holder_name,
          documento: l.holder_document,
          pfx: decifrar(l.pfx_encrypted),
          senha: decifrar(l.password_encrypted).toString("utf8"),
        };
      }),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível abrir o certificado" };
  }
}

/**
 * Assina o PDF (em base64) com os certificados escolhidos, na ordem da lista,
 * e devolve o PDF assinado em base64. Com o `documento`, o PDF assinado fica
 * guardado no lugar do que faltava assinar (migration 123) — e uma cópia vai
 * para o arquivo, na pasta de cada certificado (124).
 */
export async function assinarComCertificados(
  pdfBase64: string,
  ids: string[],
  /** `nomes`: como cada um aparece no contrato (o certificado corta o nome em 64 letras). */
  documento?: { tipo: TipoDocumentoAssinavel; id: string; nomes?: string[]; nomeArquivo?: string }
): Promise<{ error: string } | { ok: true; pdf: string; guardado: DocumentoAssinado | null; avisoGuardar?: string }> {
  const userId = await souAdmin();
  if (!userId) return { error: "Só administradores podem assinar com certificado" };
  if (documento && (!TIPOS_ASSINAVEIS.includes(documento.tipo) || !/^[0-9a-f-]{36}$/i.test(documento.id)))
    return { error: "Documento inválido" };

  const abertos = await abrirCertificados(ids);
  if ("error" in abertos) return abertos;
  const certificados = abertos.certificados;

  let assinado: Buffer;
  try {
    assinado = await assinarPdf(Buffer.from(pdfBase64, "base64"), certificados);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível assinar o PDF" };
  }

  // guardado no sistema; se falhar, o PDF assinado ainda volta para compartilhar
  let guardado: DocumentoAssinado | null = null;
  const avisos: string[] = [];
  if (documento) {
    // o nome do contrato quando veio um para cada certificado; senão, o do certificado
    const nomes =
      documento.nomes?.length === certificados.length
        ? documento.nomes.map((n, i) => String(n).trim().slice(0, 150) || certificados[i].nome)
        : certificados.map((c) => c.nome);
    const g = await guardarAssinado(documento.tipo, documento.id, assinado, nomes, userId);
    if ("error" in g) avisos.push(g.error);
    else guardado = g.doc;

    const arq = await arquivarAssinado(
      assinado,
      nomeDoAssinado(documento.nomeArquivo || `${documento.tipo}.pdf`),
      certificados,
      documento.tipo,
      documento.id,
      userId
    );
    if ("error" in arq) avisos.push(arq.error);
    revalidatePath("/alugueis");
    revalidatePath("/assinar");
  }
  return {
    ok: true,
    pdf: assinado.toString("base64"),
    guardado,
    avisoGuardar: avisos.length ? avisos.join("; ") : undefined,
  };
}

/** "contrato.pdf" → "contrato-assinado.pdf" (sem repetir o "-assinado"). */
function nomeDoAssinado(nome: string): string {
  const base = nome.replace(/\.pdf$/i, "").replace(/-assinado$/i, "").trim() || "documento";
  return `${base.slice(0, 120)}-assinado.pdf`;
}

/**
 * ABA "ASSINAR DIGITALMENTE": assina um PDF anexado. Cada certificado pode
 * levar um carimbo no ponto da página que foi tocado na tela. O assinado vai
 * para o arquivo, na pasta de cada certificado, e volta o endereço dele.
 */
export async function assinarPdfAnexado(
  formData: FormData
): Promise<{ error: string } | { ok: true; url: string; nome: string; aviso?: string }> {
  const userId = await souAdmin();
  if (!userId) return { error: "Só administradores podem assinar com certificado" };

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { error: "Anexe o PDF para assinar" };
  if (arquivo.size > 9_000_000) return { error: "PDF grande demais (o limite é 9 MB)" };
  const pdf = Buffer.from(await arquivo.arrayBuffer());
  if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") return { error: "O arquivo anexado não é um PDF" };

  let ids: string[] = [];
  let pontos: { certId: string; pagina: number; x: number; y: number }[] = [];
  try {
    ids = JSON.parse(String(formData.get("ids") ?? "[]"));
    pontos = JSON.parse(String(formData.get("carimbos") ?? "[]"));
  } catch {
    return { error: "Pedido inválido — recarregue a tela" };
  }

  const abertos = await abrirCertificados(ids);
  if ("error" in abertos) return abertos;
  const certificados = abertos.certificados;

  try {
    const agora = new Date();
    const porId = new Map(certificados.map((c) => [c.id, c]));
    const carimbos = pontos
      .filter((p) => porId.has(p.certId) && Number.isFinite(p.pagina) && Number.isFinite(p.x) && Number.isFinite(p.y))
      .map((p) => ({
        pagina: Math.floor(p.pagina),
        x: p.x,
        y: p.y,
        linhas: carimboDoCertificado(porId.get(p.certId)!, agora),
      }));
    const preparado = await prepararPdfDeFora(pdf, carimbos);
    let assinado: Buffer;
    try {
      assinado = await assinarPdf(preparado.pdf, certificados);
    } catch {
      return {
        error:
          "Esse PDF já tem assinatura num formato em que não dá para acrescentar outra por aqui. Assine a versão sem assinatura e depois colha as outras.",
      };
    }
    const nome = nomeDoAssinado(arquivo.name || "documento.pdf");
    const arq = await arquivarAssinado(assinado, nome, certificados, "avulso", null, userId);
    if ("error" in arq) return arq;
    revalidatePath("/assinar");
    return { ok: true, url: arq.url, nome, aviso: preparado.aviso };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Não foi possível assinar o PDF" };
  }
}

export interface ItemDoArquivo {
  id: string;
  nome: string;
  url: string;
  tamanho: number | null;
  certificadoNome: string;
  certificadoDocumento: string | null;
  origem: string;
  docId: string | null;
  assinadoEm: string;
}

/** O arquivo de assinados — a tela agrupa por certificado. Só para admin. */
export async function listarArquivoAssinado(): Promise<{ itens: ItemDoArquivo[]; erro?: string }> {
  if (!(await souAdmin())) return { itens: [] };
  const { data, error } = await createAdminClient()
    .from("signed_files")
    .select("id, file_name, file_path, size_bytes, certificate_name, certificate_document, origin, doc_id, created_at")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) {
    if (/signed_files/.test(error.message)) return { itens: [], erro: "Rode a migration 124 no Supabase para ver o arquivo de assinados" };
    return { itens: [], erro: error.message };
  }
  return {
    itens: (data ?? []).map((d) => ({
      id: d.id as string,
      nome: d.file_name as string,
      url: urlDoArquivo(d.file_path as string),
      tamanho: (d.size_bytes as number | null) ?? null,
      certificadoNome: d.certificate_name as string,
      certificadoDocumento: (d.certificate_document as string | null) ?? null,
      origem: d.origin as string,
      docId: (d.doc_id as string | null) ?? null,
      assinadoEm: d.created_at as string,
    })),
  };
}

/** Tira o documento da pasta. O arquivo só some do disco quando nenhuma outra pasta o tem. */
export async function apagarDoArquivo(id: string): Promise<{ error: string } | { ok: true }> {
  if (!(await souAdmin())) return { error: "Só administradores podem apagar do arquivo" };
  const admin = createAdminClient();
  const { data, error } = await admin.from("signed_files").delete().eq("id", id).select("file_path").maybeSingle();
  if (error) return { error: error.message };
  if (data?.file_path) {
    const { count } = await admin
      .from("signed_files")
      .select("id", { count: "exact", head: true })
      .eq("file_path", data.file_path as string);
    if (!count) await removerArquivos([data.file_path as string]);
  }
  revalidatePath("/assinar");
  return { ok: true };
}

