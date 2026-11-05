import { contaDoLote, encaixar, formatarHectares, formatarM2, posicaoDoNumero, posicaoDoRotulo } from "./medicao-lote";
import { formatarMetros, type PontoGps } from "./medir-cerca";

// ─────────────────────────────────────────────────────────────────────────────
// A MEDIÇÃO EM PDF — uma folha A4 com o mapa do lote (norte para cima, cantos
// numerados, a medida de cada lado e a escala), a área em m² e hectares, o
// perímetro e a tabela dos cantos com as coordenadas do GPS.
//
// Sai no próprio celular: quem mede está no terreno e manda dali mesmo. A
// fonte padrão do PDF (Helvetica) só tem o alfabeto latino — ², ± e º saem,
// seta não; por isso o texto daqui evita outros símbolos.
// ─────────────────────────────────────────────────────────────────────────────

export interface MedicaoParaPdf {
  nome: string;
  local: string | null;
  observacao: string | null;
  pontos: PontoGps[];
  /** Quando foi medida (ISO). */
  data: string;
}

export function nomeDoArquivo(m: MedicaoParaPdf): string {
  const slug = m.nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `medicao-${slug || "lote"}.pdf`;
}

const precisao = (m: number) => `± ${m.toFixed(1).replace(".", ",")} m`;

export async function gerarMedicaoPdf(m: MedicaoParaPdf): Promise<File> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);

  const conta = contaDoLote(m.pontos);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();
  const margem = 14;
  const util = largura - 2 * margem;
  let y = margem + 4;

  // ── Cabeçalho ────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(77, 124, 15);
  doc.text("MEDIÇÃO DE LOTE PELO GPS", margem, y, { charSpace: 0.6 });
  y += 7;
  doc.setFontSize(17);
  doc.setTextColor(15, 23, 42);
  doc.text(doc.splitTextToSize(m.nome, util) as string[], margem, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  const quando = new Date(m.data).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  doc.text([m.local, `Medido em ${quando}`].filter(Boolean).join("  ·  "), margem, y);
  y += 6;

  // ── Os números ───────────────────────────────────────────────────────────
  const caixa = 22;
  doc.setDrawColor(190, 220, 140);
  doc.setFillColor(247, 254, 231);
  doc.roundedRect(margem, y, util, caixa, 2, 2, "FD");
  const colunas = [
    { titulo: "ÁREA", valor: conta.fechado ? formatarM2(conta.areaM2) : "-" },
    { titulo: "HECTARES", valor: conta.fechado ? formatarHectares(conta.areaM2) : "-" },
    { titulo: "PERÍMETRO", valor: conta.fechado ? formatarMetros(conta.perimetro) : "-" },
    { titulo: "CANTOS", valor: String(m.pontos.length) },
  ];
  const larguraColuna = util / colunas.length;
  colunas.forEach((c, i) => {
    const cx = margem + larguraColuna * i + larguraColuna / 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(77, 124, 15);
    doc.text(c.titulo, cx, y + 7, { align: "center" });
    doc.setFontSize(i < 2 ? 13 : 12);
    doc.setTextColor(15, 23, 42);
    doc.text(c.valor, cx, y + 14.5, { align: "center" });
  });
  if (conta.fechado) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`margem do GPS: ± ${formatarM2(conta.margemM2)}`, margem + larguraColuna, y + 19.5, { align: "center" });
  }
  y += caixa + 5;

  // ── O mapa ───────────────────────────────────────────────────────────────
  const alturaMapa = 112;
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(250, 252, 245);
  doc.roundedRect(margem, y, util, alturaMapa, 2, 2, "FD");
  const d = encaixar(conta.xy, util, alturaMapa, 16);
  const cantos = d.cantos.map((p) => ({ x: margem + p.x, y: y + p.y }));
  const n = cantos.length;

  if (n >= 2) {
    const deltas = cantos.slice(1).map((p, i) => [p.x - cantos[i].x, p.y - cantos[i].y]);
    doc.setDrawColor(77, 124, 15);
    doc.setLineWidth(0.6);
    if (n >= 3) {
      doc.setFillColor(217, 249, 157);
      doc.lines(deltas, cantos[0].x, cantos[0].y, [1, 1], "FD", true);
    } else {
      doc.lines(deltas, cantos[0].x, cantos[0].y, [1, 1], "S", false);
    }
    // lado que cruza outro: em vermelho
    doc.setDrawColor(220, 38, 38);
    for (const lado of new Set(conta.cruzamentos.flat())) {
      const a = cantos[lado - 1];
      const b = cantos[lado % n];
      doc.line(a.x, a.y, b.x, b.y);
    }
    // a medida de cada lado, do lado de fora
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    conta.lados.forEach((metros, i) => {
      if (n === 2 && i > 0) return;
      const texto = formatarMetros(metros);
      const pos = posicaoDoRotulo(cantos, i, 3, doc.getTextWidth(texto) / 2);
      doc.text(texto, pos.x, pos.y, { align: "center", baseline: "middle" });
    });
  }
  // os cantos numerados
  cantos.forEach((p, i) => {
    doc.setLineWidth(0.4);
    doc.setDrawColor(63, 98, 18);
    doc.setFillColor(255, 255, 255);
    doc.circle(p.x, p.y, 1, "FD");
    const pos = n >= 2 ? posicaoDoNumero(cantos, i, 4.5) : { x: p.x, y: p.y - 4.5 };
    doc.setFillColor(77, 124, 15);
    doc.circle(pos.x, pos.y, 2.6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text(String(i + 1), pos.x, pos.y, { align: "center", baseline: "middle" });
  });
  // o norte
  const nx = margem + util - 8;
  const ny = y + 6;
  doc.setFillColor(51, 65, 85);
  doc.triangle(nx, ny, nx - 2.2, ny + 6, nx + 2.2, ny + 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text("N", nx, ny + 10, { align: "center" });
  // a escala
  if (n >= 2 && d.barra.comprimento > 0) {
    const ex = margem + 6;
    const ey = y + alturaMapa - 6;
    doc.setDrawColor(51, 65, 85);
    doc.setLineWidth(0.5);
    doc.line(ex, ey, ex + d.barra.comprimento, ey);
    doc.line(ex, ey - 1.2, ex, ey + 1.2);
    doc.line(ex + d.barra.comprimento, ey - 1.2, ex + d.barra.comprimento, ey + 1.2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(`${d.barra.metros.toLocaleString("pt-BR")} m`, ex + d.barra.comprimento + 2, ey, { baseline: "middle" });
  }
  y += alturaMapa + 4;

  if (conta.cruzamentos.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(220, 38, 38);
    doc.text("Atenção: os lados se cruzam (em vermelho) - a área desta medição não vale.", margem, y + 2);
    y += 6;
  }

  // ── Os cantos ────────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: y,
    margin: { left: margem, right: margem },
    theme: "grid",
    head: [["Canto", "Latitude", "Longitude", "Precisão", "Lado até o próximo"]],
    body: m.pontos.map((p, i) => [
      `${i + 1}º`,
      p.lat.toFixed(7),
      p.lng.toFixed(7),
      precisao(p.precisao),
      conta.lados[i] !== undefined && (n >= 3 || i < n - 1)
        ? `${formatarMetros(conta.lados[i])}  (${i + 1} a ${i + 1 === n ? 1 : i + 2})`
        : "",
    ]),
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
      cellPadding: 1.6,
    },
    headStyles: { fillColor: [77, 124, 15], textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: { 0: { halign: "center", cellWidth: 14 }, 3: { halign: "right" }, 4: { halign: "right" } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;

  const altura = doc.internal.pageSize.getHeight();
  if (m.observacao) {
    if (y > altura - 40) {
      doc.addPage();
      y = margem;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text("Observação", margem, y + 3);
    doc.setFont("helvetica", "normal");
    const linhas = doc.splitTextToSize(m.observacao, util) as string[];
    doc.text(linhas, margem, y + 8);
    y += 8 + linhas.length * 4.2;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    "Medida pelo GPS do celular, no plano (o desnível do terreno não entra). Serve para conferência - não substitui o levantamento topográfico.",
    margem,
    altura - 8,
    { maxWidth: util }
  );

  const blob = doc.output("blob");
  return new File([blob], nomeDoArquivo(m), { type: "application/pdf" });
}
