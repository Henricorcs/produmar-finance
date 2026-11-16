import {
  dataPorExtenso,
  formatBRL,
  formatDate,
  localDateISO,
  loanTotalDue,
  numeroComExtenso,
  valorPorExtenso,
} from "./utils";
import { MARCA_ASSINATURAS, ASSINA_PELA_PRODUMAR, qualificacaoDaCompradora } from "./compra-venda-contrato";
import { paraNomeDeArquivo } from "./contrato-pdf";
import { JUROS_DA_DIVIDA, MULTA_DA_DIVIDA } from "./devedores-boletos";
import { enderecoDoDevedor } from "./devedor-endereco";
import { LOAN_PAYMENT_METHOD_LABEL } from "./types";
import type { Loan, LoanInstallment, LoanPayment } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// INSTRUMENTO PARTICULAR DE CONFISSÃO DE DÍVIDA — o texto
// ─────────────────────────────────────────────────────────────────────────────
// Gerado a partir da dívida lançada em Devedores, para o devedor assinar. O que
// faz este papel valer na Justiça:
//   • a dívida LÍQUIDA (valor certo), CERTA e EXIGÍVEL (com vencimento),
//     reconhecida de forma irrevogável e irretratável;
//   • a assinatura do devedor e de DUAS TESTEMUNHAS — com elas o documento é
//     título executivo extrajudicial (art. 784, III, do Código de Processo
//     Civil): se não pagar, a cobrança vai direto para a execução, sem precisar
//     de processo para provar que deve;
//   • a forma de pagamento, o atraso (multa, juros e correção), o vencimento
//     antecipado e o foro.
// A credora é a PRODUMAR — a qualificação sai do parágrafo "LOCADOR:" do
// modelo do contrato de aluguel, como na compra e venda.
// A qualificação do devedor (nacionalidade, estado civil, profissão, RG,
// endereço — ou a sede e o representante da empresa) vem do cadastro da
// dívida (141). O que ficou em branco sai como linha para a caneta.
// ─────────────────────────────────────────────────────────────────────────────

export { MARCA_ASSINATURAS };

const LINHA = "____________________";
const LINHA_LONGA = "__________________________________________________";

/** Onde se assina e qual é o foro. */
export const CIDADE_DA_CONFISSAO = "São Mateus do Maranhão";
export const FORO_DA_CONFISSAO = "São Mateus do Maranhão/MA";

/** O rótulo em negrito no começo do parágrafo ("CREDORA:", "CLÁUSULA PRIMEIRA – ...:"). */
export const RE_ROTULO_CONFISSAO = /^(CREDORA|DEVEDOR\(A\)|CLÁUSULA [^:]{1,70}|PARÁGRAFO [^:]{1,40}):/;

const ORDINAIS = ["PRIMEIRA", "SEGUNDA", "TERCEIRA", "QUARTA", "QUINTA", "SEXTA", "SÉTIMA", "OITAVA", "NONA", "DÉCIMA"];

export interface DividaParaConfissao {
  loan: Loan;
  installments: LoanInstallment[];
  payments: LoanPayment[];
}

/** "2 (duas)", "21 (vinte e uma)" — "parcela" é palavra feminina. */
function numeroNoFeminino(n: number): string {
  return numeroComExtenso(n)
    .replace(/\bum\b/g, "uma")
    .replace(/\bdois\b/g, "duas")
    .replace(/entos\b/g, "entas");
}

function reais(v: number): string {
  return `${formatBRL(v)} (${valorPorExtenso(v)})`;
}

/** CPF tem 11 dígitos; CNPJ, 14. */
function ehCnpj(doc?: string | null): boolean {
  return (doc ?? "").replace(/\D/g, "").length === 14;
}

/** O saldo que o devedor confessa: o total da dívida menos o que já pagou. */
export function saldoConfessado(d: DividaParaConfissao): number {
  const pago = d.payments.reduce((s, p) => s + Number(p.amount), 0);
  return Math.max(0, Math.round((loanTotalDue(d.loan) - pago) * 100) / 100);
}

/**
 * A qualificação do devedor — pessoa física ou empresa (CNPJ). Vem do
 * cadastro da dívida (migration 141); o que ficou em branco sai como linha
 * para completar à caneta antes de assinar.
 */
function qualificacaoDoDevedor(l: Loan): string {
  const nome = l.borrower_name.trim();
  const doc = l.borrower_document?.trim();
  const fone = l.borrower_phone?.trim();
  const ou = (v: string | null | undefined, linha = LINHA) => v?.trim() || linha;
  if (ehCnpj(doc)) {
    return (
      `${nome}, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº ${doc}, com sede em ${ou(enderecoDoDevedor(l), LINHA_LONGA)}, ` +
      `neste ato representada por ${ou(l.borrower_rep_name, LINHA_LONGA)}, portador(a) do CPF nº ${ou(l.borrower_rep_document)}` +
      (fone ? `, telefone ${fone}` : "")
    );
  }
  return (
    // preenchido: "brasileiro, casado, agricultor"; em branco, a linha leva
    // o nome do campo para quem completar à caneta
    `${nome}, ${ou(l.borrower_nationality, `nacionalidade ${LINHA}`)}, ` +
    `${ou(l.borrower_marital_status, `estado civil ${LINHA}`)}, ` +
    `${ou(l.borrower_profession, `profissão ${LINHA}`)}, ` +
    `portador(a) do RG nº ${ou(l.borrower_rg)}, inscrito(a) no CPF sob o nº ${doc || LINHA}, ` +
    `residente e domiciliado(a) em ${ou(enderecoDoDevedor(l), LINHA_LONGA)}` +
    (fone ? `, telefone ${fone}` : "")
  );
}

/** De onde vem a dívida: o valor, os juros, o total e o que já foi pago. */
function origemDaDivida(d: DividaParaConfissao): string {
  const l = d.loan;
  const total = loanTotalDue(l);
  const juros = Math.round((total - Number(l.principal)) * 100) / 100;
  const pago = d.payments.reduce((s, p) => s + Number(p.amount), 0);
  const partes = [`valor devido de ${reais(Number(l.principal))}`];
  if (juros > 0) partes.push(`acrescido de ${reais(juros)} de juros convencionados, totalizando ${reais(total)}`);
  let texto = `originada da dívida registrada sob o nº ${l.loan_number}, contraída em ${formatDate(l.loan_date)}, no ${partes.join(", ")}`;
  if (pago > 0) texto += `, da qual já foram pagos ${reais(Math.round(pago * 100) / 100)}`;
  return texto;
}

/** Como o devedor vai pagar: parcelas em aberto, ou a parcela única. */
function formaDePagamento(d: DividaParaConfissao, saldo: number): string[] {
  const meio = d.loan.payment_method
    ? ` O pagamento será feito por ${
        d.loan.payment_method === "boleto"
          ? "boleto bancário emitido pela CREDORA"
          : d.loan.payment_method === "pix"
            ? "PIX para a conta indicada pela CREDORA"
            : d.loan.payment_method === "cartao"
              ? "cartão"
              : "dinheiro, mediante recibo"
      }.`
    : "";
  const abertas = d.installments.filter((i) => !i.paid).sort((a, b) => a.number - b.number);

  if (abertas.length > 1) {
    const soma = abertas.reduce((s, i) => s + Number(i.amount), 0);
    return [
      `O(A) DEVEDOR(A) pagará o valor confessado em ${numeroNoFeminino(abertas.length)} parcelas mensais e sucessivas, que somam ${reais(Math.round(soma * 100) / 100)}, com os valores e vencimentos abaixo:${meio}`,
      ...abertas.map(
        (i) => `${i.number}ª parcela: ${formatBRL(Number(i.amount))}, com vencimento em ${formatDate(i.due_date)};`
      ),
    ];
  }
  const vencimento = abertas[0]?.due_date ?? d.loan.due_date;
  const valor = abertas[0] ? Number(abertas[0].amount) : saldo;
  return [
    vencimento
      ? `O(A) DEVEDOR(A) pagará o valor confessado de ${reais(valor)} em parcela única, com vencimento em ${formatDate(vencimento)}.${meio}`
      : `O(A) DEVEDOR(A) pagará o valor confessado de ${reais(valor)} em parcela única, com vencimento em ____/____/________.${meio}`,
  ];
}

/** O documento inteiro, em parágrafos: o primeiro é o título. */
export function paragrafosDaConfissao(d: DividaParaConfissao, modeloAluguel?: string | null): string[] {
  const saldo = saldoConfessado(d);
  const clausulas: [string, string[]][] = [
    [
      "DO RECONHECIMENTO DA DÍVIDA",
      [
        `O(A) DEVEDOR(A) reconhece e confessa, de forma livre, irrevogável e irretratável, que deve à CREDORA a quantia líquida, certa e exigível de ${reais(saldo)}, ${origemDaDivida(d)}.`,
      ],
    ],
    ["DA FORMA DE PAGAMENTO", formaDePagamento(d, saldo)],
    [
      "DO ATRASO",
      [
        `O não pagamento de qualquer valor na data do vencimento sujeitará o(a) DEVEDOR(A), independentemente de aviso ou notificação, à multa de ${MULTA_DA_DIVIDA}% (${valorSemReais(MULTA_DA_DIVIDA)} por cento) sobre o valor em atraso, a juros de mora de ${JUROS_DA_DIVIDA}% (${valorSemReais(JUROS_DA_DIVIDA)} por cento) ao mês e à correção monetária pelo IPCA, calculados até o efetivo pagamento.`,
      ],
    ],
    [
      "DO VENCIMENTO ANTECIPADO",
      [
        "O atraso de qualquer parcela por mais de 30 (trinta) dias provocará o vencimento antecipado de todo o saldo devedor, que poderá ser cobrado de uma só vez, com os acréscimos da cláusula anterior.",
      ],
    ],
    [
      "DO TÍTULO EXECUTIVO",
      [
        "Assinado pelo(a) DEVEDOR(A) e por duas testemunhas, o presente instrumento constitui título executivo extrajudicial, nos termos do art. 784, inciso III, do Código de Processo Civil, podendo ser executado judicialmente pela CREDORA em caso de inadimplemento.",
      ],
    ],
    [
      "DAS DESPESAS DE COBRANÇA",
      [
        "Havendo cobrança judicial ou extrajudicial, o(a) DEVEDOR(A) arcará também com as custas, despesas processuais e honorários advocatícios de 10% (dez por cento) sobre o valor do débito.",
      ],
    ],
    [
      "DA QUITAÇÃO E DA TOLERÂNCIA",
      [
        "Cada pagamento será comprovado por recibo ou comprovante bancário, e a quitação total será dada pela CREDORA após o pagamento integral. A tolerância da CREDORA quanto a qualquer atraso não importará novação, renúncia ou alteração do aqui ajustado.",
      ],
    ],
    [
      "DO FORO",
      [
        `As partes elegem o foro da Comarca de ${FORO_DA_CONFISSAO} para dirimir qualquer questão oriunda deste instrumento, com renúncia a qualquer outro, por mais privilegiado que seja.`,
      ],
    ],
  ];

  const p: string[] = ["INSTRUMENTO PARTICULAR DE CONFISSÃO DE DÍVIDA"];
  p.push(`CREDORA: ${qualificacaoDaCompradora(modeloAluguel)}.`);
  p.push(`DEVEDOR(A): ${qualificacaoDoDevedor(d.loan)}.`);
  p.push(
    "As partes acima qualificadas têm entre si justo e acertado o presente Instrumento Particular de Confissão de Dívida, que se regerá pelas cláusulas e condições seguintes:"
  );
  clausulas.forEach(([nome, textos], i) => {
    p.push(`CLÁUSULA ${ORDINAIS[i]} – ${nome}: ${textos[0]}`);
    p.push(...textos.slice(1));
  });
  p.push(
    "E, por estarem assim justas e acertadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma, na presença das 2 (duas) testemunhas abaixo."
  );
  p.push(`${CIDADE_DA_CONFISSAO}, ${dataPorExtenso(localDateISO())}.`);
  p.push(MARCA_ASSINATURAS);
  return p;
}

/** "5" → "cinco" (para o percentual escrito por extenso). */
function valorSemReais(n: number): string {
  return valorPorExtenso(n).replace(/\s+reais?$/, "");
}

/** As linhas de assinatura: o devedor e a credora (as testemunhas vêm depois). */
export function assinaturasDaConfissao(l: Loan): { nome: string; detalhe?: string }[] {
  const doc = l.borrower_document?.trim();
  return [
    {
      nome: l.borrower_name.trim(),
      detalhe: doc ? `DEVEDOR(A) · ${ehCnpj(doc) ? "CNPJ" : "CPF"} nº ${doc}` : "DEVEDOR(A)",
    },
    {
      nome: "PRODUMAR SERVIÇOS LTDA",
      detalhe: `CREDORA · representada por ${ASSINA_PELA_PRODUMAR}`,
    },
  ];
}

/** "confissao-de-divida-joao-da-silva.pdf" */
export function nomeDoPdfDaConfissao(l: Loan): string {
  const quem = paraNomeDeArquivo(l.borrower_name);
  return `confissao-de-divida${quem ? `-${quem}` : ""}.pdf`;
}
