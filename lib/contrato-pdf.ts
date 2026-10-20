// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO EM PDF — o arquivo para mandar pelo WhatsApp ou por e-mail
// ─────────────────────────────────────────────────────────────────────────────
// Sai no próprio celular, sem servidor no meio, a partir dos MESMOS parágrafos
// que a tela de impressão mostra: o que está na folha é o que vai no PDF.
// Serve aos dois contratos do módulo Aluguéis (locação e compra e venda).
//
// A biblioteca (jsPDF) só é carregada na hora de gerar. A fonte padrão do PDF
// (Helvetica, a Arial do PDF) tem acento e ç, mas não tem todo sinal tipográfico — o travessão
// curto vira hífen, e o que não existir na fonte é trocado antes de escrever.
// ─────────────────────────────────────────────────────────────────────────────

export interface AssinaturaPdf {
  nome: string;
  detalhe?: string;
}

export interface ContratoParaPdf {
  titulo: string;
  /** Os parágrafos do corpo (sem o título), na ordem da folha. */
  paragrafos: string[];
  /** A marca do parágrafo que vira o bloco de assinaturas. */
  marcaAssinaturas: string;
  /** O rótulo em negrito no começo do parágrafo ("CLÁUSULA PRIMEIRA:"). */
  rotulo: RegExp;
  assinaturas: AssinaturaPdf[];
  nomeArquivo: string;
  /** As duas testemunhas no fim (padrão: sim). A procuração não tem. */
  testemunhas?: boolean;
  /**
   * "Assinado digitalmente por..." no espaço acima da linha de quem assinou
   * com certificado — um item por linha de assinatura, na mesma ordem.
   */
  carimbos?: (string[] | null | undefined)[];
}

/** "João da Silva" → "joao-da-silva" (para o nome do arquivo). */
export function paraNomeDeArquivo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * A FONTE: Arial. O jsPDF traz embutidas só Times, Helvetica e Courier — e a
 * Helvetica tem as mesmas medidas da Arial (é a Arial que o leitor de PDF
 * mostra no lugar dela). Embutir o arquivo da Arial deixaria cada PDF centenas
 * de KB maior, para o mesmo desenho na folha.
 */
const FONTE = "helvetica";

/** Troca o que a fonte padrão do PDF não sabe desenhar. */
function limpar(texto: string): string {
  return texto
    .replace(/[–—−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x00-\xFF]/g, "");
}

/** A linha "Cidade, 19 de outubro de 2026." — sai centralizada, como na folha. */
const RE_DATA_LOCAL = /^[^:]{3,60},\s*(\d{1,2}\s+de\s+\p{L}+\s+de\s+\d{4}|_+ de _+ de _+)\.?$/u;

export async function gerarContratoPdf(c: ContratoParaPdf): Promise<File> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const larguraPagina = doc.internal.pageSize.getWidth();
  const alturaPagina = doc.internal.pageSize.getHeight();
  const margem = 20;
  const largura = larguraPagina - margem * 2;
  const meio = larguraPagina / 2;
  const fonte = 11;
  const linha = 5.2;
  let y = margem;

  function cabe(altura: number) {
    if (y + altura > alturaPagina - margem) {
      doc.addPage();
      y = margem;
    }
  }

  // ── Título ────────────────────────────────────────────────────────────────
  doc.setFont(FONTE, "bold");
  doc.setFontSize(13);
  const titulo = limpar(c.titulo);
  doc.text(titulo, meio, y, { align: "center" });
  const lt = doc.getTextWidth(titulo);
  doc.setLineWidth(0.3);
  doc.line(meio - lt / 2, y + 1, meio + lt / 2, y + 1);
  y += linha * 2;

  doc.setFontSize(fonte);

  /**
   * ESPAÇO PARA A ASSINATURA DIGITAL DO GOV.BR: o carimbo que o assinador
   * coloca no PDF ocupa uns 3 cm de altura — sobre uma linha apertada ele
   * cobriria o texto. Cada assinatura tem 3,5 cm livres acima da linha.
   */
  const espacoAssinatura = 35;
  const larguraAssinatura = 110;
  /** A altura do bloco de assinaturas: ele não se parte entre duas páginas. */
  const comTestemunhas = c.testemunhas !== false;
  const alturaAssinaturas =
    c.assinaturas.length * (espacoAssinatura + 10) + (comTestemunhas ? espacoAssinatura + 20 : 0);

  for (const [i, bruto] of c.paragrafos.entries()) {
    if (bruto === c.marcaAssinaturas) {
      assinaturas();
      continue;
    }
    const texto = limpar(bruto);

    if (RE_DATA_LOCAL.test(texto)) {
      y += linha;
      // "Cidade, data" fica na mesma página das assinaturas que vêm logo depois
      cabe(linha * 2 + (c.paragrafos[i + 1] === c.marcaAssinaturas ? alturaAssinaturas : 0));
      doc.setFont(FONTE, "bold");
      doc.text(texto, meio, y, { align: "center" });
      y += linha * 2;
      continue;
    }

    // O rótulo em negrito na primeira linha; o resto em texto normal,
    // quebrado na largura da folha.
    const achado = texto.match(c.rotulo);
    const rotulo = achado ? achado[0] : "";
    const resto = rotulo ? texto.slice(rotulo.length).trimStart() : texto;

    doc.setFont(FONTE, "bold");
    const larguraRotulo = rotulo ? doc.getTextWidth(rotulo + " ") : 0;
    doc.setFont(FONTE, "normal");

    const primeira: string[] = rotulo
      ? doc.splitTextToSize(resto, largura - larguraRotulo)
      : [];
    // coube tudo na primeira linha: sem o resto, que viraria uma linha em branco
    const depois = rotulo ? resto.slice((primeira[0] ?? "").length).trimStart() : "";
    const linhas: string[] = rotulo
      ? [primeira[0] ?? "", ...(depois ? doc.splitTextToSize(depois, largura) : [])]
      : doc.splitTextToSize(resto, largura);

    linhas.forEach((l, i) => {
      cabe(linha);
      if (i === 0 && rotulo) {
        doc.setFont(FONTE, "bold");
        doc.text(rotulo, margem, y);
        doc.setFont(FONTE, "normal");
        doc.text(l, margem + larguraRotulo, y);
      } else {
        doc.text(l, margem, y);
      }
      y += linha;
    });
    y += linha * 0.6;
  }

  /** O carimbo da assinatura com certificado: um quadro logo acima da linha. */
  function carimbar(linhas: string[], linhaY: number) {
    const altura = 4 + linhas.length * 4;
    const topo = linhaY - altura - 2;
    const largura = larguraAssinatura - 10;
    doc.setDrawColor(30, 90, 160);
    doc.setLineWidth(0.4);
    doc.roundedRect(meio - largura / 2, topo, largura, altura, 1.5, 1.5);
    doc.setTextColor(30, 90, 160);
    linhas.forEach((t, j) => {
      doc.setFont(FONTE, j === 1 ? "bold" : "normal");
      doc.setFontSize(j === 1 ? 9 : 8);
      doc.text(limpar(t), meio, topo + 5 + j * 4, { align: "center", maxWidth: largura - 4 });
    });
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
  }

  function assinaturas() {
    cabe(alturaAssinaturas);
    doc.setLineWidth(0.3);
    for (const [i, a] of c.assinaturas.entries()) {
      y += espacoAssinatura;
      const carimbo = c.carimbos?.[i];
      if (carimbo?.length) carimbar(carimbo, y);
      doc.line(meio - larguraAssinatura / 2, y, meio + larguraAssinatura / 2, y);
      doc.setFont(FONTE, "bold");
      doc.setFontSize(10);
      doc.text(limpar(a.nome), meio, y + 4.5, { align: "center" });
      if (a.detalhe) {
        doc.setFont(FONTE, "normal");
        doc.setFontSize(9);
        doc.text(limpar(a.detalhe), meio, y + 8.5, { align: "center" });
      }
      doc.setFontSize(fonte);
      y += 10;
    }
    if (!comTestemunhas) return;

    // As duas testemunhas, lado a lado — também com espaço para o gov.br
    y += espacoAssinatura;
    const col = [margem, meio + 5];
    const larguraCol = largura / 2 - 5;
    doc.setFontSize(10);
    for (const x of col) {
      doc.line(x, y, x + larguraCol, y);
      doc.setFont(FONTE, "bold");
      doc.text("Testemunha", x + larguraCol / 2, y + 4.5, { align: "center" });
      doc.setFont(FONTE, "normal");
      doc.text("Nome: ______________________________", x, y + 10);
      doc.text("CPF: _______________________________", x, y + 15);
    }
    doc.setFontSize(fonte);
    y += linha * 4;
  }

  const blob = doc.output("blob");
  return new File([blob], c.nomeArquivo, { type: "application/pdf" });
}
