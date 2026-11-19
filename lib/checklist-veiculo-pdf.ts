import { formatDate } from "./utils";
import {
  ITENS_DO_CHECKLIST,
  NIVEIS_DE_COMBUSTIVEL,
  REPRESENTANTE_DO_VENDEDOR,
  VENDEDOR_DO_CHECKLIST,
  declaracaoDoChecklist,
  ehCnpjDoComprador,
  localEDataDoChecklist,
  nomeDoPdfDoChecklist,
  type ChecklistParaFolha,
} from "./checklist-veiculo";

// ─────────────────────────────────────────────────────────────────────────────
// O CHECKLIST DE ENTREGA EM PDF — a mesma folha da impressão, numa A4, para
// mandar pelo WhatsApp ou e-mail (o "Compartilhar" do iPhone). A fonte padrão
// do PDF (Helvetica) só tem o alfabeto latino: acentos e ç saem, outros
// símbolos não — por isso as caixinhas são desenhadas, não escritas.
// ─────────────────────────────────────────────────────────────────────────────

/** Tira o que a Helvetica do PDF não sabe escrever (travessão, aspas curvas...). */
function limpar(t: string | null | undefined): string {
  return (t ?? "")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x00-\xFF]/g, "")
    .trim();
}

export async function gerarChecklistVeiculoPdf(c: ChecklistParaFolha): Promise<File> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const larguraPagina = doc.internal.pageSize.getWidth();
  const margem = 12;
  const util = larguraPagina - margem * 2;
  const meio = larguraPagina / 2;
  let y = margem + 4;

  const ultimoY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // ── Cabeçalho ────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("CHECKLIST DE ENTREGA DE VEÍCULO", meio, y, { align: "center" });
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(
    limpar(`Vendedor: ${VENDEDOR_DO_CHECKLIST} - Entrega em ${formatDate(c.delivery_date)}`),
    meio,
    y,
    { align: "center" }
  );
  doc.setTextColor(15, 23, 42);
  y += 2;
  doc.setLineWidth(0.6);
  doc.line(margem, y, larguraPagina - margem, y);
  y += 4;

  const estiloQuadro = {
    theme: "grid" as const,
    margin: { left: margem, right: margem },
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 1.6,
      lineColor: [51, 65, 85] as [number, number, number],
      lineWidth: 0.2,
      textColor: [15, 23, 42] as [number, number, number],
    },
    headStyles: {
      fillColor: [241, 245, 249] as [number, number, number],
      textColor: [15, 23, 42] as [number, number, number],
      fontStyle: "bold" as const,
      fontSize: 9,
    },
  };
  /** O rótulo pequeno e cinza de cada caixinha. */
  const rotulo = (t: string) => ({
    content: t.toUpperCase(),
    styles: { fontSize: 7, textColor: [100, 116, 139] as [number, number, number], cellWidth: 26 },
  });
  const valor = (t: string | null | undefined, colSpan = 1) => ({
    content: limpar(t) || " ",
    colSpan,
    styles: { fontStyle: "bold" as const },
  });

  // ── Comprador ────────────────────────────────────────────────────────────
  autoTable(doc, {
    ...estiloQuadro,
    startY: y,
    head: [[{ content: "COMPRADOR", colSpan: 4 }]],
    body: [
      [rotulo("Nome"), valor(c.buyer_name, 3)],
      [rotulo(ehCnpjDoComprador(c) ? "CNPJ" : "CPF/CNPJ"), valor(c.buyer_document), rotulo("RG / órgão"), valor(c.buyer_rg)],
      [rotulo("Telefone"), valor(c.buyer_phone, 3)],
      [rotulo("Endereço"), valor(c.buyer_address, 3)],
    ],
  });
  y = ultimoY() + 3;

  // ── Veículo ──────────────────────────────────────────────────────────────
  autoTable(doc, {
    ...estiloQuadro,
    startY: y,
    head: [[{ content: "VEÍCULO", colSpan: 4 }]],
    body: [
      [rotulo("Marca / modelo"), valor(c.vehicle_model), rotulo("Placa"), valor(c.vehicle_plate)],
      [rotulo("Ano"), valor(c.vehicle_year), rotulo("Cor"), valor(c.vehicle_color)],
      [rotulo("Chassi"), valor(c.vehicle_chassis), rotulo("Renavam"), valor(c.vehicle_renavam)],
      [rotulo("Km na entrega"), valor(c.vehicle_km, 3)],
    ],
  });
  y = ultimoY() + 3;

  // ── Os itens ─────────────────────────────────────────────────────────────
  const caixinha = (x: number, yy: number) => {
    doc.setLineWidth(0.35);
    doc.rect(x, yy, 3.2, 3.2);
  };
  autoTable(doc, {
    ...estiloQuadro,
    startY: y,
    head: [["ITEM CONFERIDO", "SIM", "NÃO", "OBSERVAÇÃO"]],
    body: [
      ...ITENS_DO_CHECKLIST.map((i) => [limpar(i), "", "", ""]),
      [
        { content: "Nível de combustível", styles: { fontStyle: "bold" as const } },
        { content: NIVEIS_DE_COMBUSTIVEL.map((n) => `      ${n}`).join("     "), colSpan: 3 },
      ],
    ],
    styles: { ...estiloQuadro.styles, minCellHeight: 6.2, valign: "middle" },
    columnStyles: {
      0: { cellWidth: util * 0.42 },
      1: { cellWidth: 12, halign: "center" },
      2: { cellWidth: 12, halign: "center" },
    },
    headStyles: { ...estiloQuadro.headStyles, halign: "left" },
    didDrawCell: (d) => {
      if (d.section !== "body") return;
      const ultimaLinha = d.row.index === ITENS_DO_CHECKLIST.length;
      // as caixinhas Sim / Não
      if (!ultimaLinha && (d.column.index === 1 || d.column.index === 2)) {
        caixinha(d.cell.x + d.cell.width / 2 - 1.6, d.cell.y + d.cell.height / 2 - 1.6);
      }
      // as caixinhas do combustível, antes de cada nível
      if (ultimaLinha && d.column.index === 1) {
        doc.setFontSize(9);
        let x = d.cell.x + 1.6;
        for (const n of NIVEIS_DE_COMBUSTIVEL) {
          caixinha(x, d.cell.y + d.cell.height / 2 - 1.6);
          x += doc.getTextWidth(`      ${n}`) + doc.getTextWidth("     ");
        }
      }
    },
  });
  y = ultimoY() + 5;

  // ── Avarias e observações ───────────────────────────────────────────────
  doc.setLineWidth(0.2);
  const linhaEmBranco = () => {
    doc.line(margem, y, larguraPagina - margem, y);
    y += 6;
  };
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("AVARIAS ENCONTRADAS:", margem, y);
  y += 6;
  linhaEmBranco();
  linhaEmBranco();
  doc.setFont("helvetica", "bold");
  doc.text("OBSERVAÇÕES:", margem, y);
  y += 5;
  const notas = limpar(c.notes);
  if (notas) {
    doc.setFont("helvetica", "normal");
    const l = doc.splitTextToSize(notas, util) as string[];
    doc.text(l, margem, y);
    y += l.length * 4 + 2;
  } else {
    y += 1;
    linhaEmBranco();
  }
  linhaEmBranco();

  // ── Declaração ───────────────────────────────────────────────────────────
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const declaracao = doc.splitTextToSize(limpar(declaracaoDoChecklist(c)), util) as string[];
  doc.text(declaracao, margem, y, { align: "justify", maxWidth: util });
  y += declaracao.length * 4.2 + 4;
  doc.setFont("helvetica", "bold");
  doc.text(limpar(localEDataDoChecklist(c)), meio, y, { align: "center" });

  // ── Assinaturas (no pé, com espaço para assinar) ────────────────────────
  const alturaPagina = doc.internal.pageSize.getHeight();
  y = Math.max(y + 22, alturaPagina - margem - 14);
  const larguraAssinatura = (util - 14) / 2;
  const assinatura = (x: number, nome: string, detalhe: string) => {
    doc.setLineWidth(0.3);
    doc.line(x, y, x + larguraAssinatura, y);
    const cx = x + larguraAssinatura / 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(limpar(nome), larguraAssinatura) as string[], cx, y + 4, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(limpar(detalhe), larguraAssinatura) as string[], cx, y + 8, { align: "center" });
  };
  assinatura(margem, VENDEDOR_DO_CHECKLIST, `VENDEDOR - representada por ${REPRESENTANTE_DO_VENDEDOR}`);
  const doc_ = c.buyer_document?.trim();
  assinatura(
    margem + larguraAssinatura + 14,
    c.buyer_name,
    `COMPRADOR${doc_ ? ` - ${ehCnpjDoComprador(c) ? "CNPJ" : "CPF"} nº ${doc_}` : ""}`
  );

  const blob = doc.output("blob");
  return new File([blob], nomeDoPdfDoChecklist(c), { type: "application/pdf" });
}
