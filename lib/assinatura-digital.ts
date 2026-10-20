// ─────────────────────────────────────────────────────────────────────────────
// ASSINATURA DIGITAL COM CERTIFICADO A1 (ICP-Brasil) — só no servidor
// ─────────────────────────────────────────────────────────────────────────────
// O certificado A1 é um arquivo (.pfx/.p12) protegido por senha. Ele é enviado
// uma vez na tela de Configurações e fica guardado CIFRADO no banco (arquivo e
// senha), numa tabela que só o servidor lê. Na hora de assinar, o servidor
// decifra, assina o PDF e devolve — o arquivo e a senha nunca vão ao celular.
//
// A assinatura vai DENTRO do PDF (PKCS#7, como a do Adobe e a do assinador do
// gov.br), em "atualização incremental": o PDF original fica intacto e cada
// assinatura se soma às anteriores. Por isso dá para assinar com dois
// certificados e, depois, a outra parte ainda assinar pelo gov.br.
//
// A CHAVE que cifra os certificados sai da variável CERTIFICADOS_CHAVE do
// servidor; sem ela, da SUPABASE_SERVICE_ROLE_KEY. Se a chave mudar (ex.: o
// banco sair do Supabase), os certificados guardados não abrem mais — é só
// enviá-los de novo.
// ─────────────────────────────────────────────────────────────────────────────

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import forge from "node-forge";
import { SignPdf } from "@signpdf/signpdf";
import { P12Signer } from "@signpdf/signer-p12";
import { plainAddPlaceholder } from "@signpdf/placeholder-plain";

export interface DadosDoCertificado {
  /** O nome do titular, sem o CPF/CNPJ que vem grudado no CN ("FULANO:12345678900"). */
  nome: string;
  /** Só os dígitos do CPF ou CNPJ, quando o certificado traz. */
  documento: string | null;
  validoDe: string;
  validoAte: string;
  emissor: string;
}

/** Texto do certificado: o forge entrega UTF-8 como bytes soltos. */
function texto(v: unknown): string {
  const s = String(v ?? "");
  try {
    return forge.util.decodeUtf8(s);
  } catch {
    return s;
  }
}

/**
 * Abre o .pfx com a senha e lê de quem ele é. Senha errada ou arquivo que não
 * é certificado viram uma mensagem que diz o que fazer.
 */
export function lerCertificado(pfx: Buffer, senha: string): DadosDoCertificado {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString("binary")));
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/password|mac|decrypt|invalid/i.test(msg)) throw new Error("Senha do certificado errada");
    throw new Error("O arquivo não é um certificado A1 (.pfx ou .p12)");
  }

  const chaves = [
    ...(p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ];
  if (!chaves.some((b) => b.key)) throw new Error("O arquivo não traz a chave para assinar — exporte o certificado COM a chave privada");

  const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])
    .map((b) => b.cert)
    .filter((c): c is forge.pki.Certificate => !!c);
  // o do titular é o que não assina outros certificados (não é de autoridade)
  const cert =
    certs.find((c) => {
      const bc = c.getExtension("basicConstraints") as { cA?: boolean } | null;
      return !bc?.cA;
    }) ?? certs[0];
  if (!cert) throw new Error("O arquivo não traz o certificado");

  const cn = texto(cert.subject.getField("CN")?.value);
  // ICP-Brasil: "NOME DO TITULAR:12345678900" (e-CPF) ou "RAZÃO SOCIAL:12345678000199" (e-CNPJ)
  const [nome, doc] = cn.includes(":") ? [cn.slice(0, cn.lastIndexOf(":")), cn.slice(cn.lastIndexOf(":") + 1)] : [cn, ""];
  const digitos = doc.replace(/\D/g, "");

  return {
    nome: nome.trim() || cn,
    documento: digitos.length === 11 || digitos.length === 14 ? digitos : null,
    validoDe: cert.validity.notBefore.toISOString(),
    validoAte: cert.validity.notAfter.toISOString(),
    emissor: texto(cert.issuer.getField("CN")?.value) || "—",
  };
}

// ── Cofre: AES-256-GCM ──────────────────────────────────────────────────────

function chaveDoCofre(): Buffer {
  const segredo = process.env.CERTIFICADOS_CHAVE || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!segredo) throw new Error("Falta a variável CERTIFICADOS_CHAVE no servidor");
  return createHash("sha256").update(`produmar-certificados:${segredo}`).digest();
}

/** "iv.tag.cifrado", em base64 — o formato guardado no banco. */
export function cifrar(dados: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chaveDoCofre(), iv);
  const cifrado = Buffer.concat([c.update(dados), c.final()]);
  return [iv, c.getAuthTag(), cifrado].map((b) => b.toString("base64")).join(".");
}

export function decifrar(guardado: string): Buffer {
  const [iv, tag, cifrado] = guardado.split(".").map((p) => Buffer.from(p, "base64"));
  try {
    const d = createDecipheriv("aes-256-gcm", chaveDoCofre(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(cifrado), d.final()]);
  } catch {
    throw new Error("Não foi possível abrir o certificado guardado — envie o arquivo de novo em Configurações");
  }
}

// ── Assinar ─────────────────────────────────────────────────────────────────

export interface CertificadoParaAssinar {
  pfx: Buffer;
  senha: string;
  nome: string;
}

/**
 * Assina o PDF com cada certificado, um depois do outro. Cada assinatura entra
 * como uma revisão a mais do arquivo — as anteriores continuam valendo.
 */
export async function assinarPdf(
  pdf: Buffer,
  certificados: CertificadoParaAssinar[],
  local = "São Mateus do Maranhão/MA"
): Promise<Buffer> {
  const signer = new SignPdf();
  let atual = pdf;
  for (const c of certificados) {
    const comEspaco = plainAddPlaceholder({
      pdfBuffer: atual,
      reason: "Assinatura digital com certificado ICP-Brasil",
      contactInfo: "",
      name: c.nome,
      location: local,
      // a cadeia ICP-Brasil (titular + autoridades) passa fácil de 8 KB
      signatureLength: 16384,
      appName: "PRODUMAR",
    });
    atual = Buffer.from(await signer.sign(comEspaco, new P12Signer(c.pfx, { passphrase: c.senha })));
  }
  return atual;
}
