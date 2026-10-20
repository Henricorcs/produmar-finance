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
import { Signer } from "@signpdf/utils";
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

// ── PDF de fora (aba "Assinar digitalmente") ────────────────────────────────

/** Onde vai um carimbo: página (1ª = 1) e o ponto tocado, de 0 a 1 a partir do canto de cima à esquerda. */
export interface CarimboNoPdf {
  pagina: number;
  x: number;
  y: number;
  linhas: string[];
}

/** O PDF já traz alguma assinatura digital (gov.br, Adobe, outra nossa)? */
export function jaTemAssinatura(pdf: Buffer): boolean {
  return /\/ByteRange\s*\[/.test(pdf.toString("latin1"));
}

/** A fonte padrão do PDF só tem o alfabeto latino: troca o que ela não desenha. */
function paraWinAnsi(t: string): string {
  return t
    .replace(/[–—−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

/**
 * Prepara um PDF que veio de fora para ser assinado: desenha os carimbos
 * "Assinado digitalmente" nos pontos escolhidos e regrava o arquivo no formato
 * clássico, o único em que a assinatura entra sem reescrever o documento.
 *
 * PDF que JÁ TEM assinatura não é regravado — isso a invalidaria. Ele segue
 * como está (sem carimbo desenhado) e a nossa assinatura entra por cima, se o
 * formato deixar.
 */
export async function prepararPdfDeFora(
  pdf: Buffer,
  carimbos: CarimboNoPdf[]
): Promise<{ pdf: Buffer; aviso?: string }> {
  if (jaTemAssinatura(pdf)) {
    return {
      pdf,
      aviso: carimbos.length
        ? "O PDF já tinha assinatura: para não invalidá-la, o carimbo não foi desenhado na folha (a assinatura digital entrou normalmente)."
        : undefined,
    };
  }

  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  let doc;
  try {
    doc = await PDFDocument.load(pdf);
  } catch {
    throw new Error("Não foi possível abrir esse PDF — ele pode estar protegido por senha ou danificado");
  }
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const azul = rgb(30 / 255, 90 / 255, 160 / 255);
  const paginas = doc.getPages();

  for (const c of carimbos) {
    const pagina = paginas[c.pagina - 1];
    if (!pagina) continue;
    const caixa = pagina.getCropBox();
    // o ponto tocado é o MEIO do carimbo
    const cx = caixa.x + Math.min(Math.max(c.x, 0), 1) * caixa.width;
    const cy = caixa.y + (1 - Math.min(Math.max(c.y, 0), 1)) * caixa.height;
    const linhas = c.linhas.map(paraWinAnsi);
    const passo = 10;
    const topo = cy + ((linhas.length - 1) * passo) / 2;
    linhas.forEach((t, j) => {
      const fonte = j === 1 ? negrito : normal;
      const tam = j === 1 ? 9 : 7.5;
      const largura = fonte.widthOfTextAtSize(t, tam);
      pagina.drawText(t, { x: cx - largura / 2, y: topo - j * passo, size: tam, font: fonte, color: azul });
    });
  }

  // formato clássico (sem "object streams"): a assinatura entra como acréscimo
  return { pdf: Buffer.from(await doc.save({ useObjectStreams: false })) };
}

// ── O assinador ─────────────────────────────────────────────────────────────

/**
 * O P12Signer do @signpdf, com UMA correção: o nome do EMISSOR que identifica
 * quem assinou é copiado byte a byte do certificado.
 *
 * O node-forge regrava esse nome a partir do texto que leu — e com acento ele
 * codifica duas vezes ("Ç" vira "Ã‡"). Aí o validador procura um emissor que
 * não existe e acusa "certificado de quem assinou não encontrado". Testado:
 * emissor "SERVIÇOS" quebrava; com a cópia, passa. (Também aceita a chave
 * guardada sem cifra no .pfx, que o original recusava.)
 */
class AssinadorA1 extends Signer {
  constructor(
    private pfx: Buffer,
    private senha: string
  ) {
    super();
  }

  async sign(pdfBuffer: Buffer, signingTime?: Date): Promise<Buffer> {
    const p12 = forge.pkcs12.pkcs12FromAsn1(
      forge.asn1.fromDer(forge.util.createBuffer(this.pfx.toString("binary"))),
      false,
      this.senha
    );
    const certs = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])
      .map((b) => b.cert)
      .filter((c): c is forge.pki.Certificate => !!c);
    const chave = (
      p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ??
      p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0]
    )?.key as forge.pki.rsa.PrivateKey | undefined;
    if (!chave) throw new Error("O certificado não traz a chave para assinar");

    const p7 = forge.pkcs7.createSignedData();
    p7.content = forge.util.createBuffer(pdfBuffer.toString("binary"));
    let certificado: forge.pki.Certificate | undefined;
    for (const c of certs) {
      p7.addCertificate(c);
      const pub = c.publicKey as forge.pki.rsa.PublicKey;
      if (chave.n.compareTo(pub.n) === 0 && chave.e.compareTo(pub.e) === 0) certificado = c;
    }
    if (!certificado) throw new Error("O certificado não corresponde à chave dele");

    p7.addSigner({
      key: chave,
      certificate: certificado,
      digestAlgorithm: forge.pki.oids.sha256,
      // a ordem conta para a validação europeia (igual ao P12Signer)
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.signingTime, value: (signingTime ?? new Date()) as unknown as string },
        { type: forge.pki.oids.messageDigest },
      ],
    });
    p7.sign({ detached: true });

    // a correção: o emissor do SignerInfo = o emissor original do certificado
    const asn1 = p7.toAsn1();
    const tbs = (certificado as unknown as { tbsCertificate?: forge.asn1.Asn1 }).tbsCertificate;
    const camposTbs = tbs?.value as forge.asn1.Asn1[] | undefined;
    if (camposTbs) {
      // com o campo "versão" ([0]) na frente, o emissor é o 4º; sem ele, o 3º
      const comVersao = camposTbs[0].tagClass === forge.asn1.Class.CONTEXT_SPECIFIC;
      const emissor = camposTbs[comVersao ? 3 : 2];
      const signedData = ((asn1.value as forge.asn1.Asn1[])[1].value as forge.asn1.Asn1[])[0];
      const camposSd = signedData.value as forge.asn1.Asn1[];
      const signerInfo = (camposSd[camposSd.length - 1].value as forge.asn1.Asn1[])[0];
      const emissorESerie = (signerInfo.value as forge.asn1.Asn1[])[1];
      (emissorESerie.value as forge.asn1.Asn1[])[0] = emissor;
    }
    return Buffer.from(forge.asn1.toDer(asn1).getBytes(), "binary");
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
    atual = Buffer.from(await signer.sign(comEspaco, new AssinadorA1(c.pfx, c.senha)));
  }
  return atual;
}
