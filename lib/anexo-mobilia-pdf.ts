import type { AnexoMontado, Trecho } from "./anexo-mobilia";

// ─────────────────────────────────────────────────────────────────────────────
// O ANEXO DE MOBÍLIA EM PDF — a mesma folha da impressão, para mandar pelo
// WhatsApp ou e-mail (o "Compartilhar" do iPhone). Sai no próprio celular, sem
// servidor no meio. A fonte padrão do PDF (Helvetica, a Arial do PDF) tem
// acento e ç; o que ela não sabe desenhar é trocado antes.
// ─────────────────────────────────────────────────────────────────────────────

function limpar(t: string): string {
  return t
    .replace(/[–—−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x00-\xFF]/g, "");
}

export async function gerarAnexoMobiliaPdf(a: AnexoMontado): Promise<File> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const larguraPagina = doc.internal.pageSize.getWidth();
  const alturaPagina = doc.internal.pageSize.getHeight();
  const margem = 18;
  const direita = larguraPagina - margem;
  const largura = direita - margem;
  const meio = larguraPagina / 2;
  const fonte = 10.5;
  const linha = 4.8;
  let y = margem + 2;

  /** A moldura da página, como no modelo do Word. */
  function moldura() {
    doc.setLineWidth(0.4);
    doc.rect(9, 9, larguraPagina - 18, alturaPagina - 18);
  }
  moldura();

  function cabe(altura: number) {
    if (y + altura > alturaPagina - margem) {
      doc.addPage();
      moldura();
      y = margem + 2;
    }
  }

  /**
   * Um parágrafo com pedaços em negrito no meio (o nome do locatário, o
   * KITNET): quebra palavra por palavra, medindo cada uma na fonte dela.
   */
  function paragrafoRico(trechos: Trecho[], x = margem, w = largura) {
    type Palavra = { t: string; b: boolean; espaco: boolean };
    const palavras: Palavra[] = [];
    for (const tr of trechos) {
      const partes = limpar(tr.texto).split(/(\s+)/);
      for (const p of partes) {
        if (!p) continue;
        if (/^\s+$/.test(p)) {
          if (palavras.length) palavras[palavras.length - 1].espaco = true;
          continue;
        }
        palavras.push({ t: p, b: !!tr.negrito, espaco: false });
      }
    }
    const medir = (p: Palavra) => {
      doc.setFont("helvetica", p.b ? "bold" : "normal");
      return doc.getTextWidth(p.t);
    };
    doc.setFont("helvetica", "normal");
    const espaco = doc.getTextWidth(" ");

    let linhaAtual: Palavra[] = [];
    let larguraAtual = 0;
    const escrever = () => {
      cabe(linha);
      let cx = x;
      for (const p of linhaAtual) {
        doc.setFont("helvetica", p.b ? "bold" : "normal");
        doc.text(p.t, cx, y);
        cx += doc.getTextWidth(p.t) + (p.espaco ? espaco : 0);
      }
      y += linha;
      linhaAtual = [];
      larguraAtual = 0;
    };
    for (const p of palavras) {
      const lp = medir(p);
      if (linhaAtual.length && larguraAtual + lp > w) escrever();
      linhaAtual.push(p);
      larguraAtual += lp + (p.espaco ? espaco : 0);
    }
    if (linhaAtual.length) escrever();
    y += linha * 0.5;
  }

  // ── Título ────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(limpar(a.titulo), meio, y, { align: "center" });
  y += linha * 2;
  doc.setFontSize(fonte);

  // ── Imóvel, locador e locatário ──────────────────────────────────────────
  for (const p of a.partes) paragrafoRico(p);
  paragrafoRico([{ texto: a.recebimento }]);
  y += linha * 0.3;

  // ── A mobília, por cômodo ─────────────────────────────────────────────────
  const colunaEstado = margem + largura * 0.62;
  const colunaRs = direita - 26;
  const larguraItem = colunaEstado - margem - 8;
  for (const c of a.comodos) {
    cabe(linha * 2);
    doc.setFont("helvetica", "bold");
    doc.text(limpar(c.titulo), margem, y);
    y += linha;
    doc.setFont("helvetica", "normal");
    for (const item of c.itens) {
      const linhas: string[] = doc.splitTextToSize(limpar(item.texto), larguraItem);
      cabe(linha * linhas.length);
      doc.setFont("helvetica", "normal");
      linhas.forEach((l, i) => doc.text(l, margem + 4, y + i * linha));
      if (item.estado) doc.text(limpar(item.estado), colunaEstado, y);
      if (item.valor) {
        const [rs, ...resto] = item.valor.split(" ");
        doc.text(rs, colunaRs, y);
        doc.text(resto.join(" "), direita, y, { align: "right" });
      }
      y += linha * linhas.length;
    }
    y += linha * 0.4;
  }

  // ── Observações ───────────────────────────────────────────────────────────
  if (a.observacoes) {
    cabe(linha * 3);
    doc.setFont("helvetica", "bold");
    doc.text("Observações Gerais:", margem, y);
    y += linha;
    doc.setFont("helvetica", "normal");
    paragrafoRico([{ texto: a.observacoes }]);
  }

  // ── Local, data e assinaturas (juntos, na mesma página) ──────────────────
  const espacoAssinatura = 16;
  const alturaFim = linha * 3 + a.assinaturas.length * (espacoAssinatura + 9);
  y += linha;
  cabe(alturaFim);
  doc.setFont("helvetica", "bold");
  doc.text(limpar(a.localEData), meio, y, { align: "center" });
  y += linha;

  const larguraAssinatura = 110;
  doc.setLineWidth(0.3);
  for (const s of a.assinaturas) {
    y += espacoAssinatura;
    doc.line(meio - larguraAssinatura / 2, y, meio + larguraAssinatura / 2, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(limpar(s.nome), meio, y + 4.5, { align: "center" });
    if (s.detalhe) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(limpar(s.detalhe), meio, y + 8.5, { align: "center" });
    }
    doc.setFontSize(fonte);
    y += 9;
  }

  const blob = doc.output("blob");
  return new File([blob], a.nomeArquivo, { type: "application/pdf" });
}
