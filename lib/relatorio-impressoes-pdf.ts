import type { DadosDoRelatorioImpressoes } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// O RELATÓRIO MENSAL DE IMPRESSÕES EM PDF
// ─────────────────────────────────────────────────────────────────────────────
// É o arquivo que vai para o cliente, no desenho da planilha de sempre: a
// tabela de impressoras, as três linhas de total (data da leitura, franquia e
// total da fatura), a cidade com a data e o bloco de assinatura.
//
// Sai no próprio celular, sem servidor no meio: quem lê o contador é o
// operador, na rua, e ele precisa mandar o PDF dali mesmo. As bibliotecas só
// são carregadas na hora de gerar — quem nunca tira relatório não baixa nada.
//
// A fonte padrão do PDF (Helvetica) só tem o alfabeto latino: acento e ç
// saem, mas seta e sinal de menos tipográfico não — por isso o texto daqui usa
// só caracteres comuns.

/** "SÃO MATEUS DO MARANHÃO" → "São Mateus do Maranhão" (o cadastro grava em caixa alta). */
function nomeProprio(texto: string): string {
  const miudas = new Set(["de", "da", "do", "das", "dos", "e"]);
  return texto
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => (i > 0 && miudas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/** 350 → "350,00" (a planilha não repete o R$ em toda linha). */
function valor(n: number): string {
  return (Number(n) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function preco(n: number): string {
  return (Number(n) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

/** "2026-08-24" → "24/08/26", como na planilha. */
function dataCurta(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y.slice(2)}` : "";
}

/** A data do rodapé: o dia em que a fatura foi fechada, por extenso. */
function dataPorExtenso(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

/** "relatorio-impressoes-acqua-2026-09.pdf" */
export function nomeDoArquivo(dados: DadosDoRelatorioImpressoes): string {
  const cliente = dados.contract.client_name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `relatorio-impressoes-${cliente || "contrato"}-${dados.billing.competencia.slice(0, 7)}.pdf`;
}

export async function gerarRelatorioImpressoesPdf(dados: DadosDoRelatorioImpressoes): Promise<Blob> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const { billing, contract, readings, printers } = dados;
  const porId = new Map(printers.map((p) => [p.id, p]));
  const linhas = readings
    .map((r) => {
      const p = porId.get(r.printer_id);
      const paginas = Number(r.current_reading) - Number(r.previous_reading);
      return {
        unidade: p?.unit ?? 0,
        serie: p?.serial_number ?? "",
        modelo: p?.model ?? "",
        anterior: Number(r.previous_reading),
        atual: Number(r.current_reading),
        paginas,
        mensalidade: Number(r.monthly_fee),
        preco: Number(r.page_price),
        valor: Math.round(paginas * Number(r.page_price) * 100) / 100,
      };
    })
    .sort((a, b) => a.unidade - b.unidade);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const larguraPagina = doc.internal.pageSize.getWidth();
  const margem = 10;
  const meio = larguraPagina / 2;

  // ── Cabeçalho: quem cobra à esquerda, o título espaçado no meio ──────────
  if (contract.issuer_name) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(29, 78, 216);
    doc.text(contract.issuer_name.toLowerCase(), margem + 2, margem + 7);
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text("RELATÓRIO MENSAL DE IMPRESSÕES", meio + 10, margem + 7, {
    align: "center",
    charSpace: 1.6,
  });

  const franquiaAplicada = Math.min(Number(billing.franchise_pages), Number(billing.total_pages));
  const contratoTexto = [
    contract.contract_number ? `CONTRATO Nº ${contract.contract_number}` : null,
    contract.client_name,
  ]
    .filter(Boolean)
    .join("/");

  const negrito = { fontStyle: "bold" as const };

  autoTable(doc, {
    startY: margem + 11,
    margin: { left: margem, right: margem },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9.5,
      textColor: [15, 23, 42],
      lineColor: [15, 23, 42],
      lineWidth: 0.2,
      cellPadding: { top: 1.4, bottom: 1.4, left: 2, right: 2 },
      valign: "middle",
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [15, 23, 42],
      fontStyle: "bold",
      fontSize: 8.5,
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 13, halign: "center", fontStyle: "bold" },
      1: { cellWidth: 45, halign: "center" },
      2: { cellWidth: 40, halign: "center" },
      3: { cellWidth: 28, halign: "right" },
      4: { cellWidth: 28, halign: "right" },
      5: { cellWidth: 28, halign: "right" },
      6: { cellWidth: 33, halign: "right" },
      7: { cellWidth: 27, halign: "right" },
      8: { cellWidth: 35, halign: "right" },
    },
    head: [
      [
        "UNID",
        "NÚMERO DE SÉRIE",
        "MOD IMPRESSORA",
        "LEITURA\nANTERIOR",
        "LEITURA\nATUAL",
        "PÁGINAS\nIMPRESSAS",
        "MENSALIDADE",
        "IMPRESSÃO",
        "VALOR\nIMPRESSÕES",
      ],
    ],
    body: [
      ...linhas.map((l) => [
        String(l.unidade),
        l.serie,
        l.modelo,
        String(l.anterior),
        String(l.atual),
        String(l.paginas),
        valor(l.mensalidade),
        preco(l.preco),
        valor(l.valor),
      ]),
      // DATA DA LEITURA | anterior | atual | páginas | R$ mensalidades | R$ impressões
      [
        { content: "DATA DA LEITURA", colSpan: 3, styles: { ...negrito, halign: "right" } },
        { content: dataCurta(billing.previous_date), styles: { ...negrito, halign: "center" } },
        { content: dataCurta(billing.reading_date), styles: { ...negrito, halign: "center" } },
        { content: String(billing.total_pages), styles: { ...negrito, halign: "center" } },
        { content: "R$", styles: { ...negrito, halign: "left" } },
        { content: valor(Number(billing.total_fees)), styles: { ...negrito, halign: "right" } },
        { content: `R$  ${valor(Number(billing.total_prints))}`, styles: { ...negrito, halign: "right" } },
      ],
      // FRANQUIA ... | páginas | R$ preço | R$ valor
      [
        {
          content: `FRANQUIA DE PÁGINAS IMPRESSAS${contratoTexto ? ` (${contratoTexto})` : ""}`,
          colSpan: 5,
          styles: { ...negrito, halign: "right" },
        },
        { content: String(franquiaAplicada), styles: { ...negrito, halign: "center" } },
        { content: "R$", styles: { ...negrito, halign: "left" } },
        { content: preco(Number(billing.franchise_price)), styles: { ...negrito, halign: "right" } },
        { content: `R$  ${valor(Number(billing.franchise_amount))}`, styles: { ...negrito, halign: "right" } },
      ],
      // TOTAL DA FATURA
      [
        { content: "", colSpan: 3 },
        {
          content: "T O T A L   D A   F A T U R A",
          colSpan: 3,
          styles: { ...negrito, halign: "center" },
        },
        { content: "R$", styles: { ...negrito, halign: "left" } },
        {
          content: valor(Number(billing.total_amount)),
          colSpan: 2,
          styles: { ...negrito, halign: "right", fontSize: 11 },
        },
      ],
    ],
  });

  // ── Cidade e data, e a assinatura ────────────────────────────────────────
  const fimDaTabela =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 150;
  let y = fimDaTabela + 7;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  const quando = dataPorExtenso(billing.updated_at || billing.created_at);
  const cidade = contract.issuer_city ? `${nomeProprio(contract.issuer_city)}, ` : "";
  doc.text(`${cidade}${quando}`, meio, y, { align: "center" });

  if (contract.signer_name) {
    y += 18;
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.2);
    doc.line(meio - 45, y, meio + 45, y);
    y += 5;
    doc.setFontSize(10.5);
    doc.text(nomeProprio(contract.signer_name), meio, y, { align: "center" });
    doc.setFontSize(9);
    if (contract.signer_document) {
      y += 4.5;
      doc.text(contract.signer_document, meio, y, { align: "center" });
    }
    if (contract.signer_phone) {
      y += 4.5;
      doc.text(contract.signer_phone, meio, y, { align: "center" });
    }
  }

  return doc.output("blob");
}
