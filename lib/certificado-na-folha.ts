// ─────────────────────────────────────────────────────────────────────────────
// QUAL LINHA DE ASSINATURA É DE QUAL CERTIFICADO — e o carimbo que vai nela
// ─────────────────────────────────────────────────────────────────────────────
// A assinatura digital vai dentro do arquivo e não aparece na folha. Para quem
// lê o PDF saber que está assinado, o espaço acima da linha de quem assinou
// ganha o carimbo "Assinado digitalmente por...". A linha é achada pelo CPF/CNPJ
// (quando está embaixo dela) ou pelo nome do titular.
// ─────────────────────────────────────────────────────────────────────────────

import type { CertificadoResumo } from "./types";

function semAcento(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Índice da linha de assinatura deste certificado; -1 se ele não é de ninguém da folha. */
export function linhaDoCertificado(
  assinaturas: { nome: string; detalhe?: string }[],
  cert: Pick<CertificadoResumo, "nome" | "documento">
): number {
  const doc = cert.documento?.replace(/\D/g, "") ?? "";
  const nome = semAcento(cert.nome);
  // 1º pelo CPF/CNPJ embaixo da linha
  if (doc) {
    const i = assinaturas.findIndex((a) => `${a.nome} ${a.detalhe ?? ""}`.replace(/\D/g, "").includes(doc));
    if (i >= 0) return i;
  }
  // 2º pelo nome: o da linha, ou quem assina por ela ("por NILMA PEREIRA DA COSTA")
  if (nome.length >= 5) {
    return assinaturas.findIndex((a) => semAcento(`${a.nome} ${a.detalhe ?? ""}`).includes(nome));
  }
  return -1;
}

/**
 * O nome que vai no carimbo. O certificado guarda o nome com no máximo 64
 * letras e sem acento ("...MULTIMIDIA LTD"); quando a linha escolhida é do
 * próprio titular, vale o nome completo do contrato ("...MULTIMIDIA LTDA").
 */
export function nomeNoCarimbo(cert: Pick<CertificadoResumo, "nome">, nomeDaLinha?: string | null): string {
  if (nomeDaLinha && semAcento(nomeDaLinha).startsWith(semAcento(cert.nome))) return nomeDaLinha;
  return cert.nome;
}

/** As linhas do carimbo que vai acima da assinatura. */
export function carimboDoCertificado(
  cert: Pick<CertificadoResumo, "nome" | "documento">,
  quando = new Date(),
  nomeDaLinha?: string | null
): string[] {
  const doc = cert.documento?.replace(/\D/g, "") ?? "";
  const docFormatado =
    doc.length === 11
      ? `CPF ${doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}`
      : doc.length === 14
        ? `CNPJ ${doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")}`
        : "";
  const data = quando.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Fortaleza",
  });
  return [
    "Documento assinado digitalmente",
    nomeNoCarimbo(cert, nomeDaLinha),
    `${docFormatado ? `${docFormatado} · ` : ""}${data} · Certificado ICP-Brasil`,
  ];
}
