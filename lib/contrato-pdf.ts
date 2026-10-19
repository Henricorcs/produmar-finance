// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO EM PDF — o arquivo para mandar pelo WhatsApp ou por e-mail
// ─────────────────────────────────────────────────────────────────────────────
// Sai no próprio celular, sem servidor no meio, a partir dos MESMOS parágrafos
// que a tela de impressão mostra: o que está na folha é o que vai no PDF.
// Serve aos dois contratos do módulo Aluguéis (locação e compra e venda).
//
// A biblioteca (jsPDF) só é carregada na hora de gerar. A fonte padrão do PDF
// (Times) tem acento e ç, mas não tem todo sinal tipográfico — o travessão
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
  doc.setFont("times", "bold");
  doc.setFontSize(13);
  const titulo = limpar(c.titulo);
  doc.text(titulo, meio, y, { align: "center" });
  const lt = doc.getTextWidth(titulo);
  doc.setLineWidth(0.3);
  doc.line(meio - lt / 2, y + 1, meio + lt / 2, y + 1);
  y += linha * 2;

  doc.setFontSize(fonte);

  for (const bruto of c.paragrafos) {
    if (bruto === c.marcaAssinaturas) {
      assinaturas();
      continue;
    }
    const texto = limpar(bruto);

    if (RE_DATA_LOCAL.test(texto)) {
      y += linha;
      cabe(linha * 2);
      doc.setFont("times", "bold");
      doc.text(texto, meio, y, { align: "center" });
      y += linha * 2;
      continue;
    }

    // O rótulo em negrito na primeira linha; o resto em texto normal,
    // quebrado na largura da folha.
    const achado = texto.match(c.rotulo);
    const rotulo = achado ? achado[0] : "";
    const resto = rotulo ? texto.slice(rotulo.length).trimStart() : texto;

    doc.setFont("times", "bold");
    const larguraRotulo = rotulo ? doc.getTextWidth(rotulo + " ") : 0;
    doc.setFont("times", "normal");

    const primeira: string[] = rotulo
      ? doc.splitTextToSize(resto, largura - larguraRotulo)
      : [];
    const linhas: string[] = rotulo
      ? [primeira[0] ?? "", ...doc.splitTextToSize(resto.slice((primeira[0] ?? "").length).trimStart(), largura)]
      : doc.splitTextToSize(resto, largura);

    linhas.forEach((l, i) => {
      cabe(linha);
      if (i === 0 && rotulo) {
        doc.setFont("times", "bold");
        doc.text(rotulo, margem, y);
        doc.setFont("times", "normal");
        doc.text(l, margem + larguraRotulo, y);
      } else {
        doc.text(l, margem, y);
      }
      y += linha;
    });
    y += linha * 0.6;
  }

  function assinaturas() {
    doc.setLineWidth(0.3);
    for (const a of c.assinaturas) {
      y += linha * 3;
      cabe(linha * 3);
      doc.line(meio - 45, y, meio + 45, y);
      doc.setFont("times", "bold");
      doc.setFontSize(10);
      doc.text(limpar(a.nome), meio, y + 4.5, { align: "center" });
      if (a.detalhe) {
        doc.setFont("times", "normal");
        doc.setFontSize(9);
        doc.text(limpar(a.detalhe), meio, y + 8.5, { align: "center" });
      }
      doc.setFontSize(fonte);
      y += linha * 1.5;
    }

    // As duas testemunhas, lado a lado
    y += linha * 3;
    cabe(linha * 5);
    const col = [margem, meio + 5];
    const larguraCol = largura / 2 - 5;
    doc.setFontSize(10);
    for (const x of col) {
      doc.line(x, y, x + larguraCol, y);
      doc.setFont("times", "bold");
      doc.text("Testemunha", x + larguraCol / 2, y + 4.5, { align: "center" });
      doc.setFont("times", "normal");
      doc.text("Nome: ______________________________", x, y + 10);
      doc.text("CPF: _______________________________", x, y + 15);
    }
    doc.setFontSize(fonte);
    y += linha * 4;
  }

  const blob = doc.output("blob");
  return new File([blob], c.nomeArquivo, { type: "application/pdf" });
}
