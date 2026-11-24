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

/**
 * `carimbos`: o texto "Assinado digitalmente…" de cada linha de assinatura
 * (na ordem: locador, locatário), quando vier do Assinar com certificado.
 */
export async function gerarAnexoMobiliaPdf(a: AnexoMontado, carimbos?: (string[] | null)[]): Promise<File> {
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
  const larguraAssinatura = 110;

  /** As linhas do carimbo já quebradas na largura (a 2ª, o nome, em negrito). */
  function linhasDoCarimbo(texto: string[] | null | undefined) {
    if (!texto?.length) return [];
    return texto.flatMap((t, j) => {
      doc.setFont("helvetica", j === 1 ? "bold" : "normal");
      doc.setFontSize(j === 1 ? 9 : 8);
      return (doc.splitTextToSize(limpar(t), larguraAssinatura + 26) as string[]).map((l) => ({ l, j }));
    });
  }
  const carimbados = a.assinaturas.map((_, i) => linhasDoCarimbo(carimbos?.[i]));
  doc.setFontSize(fonte);

  // sem carimbo, 1,6 cm para a caneta; com carimbo, o espaço que ele pede
  const espacoDe = (i: number) => (carimbados[i].length ? Math.max(16, 6 + carimbados[i].length * 4) : 16);
  const alturaFim = linha * 3 + a.assinaturas.reduce((t, _, i) => t + espacoDe(i) + 9, 0);
  y += linha;
  cabe(alturaFim);
  doc.setFont("helvetica", "bold");
  doc.text(limpar(a.localEData), meio, y, { align: "center" });
  y += linha;

  doc.setLineWidth(0.3);
  for (const [i, s] of a.assinaturas.entries()) {
    y += espacoDe(i);
    const carimbo = carimbados[i];
    if (carimbo.length) {
      // o texto em azul logo acima da linha, como nos contratos
      const topo = y - carimbo.length * 4 - 1;
      doc.setTextColor(30, 90, 160);
      carimbo.forEach(({ l, j }, k) => {
        doc.setFont("helvetica", j === 1 ? "bold" : "normal");
        doc.setFontSize(j === 1 ? 9 : 8);
        doc.text(l, meio, topo + 3 + k * 4, { align: "center" });
      });
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(fonte);
    }
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
