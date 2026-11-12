// ─────────────────────────────────────────────────────────────────────────────
// CARNÊ DO ALUGUEL EM PDF — para mandar ao inquilino pelo WhatsApp ou e-mail
// ─────────────────────────────────────────────────────────────────────────────
// Sai no próprio aparelho (jsPDF), com o mesmo desenho do carnê impresso: três
// boletos por folha A4, com linha de corte. O boleto do banco leva a linha
// digitável, o código de barras e o QR do Pix; o que está só no sistema leva
// o recibo ("recebido em", assinatura). Serve para o carnê inteiro e para um
// boleto só.
// ─────────────────────────────────────────────────────────────────────────────

import {
  JUROS_PADRAO,
  MULTA_PADRAO,
  barrasDoBoleto,
  boletoNoBanco,
  boletoAvulso,
  linhaDigitavelFormatada,
  rotuloDoTitulo,
  tituloDoBoleto,
} from "./alugueis-boletos";
import { enderecoCurto } from "./alugueis-contrato";
import { paraNomeDeArquivo } from "./contrato-pdf";
import { formatBRL, formatDate } from "./utils";
import type { RentalBoleto, RentalContractView } from "./types";

export interface CarneParaPdf {
  inquilino: string;
  /** "nº 3 · RUA TAL, Nº 10, CENTRO" */
  imovel: string;
  multa: number;
  juros: number;
  /**
   * O mesmo carnê serve para a dívida (Devedores, migration 139): só mudam os
   * rótulos. Sem eles, é o carnê do aluguel de sempre.
   */
  rotuloPagador?: string; // "INQUILINO (PAGADOR)"
  rotuloReferencia?: string; // "IMÓVEL"
  cabecalhoSistema?: string; // "CARNÊ DE ALUGUEL · PAGAR A"
  prefixoArquivo?: string; // "carne-aluguel"
  boletos: Pick<
    RentalBoleto,
    | "competencia"
    | "due_date"
    | "amount"
    | "cora_status"
    | "cora_invoice_id"
    | "digitable_line"
    | "barcode"
    | "our_number"
    | "pix_emv"
    | "avulso"
    | "descricao"
  >[];
}

/** Os dados do carnê a partir do contrato e dos boletos em aberto. */
export function dadosDoCarne(
  contrato: Pick<
    RentalContractView,
    | "tenant_name"
    | "property_code"
    | "property_street"
    | "property_number"
    | "property_district"
    | "late_fee_percent"
    | "interest_percent"
  >,
  boletos: CarneParaPdf["boletos"]
): CarneParaPdf {
  const endereco = enderecoCurto(contrato);
  return {
    inquilino: contrato.tenant_name,
    imovel: `nº ${contrato.property_code}${endereco ? ` · ${endereco}` : ""}`,
    multa: Number(contrato.late_fee_percent ?? MULTA_PADRAO),
    juros: Number(contrato.interest_percent ?? JUROS_PADRAO),
    boletos: [...boletos].sort((a, b) => a.due_date.localeCompare(b.due_date)),
  };
}

/** A fonte padrão do PDF não desenha tudo: troca o que ela não sabe. */
function limpar(t: string): string {
  return t
    .replace(/[–—−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x00-\xFF]/g, "");
}

const primeiraMaiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

export async function gerarCarnePdf(c: CarneParaPdf): Promise<File> {
  const [{ jsPDF }, QRCode] = await Promise.all([import("jspdf"), import("qrcode")]);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const margemX = 10;
  const margemY = 8;
  const largura = doc.internal.pageSize.getWidth() - margemX * 2; // 190
  const alturaBloco = 90;
  const espaco = 4.5; // entre um boleto e outro, onde passa a linha de corte

  c.boletos.forEach((b, i) => {
    const naFolha = i % 3;
    if (i > 0 && naFolha === 0) doc.addPage();
    const x = margemX;
    const y = margemY + naFolha * (alturaBloco + espaco);
    const banco = boletoNoBanco(b);

    // moldura
    doc.setDrawColor(30);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, y, largura, alturaBloco, 1.5, 1.5);

    // ── cabeçalho ──
    doc.setTextColor(100);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(
      banco
        ? "BENEFICIÁRIO"
        : c.cabecalhoSistema ?? (boletoAvulso(b) ? "BOLETO AVULSO · PAGAR A" : "CARNÊ DE ALUGUEL · PAGAR A"),
      x + 4,
      y + 5
    );
    doc.text(rotuloDoTitulo(b).toUpperCase(), x + largura - 4, y + 5, { align: "right" });
    doc.setTextColor(15);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("PRODUMAR SERVIÇOS LTDA", x + 4, y + 10);
    doc.text(
      doc.splitTextToSize(limpar(primeiraMaiuscula(tituloDoBoleto(b))), 90)[0] ?? "",
      x + largura - 4,
      y + 10,
      { align: "right" }
    );
    doc.setDrawColor(190);
    doc.setLineWidth(0.2);
    doc.line(x + 3, y + 12.5, x + largura - 3, y + 12.5);

    // ── dados ──
    const rotulo = (t: string, px: number, py: number, alinhar?: "right") => {
      doc.setTextColor(100);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.text(t, px, py, alinhar ? { align: alinhar } : undefined);
    };
    rotulo(c.rotuloPagador ?? "INQUILINO (PAGADOR)", x + 4, y + 16.5);
    rotulo("VENCIMENTO", x + 118, y + 16.5);
    rotulo("VALOR", x + largura - 4, y + 16.5, "right");
    doc.setTextColor(15);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(doc.splitTextToSize(limpar(c.inquilino), 108)[0] ?? "", x + 4, y + 21);
    doc.setFontSize(11);
    doc.text(formatDate(b.due_date), x + 118, y + 21);
    doc.text(limpar(formatBRL(Number(b.amount))), x + largura - 4, y + 21, { align: "right" });

    rotulo(c.rotuloReferencia ?? "IMÓVEL", x + 4, y + 26);
    doc.setTextColor(15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(doc.splitTextToSize(limpar(c.imovel), largura - 8)[0] ?? "", x + 4, y + 30);
    doc.setDrawColor(190);
    doc.line(x + 3, y + 32.5, x + largura - 3, y + 32.5);

    if (banco) {
      // ── linha digitável, código de barras e Pix ──
      const temQr = !!b.pix_emv;
      const larguraTexto = temQr ? largura - 46 : largura - 8;
      doc.setFont("courier", "bold");
      doc.setFontSize(10.5);
      doc.text(linhaDigitavelFormatada(b.digitable_line), x + 4, y + 39);

      const larguras = barrasDoBoleto(b.barcode ?? "");
      if (larguras.length > 0) {
        const total = larguras.reduce((s, w) => s + w, 0);
        const larguraBarras = Math.min(103, larguraTexto);
        const modulo = larguraBarras / total;
        let bx = x + 4;
        doc.setFillColor(0, 0, 0);
        larguras.forEach((w, k) => {
          if (k % 2 === 0) doc.rect(bx, y + 42, w * modulo, 13, "F");
          bx += w * modulo;
        });
      }

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(70);
      const nota = doc.splitTextToSize(
        limpar(
          `Depois do vencimento: multa de ${c.multa}% e juros de ${c.juros}% ao mês. Pague no aplicativo do banco lendo o código de barras, ou pelo Pix com o QR ao lado. Nosso número ${b.our_number ?? "-"}.`
        ),
        larguraTexto
      );
      doc.text(nota, x + 4, y + 60);

      if (temQr) {
        const qr = QRCode.create(b.pix_emv!, { errorCorrectionLevel: "M" });
        const n = qr.modules.size;
        const lado = 34;
        const m = lado / n;
        const qx = x + largura - 4 - lado;
        const qy = y + 36;
        doc.setFillColor(0, 0, 0);
        for (let r = 0; r < n; r++) {
          for (let col = 0; col < n; col++) {
            if (qr.modules.get(r, col)) doc.rect(qx + col * m, qy + r * m, m + 0.02, m + 0.02, "F");
          }
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(70);
        doc.text("Pague com Pix", qx + lado / 2, qy + lado + 4, { align: "center" });
      }
    } else {
      // ── só no sistema: pagamento direto, com recibo ──
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(60);
      doc.text(
        doc.splitTextToSize(
          limpar(
            `Pagamento direto à PRODUMAR (Pix, transferência ou dinheiro). Depois do vencimento: multa de ${c.multa}% e juros de ${c.juros}% ao mês.`
          ),
          largura - 8
        ),
        x + 4,
        y + 39
      );
      doc.setDrawColor(90);
      doc.setLineWidth(0.3);
      const ly = y + alturaBloco - 14;
      doc.line(x + 4, ly, x + largura / 2 - 6, ly);
      doc.line(x + largura / 2 + 6, ly, x + largura - 4, ly);
      doc.setFontSize(7);
      doc.setTextColor(100);
      doc.text("RECEBIDO EM ____/____/________", x + 4, ly + 4);
      doc.text("ASSINATURA DE QUEM RECEBEU", x + largura / 2 + 6, ly + 4);
    }

    // linha de corte embaixo (menos no último da folha)
    if (naFolha < 2 && i < c.boletos.length - 1) {
      const cy = y + alturaBloco + espaco / 2;
      doc.setDrawColor(150);
      doc.setLineWidth(0.2);
      doc.setLineDashPattern([1.5, 1.5], 0);
      doc.line(margemX, cy, margemX + largura, cy);
      doc.setLineDashPattern([], 0);
    }
  });

  const nomeBase = paraNomeDeArquivo(c.inquilino) || "inquilino";
  const nome =
    c.boletos.length === 1
      ? `boleto-${boletoAvulso(c.boletos[0]) ? "" : "aluguel-"}${paraNomeDeArquivo(tituloDoBoleto(c.boletos[0]))}-${nomeBase}.pdf`
      : `${c.prefixoArquivo ?? "carne-aluguel"}-${nomeBase}.pdf`;
  const blob = doc.output("blob");
  return new File([blob], nome, { type: "application/pdf" });
}
