import { dataPorExtenso, numeroComExtenso, primeiraMaiuscula, valorPorExtenso } from "./utils";
import type { PropertySaleContract } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO DE COMPRA E VENDA DE IMÓVEL — o texto
// ─────────────────────────────────────────────────────────────────────────────
// A compradora é sempre a PRODUMAR. A qualificação dela NÃO é copiada aqui: sai
// do parágrafo "LOCADOR:" do modelo do contrato de aluguel em uso (Aluguéis →
// Modelo do contrato). Assim um CNPJ corrigido lá vale nos dois contratos.
//
// O texto segue o que a lei pede para o contrato valer:
//   • qualificação completa das partes, e o cônjuge do vendedor casado assinando
//     junto (art. 1.647, I, do Código Civil — sem ele a venda pode ser anulada);
//   • o imóvel identificado pela matrícula e pelo cartório;
//   • preço e forma de pagamento (arts. 481 e 482 do Código Civil);
//   • obrigação de passar a escritura pública (art. 108) e, se o vendedor se
//     recusar, a adjudicação compulsória (arts. 1.417 e 1.418);
//   • evicção (arts. 447 e seguintes), multa e foro;
//   • duas testemunhas, que fazem do contrato título executivo (art. 784, III,
//     do Código de Processo Civil).
//
// Campo vazio não some: vira linha para completar à caneta — é o mesmo
// combinado do contrato de aluguel.
// ─────────────────────────────────────────────────────────────────────────────

/** O que sai no lugar do campo que ainda não foi preenchido. */
export const LINHA_EM_BRANCO = "____________________";
const LINHA_LONGA = "______________________________________________";

/** Marca do parágrafo que vira o bloco de assinaturas. */
export const MARCA_ASSINATURAS = "[[ASSINATURAS]]";

/** Quem assina pela PRODUMAR (o mesmo nome do contrato de aluguel). */
export const ASSINA_PELA_PRODUMAR = "NILMA PEREIRA DA COSTA";

/**
 * Qualificação da PRODUMAR para quando o modelo de aluguel não tiver o
 * parágrafo "LOCADOR:" (modelo apagado ou reescrito). CNPJ conferido pelos
 * dígitos verificadores em 16/10/2026.
 */
const PRODUMAR_PADRAO =
  "PRODUMAR SERVIÇOS LTDA, CNPJ nº 55.837.468/0001-27, situada na Av. Antônia Portela, Nº 40, Centro – São Mateus do Maranhão/MA, Cep.: 65470-000, neste ato representada pela sua sócia administradora Sra. Nilma Pereira da Costa portadora do RG nº 024907792003-6 SSPMA e CPF nº 022843973-60";

const ORDINAIS = [
  "PRIMEIRA",
  "SEGUNDA",
  "TERCEIRA",
  "QUARTA",
  "QUINTA",
  "SEXTA",
  "SÉTIMA",
  "OITAVA",
  "NONA",
  "DÉCIMA",
  "DÉCIMA PRIMEIRA",
  "DÉCIMA SEGUNDA",
  "DÉCIMA TERCEIRA",
  "DÉCIMA QUARTA",
];

const ESTADOS_SEM_CONJUGE = ["SOLTEIRO", "SOLTEIRA", "DIVORCIADO", "DIVORCIADA", "VIÚVO", "VIÚVA"];

/** Valor do campo, ou a linha para preencher à caneta. */
function v(s?: string | null, linha = LINHA_EM_BRANCO): string {
  const t = s?.trim();
  return t ? t : linha;
}

/** As partes de um endereço, como a tela pergunta (migration 112). */
export interface EnderecoEmPartes {
  rua?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  cep?: string | null;
}

export function enderecoDoVendedor(c: PropertySaleContract): EnderecoEmPartes {
  return {
    rua: c.seller_street,
    numero: c.seller_number,
    complemento: c.seller_complement,
    bairro: c.seller_district,
    cidade: c.seller_city,
    cep: c.seller_zip,
  };
}

export function enderecoDoImovel(c: PropertySaleContract): EnderecoEmPartes {
  return {
    rua: c.property_street,
    numero: c.property_number,
    complemento: c.property_complement,
    bairro: c.property_district,
    cidade: c.property_city,
    cep: c.property_zip,
  };
}

/**
 * O endereço do jeito que entra no contrato: "RUA DAS FLORES, nº 120, bairro
 * CENTRO, SÃO MATEUS DO MARANHÃO/MA, CEP 65470-000". Cada pedaço em branco vira
 * a sua própria linha para a caneta — o complemento, que nem todo endereço
 * tem, simplesmente some. Sem parte nenhuma preenchida vale o texto corrido dos
 * contratos salvos antes da 112.
 */
export function enderecoPorExtenso(e: EnderecoEmPartes, legado?: string | null): string {
  const algum = [e.rua, e.numero, e.complemento, e.bairro, e.cidade, e.cep].some((p) => p?.trim());
  if (!algum && legado?.trim()) return legado.trim();
  return [
    v(e.rua),
    `nº ${v(e.numero, "_______")}`,
    e.complemento?.trim() || null,
    `bairro ${v(e.bairro)}`,
    v(e.cidade),
    `CEP ${v(e.cep, "___________")}`,
  ]
    .filter(Boolean)
    .join(", ");
}

/** Endereço curto para a lista da tela — só o que foi preenchido. */
export function enderecoCurto(e: EnderecoEmPartes, legado?: string | null): string {
  const curto = [
    e.rua?.trim(),
    e.numero?.trim() ? `nº ${e.numero.trim()}` : null,
    e.bairro?.trim(),
  ]
    .filter(Boolean)
    .join(", ");
  return curto || legado?.trim() || "";
}

function reais(valor: number): string {
  return (Number(valor) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * A qualificação da PRODUMAR, tirada do parágrafo "LOCADOR:" do modelo do
 * contrato de aluguel. No aluguel ela é "o LOCADOR"; aqui é "a COMPRADORA",
 * então o "representado" vira "representada".
 */
export function qualificacaoDaCompradora(modeloAluguel?: string | null): string {
  const paragrafo = (modeloAluguel ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => /^LOCADORA?\s*:/i.test(p));
  const texto = paragrafo?.replace(/^LOCADORA?\s*:\s*/i, "").trim() || PRODUMAR_PADRAO;
  return texto.replace(/\.$/, "").replace(/neste ato representado\b/i, "neste ato representada");
}

/** O cônjuge entra no contrato? Só fica de fora quando o vendedor é solteiro, divorciado ou viúvo. */
export function temConjuge(c: Pick<PropertySaleContract, "seller_marital_status" | "spouse_name">): boolean {
  if (c.spouse_name?.trim()) return true;
  const estado = c.seller_marital_status?.trim().toUpperCase() ?? "";
  return !ESTADOS_SEM_CONJUGE.includes(estado);
}

/** "CASADO" → "casado(a) sob o regime da comunhão parcial de bens". */
function estadoCivil(c: PropertySaleContract): string {
  const estado = c.seller_marital_status?.trim();
  if (!estado) return `estado civil ${LINHA_EM_BRANCO}`;
  const e = estado.toLowerCase();
  const casado = /casad|uni[ãa]o/.test(e);
  if (!casado) return e;
  return `${e}, sob o regime da ${v(c.seller_property_regime?.toLowerCase().replace(/^(o |a |de |da |do )/, ""))}`;
}

function qualificacaoDoVendedor(c: PropertySaleContract): string {
  const partes = [
    v(c.seller_name),
    `de nacionalidade ${v(c.seller_nationality?.toLowerCase())}`,
    estadoCivil(c),
    `profissão ${v(c.seller_profession?.toLowerCase())}`,
    `portador(a) da cédula de identidade RG nº ${v(c.seller_rg)}`,
    `inscrito(a) no CPF/CNPJ sob o nº ${v(c.seller_document)}`,
    `residente e domiciliado(a) na ${enderecoPorExtenso(enderecoDoVendedor(c), c.seller_address)}`,
  ];
  const contato = [
    c.seller_phone?.trim() ? `telefone ${c.seller_phone.trim()}` : null,
    c.seller_email?.trim() ? `e-mail ${c.seller_email.trim()}` : null,
  ].filter(Boolean);
  return `${partes.join(", ")}${contato.length ? `, ${contato.join(", ")}` : ""}`;
}

function qualificacaoDoConjuge(c: PropertySaleContract): string {
  return [
    v(c.spouse_name),
    `de nacionalidade ${v(c.spouse_nationality?.toLowerCase())}`,
    `profissão ${v(c.spouse_profession?.toLowerCase())}`,
    `portador(a) da cédula de identidade RG nº ${v(c.spouse_rg)}`,
    `inscrito(a) no CPF sob o nº ${v(c.spouse_document)}`,
    "residente e domiciliado(a) no mesmo endereço do VENDEDOR",
  ].join(", ");
}

/**
 * O contrato inteiro, um parágrafo por item. O primeiro é o título; a marca
 * [[ASSINATURAS]] vira o bloco de assinaturas na impressão.
 */
export function paragrafosDaCompraEVenda(
  c: PropertySaleContract,
  modeloAluguel?: string | null
): string[] {
  const conjuge = temConjuge(c);
  const compradora = qualificacaoDaCompradora(modeloAluguel);
  const preco = Number(c.price) || 0;

  let n = 0;
  const clausula = (titulo: string) => `CLÁUSULA ${ORDINAIS[n++]} – ${titulo}:`;

  const p: string[] = [];

  p.push("CONTRATO PARTICULAR DE COMPRA E VENDA DE IMÓVEL");

  p.push(`VENDEDOR: ${qualificacaoDoVendedor(c)}.`);

  if (conjuge) {
    const rotulo = c.seller_marital_status?.trim() || c.spouse_name?.trim() ? "CÔNJUGE DO VENDEDOR" : "CÔNJUGE DO VENDEDOR (se houver)";
    p.push(
      `${rotulo}: ${qualificacaoDoConjuge(c)}, que comparece a este ato para dar o seu consentimento à venda, na forma do artigo 1.647, inciso I, do Código Civil.`
    );
  }

  p.push(`COMPRADORA: ${compradora}.`);

  p.push(
    "As partes acima qualificadas, doravante denominadas simplesmente VENDEDOR e COMPRADORA, têm entre si, justo e contratado, o presente Contrato Particular de Compra e Venda de Imóvel, que se regerá pelas cláusulas e condições seguintes e, no que forem omissas, pelos artigos 481 e seguintes do Código Civil (Lei nº 10.406/2002)."
  );

  // ── Objeto ────────────────────────────────────────────────────────────────
  p.push(
    `${clausula("DO OBJETO")} O VENDEDOR, na qualidade de legítimo proprietário e possuidor, vende à COMPRADORA o imóvel do tipo ${v(c.property_kind)}, situado na ${enderecoPorExtenso(enderecoDoImovel(c), c.property_address)}, com área de ${v(c.property_area)}, registrado sob a matrícula nº ${v(c.property_registration)} no ${v(c.property_registry_office, `Cartório de Registro de Imóveis de ${LINHA_EM_BRANCO}`)}, inscrito no cadastro imobiliário municipal (IPTU) sob o nº ${v(c.property_iptu_code)}.`
  );
  p.push(medidasEDivisas(c));

  // ── Preço ─────────────────────────────────────────────────────────────────
  const valor =
    preco > 0
      ? `R$ ${reais(preco)} (${primeiraMaiuscula(valorPorExtenso(preco))})`
      : `R$ ${LINHA_EM_BRANCO} (${LINHA_LONGA})`;
  p.push(
    `${clausula("DO PREÇO E DA FORMA DE PAGAMENTO")} O preço certo e ajustado da presente venda é de ${valor}, que a COMPRADORA pagará ao VENDEDOR da seguinte forma: ${v(c.payment_terms?.replace(/\s*\.\s*$/, ""), LINHA_LONGA + LINHA_LONGA)}.`
  );
  p.push(
    "PARÁGRAFO PRIMEIRO: Cada pagamento será comprovado por recibo assinado pelo VENDEDOR ou pelo comprovante de transferência bancária para conta de sua titularidade, que valerão como quitação da respectiva parcela."
  );
  p.push(
    "PARÁGRAFO SEGUNDO: Com o pagamento integral do preço, o VENDEDOR dará à COMPRADORA plena, geral, rasa e irrevogável quitação, para nada mais reclamar a qualquer título."
  );

  // ── Posse ─────────────────────────────────────────────────────────────────
  const posse = c.possession_date ? dataPorExtenso(c.possession_date) : `${LINHA_EM_BRANCO}`;
  p.push(
    `${clausula("DA POSSE")} A posse do imóvel será transmitida à COMPRADORA em ${posse}, com a entrega das chaves, livre e desocupado de pessoas e coisas, no estado de conservação em que se encontra e que a COMPRADORA declara conhecer.`
  );

  // ── Declarações do vendedor ───────────────────────────────────────────────
  p.push(
    `${clausula("DAS DECLARAÇÕES DO VENDEDOR")} O VENDEDOR declara, sob as penas da lei, que o imóvel se encontra livre e desembaraçado de quaisquer ônus reais, judiciais ou extrajudiciais, tais como hipoteca, penhora, arresto, sequestro, alienação fiduciária, usufruto ou servidão, que sobre ele não pesam ações reais ou pessoais reipersecutórias, nem débitos de tributos, taxas ou tarifas, e que não existe contra si ação ou execução capaz de comprometer o imóvel ou de tornar esta venda ineficaz.`
  );
  p.push(
    "PARÁGRAFO ÚNICO: O VENDEDOR se obriga a entregar à COMPRADORA, até a lavratura da escritura, a certidão de inteiro teor e de ônus reais da matrícula, as certidões negativas de débitos municipais do imóvel e as certidões dos distribuidores cíveis, fiscais, trabalhistas e de protesto em seu nome e, quando houver, em nome do cônjuge."
  );

  // ── Tributos e despesas ───────────────────────────────────────────────────
  p.push(
    `${clausula("DOS TRIBUTOS E DAS DESPESAS")} Os impostos, taxas e tarifas incidentes sobre o imóvel (IPTU, água, energia elétrica e outros) vencidos até a data da entrega da posse são de responsabilidade do VENDEDOR; os que vencerem a partir dela, da COMPRADORA. O Imposto sobre a Transmissão de Bens Imóveis (ITBI) e as despesas de escritura e de registro ficam a cargo da COMPRADORA, conforme o artigo 490 do Código Civil.`
  );

  // ── Escritura ─────────────────────────────────────────────────────────────
  const prazoEscritura = c.deed_days ? `${numeroComExtenso(c.deed_days)} dias` : `${LINHA_EM_BRANCO} dias`;
  p.push(
    `${clausula("DA ESCRITURA E DO REGISTRO")} Quitado o preço, as partes comparecerão ao Tabelionato de Notas, no prazo de até ${prazoEscritura}, para a lavratura da escritura pública definitiva de compra e venda, nos termos do artigo 108 do Código Civil, a ser registrada no Cartório de Registro de Imóveis competente.`
  );
  p.push(
    "PARÁGRAFO ÚNICO: Recusando-se o VENDEDOR a outorgar a escritura definitiva depois de quitado o preço, a COMPRADORA poderá requerer a adjudicação compulsória do imóvel, judicial ou extrajudicialmente, na forma dos artigos 1.417 e 1.418 do Código Civil, servindo o presente contrato como título."
  );

  // ── Irrevogabilidade ──────────────────────────────────────────────────────
  p.push(
    `${clausula("DA IRREVOGABILIDADE")} O presente contrato é celebrado em caráter irrevogável e irretratável, sem direito de arrependimento, e obriga as partes, seus herdeiros e sucessores a qualquer título.`
  );

  // ── Evicção ───────────────────────────────────────────────────────────────
  p.push(
    `${clausula("DA EVICÇÃO")} O VENDEDOR responde pela evicção de direito, na forma dos artigos 447 e seguintes do Código Civil, obrigando-se a fazer a presente venda sempre boa, firme e valiosa.`
  );

  // ── Descumprimento ────────────────────────────────────────────────────────
  const multa = Number(c.penalty_percent) || 0;
  const multaTexto =
    multa > 0
      ? `${multa.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% (${numeroPorExtensoPercentual(multa)} por cento)`
      : `${LINHA_EM_BRANCO}% (${LINHA_EM_BRANCO} por cento)`;
  p.push(
    `${clausula("DO DESCUMPRIMENTO")} A parte que descumprir qualquer cláusula deste contrato pagará à outra multa de ${multaTexto} sobre o preço total do imóvel, sem prejuízo das perdas e danos e do direito da parte prejudicada de exigir o cumprimento do contrato ou a sua rescisão.`
  );
  p.push(
    "PARÁGRAFO ÚNICO: Havendo atraso no pagamento, a COMPRADORA só será considerada em mora depois de notificada, judicial ou extrajudicialmente, para pagar no prazo de 15 (quinze) dias, conforme o Decreto-Lei nº 745/1969. Rescindido o contrato por culpa da COMPRADORA, o VENDEDOR restituirá os valores recebidos, descontada a multa desta cláusula."
  );

  // ── Cláusulas adicionais (só quando escritas) ─────────────────────────────
  if (c.notes?.trim()) {
    p.push(`${clausula("DAS DISPOSIÇÕES ADICIONAIS")} ${c.notes.trim().replace(/\s*\.\s*$/, "")}.`);
  }

  // ── Foro ──────────────────────────────────────────────────────────────────
  const foro = c.forum_city?.trim() || "São Mateus do Maranhão/MA";
  p.push(
    `${clausula("DO FORO")} Fica eleito o foro da Comarca de ${foro} para dirimir quaisquer questões oriundas deste contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.`
  );

  p.push(
    "E, por estarem assim justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma, juntamente com as 2 (duas) testemunhas abaixo, para que produza os seus jurídicos e legais efeitos."
  );

  const cidade = foro;
  const data = c.signed_at
    ? dataPorExtenso(c.signed_at)
    : `____ de ______________ de ________`;
  p.push(`${cidade}, ${data}.`);

  p.push(MARCA_ASSINATURAS);
  return p;
}

/** "12,5" → "12,5 m"; em branco, a linha curta para a caneta. */
function metros(s?: string | null): string {
  const t = s?.trim().replace(/\s*m(etros)?\.?$/i, "");
  return t ? `${t} m` : "_______ m";
}

/**
 * O parágrafo do terreno: as quatro medidas, com quem faz divisa em cada lado
 * e o que tem construído (migration 114). Cada pedaço em branco vira a sua
 * linha para a caneta. Contrato salvo antes da 114, sem nenhuma medida, sai
 * com o texto corrido que tinha.
 */
function medidasEDivisas(c: PropertySaleContract): string {
  const abertura =
    "PARÁGRAFO ÚNICO: A venda compreende o terreno e todas as benfeitorias, acessões e instalações nele existentes";

  const partes = [
    c.property_front,
    c.property_back,
    c.property_right,
    c.property_left,
    c.property_front_with,
    c.property_back_with,
    c.property_right_with,
    c.property_left_with,
    c.property_improvements,
  ];
  const algum = partes.some((x) => x?.trim());
  const extra = c.property_description?.trim().replace(/\s*\.\s*$/, "");

  if (!algum && extra) {
    return `${abertura}, com as seguintes medidas, confrontações e características: ${extra}.`;
  }

  const frases = [
    `${abertura}.`,
    `O terreno mede ${metros(c.property_front)} de frente, ${metros(c.property_back)} de fundos, ${metros(c.property_right)} do lado direito e ${metros(c.property_left)} do lado esquerdo, de quem da rua olha o imóvel, limitando-se pela frente com ${v(c.property_front_with)}, pelos fundos com ${v(c.property_back_with)}, pelo lado direito com ${v(c.property_right_with)} e pelo lado esquerdo com ${v(c.property_left_with)}.`,
    `Benfeitorias: ${v(c.property_improvements?.replace(/\s*\.\s*$/, ""), LINHA_LONGA)}.`,
  ];
  if (extra) frases.push(`${primeiraMaiuscula(extra)}.`);
  return frases.join(" ");
}

/** "10" → "dez"; "2,5" → "dois vírgula cinco" (a multa por extenso). */
function numeroPorExtensoPercentual(valor: number): string {
  const inteiro = Math.floor(valor);
  const decimal = Math.round((valor - inteiro) * 100);
  const base = numeroComExtenso(inteiro).replace(/^\d+ \((.*)\)$/, "$1");
  if (!decimal) return base;
  const dec = numeroComExtenso(decimal % 10 === 0 ? decimal / 10 : decimal).replace(
    /^\d+ \((.*)\)$/,
    "$1"
  );
  return `${base} vírgula ${dec}`;
}

/** Contrato vazio — a versão para imprimir em branco e preencher à caneta. */
export function contratoEmBranco(): PropertySaleContract {
  return {
    id: "em-branco",
    seller_name: null,
    seller_nationality: null,
    seller_marital_status: null,
    seller_property_regime: null,
    seller_profession: null,
    seller_rg: null,
    seller_document: null,
    seller_address: null,
    seller_phone: null,
    seller_email: null,
    spouse_name: null,
    spouse_nationality: null,
    spouse_profession: null,
    spouse_rg: null,
    spouse_document: null,
    property_kind: null,
    property_address: null,
    property_area: null,
    property_description: null,
    property_registration: null,
    property_registry_office: null,
    property_iptu_code: null,
    price: 0,
    payment_terms: null,
    possession_date: null,
    deed_days: null,
    penalty_percent: null,
    forum_city: null,
    signed_at: null,
    notes: null,
    created_by: null,
    created_at: "",
    updated_at: "",
  };
}
