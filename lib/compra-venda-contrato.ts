import {
  dataPorExtenso,
  formatDate,
  numeroComExtenso,
  primeiraMaiuscula,
  valorPorExtenso,
} from "./utils";
import type { PropertyBuyer, PropertySaleContract } from "./types";

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
// Campo vazio: no contrato em branco vira linha para a caneta; no contrato
// preenchido ele some e a frase se ajusta sem ele (ver "Modo", abaixo).
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

/**
 * DUAS IMPRESSÕES, DOIS JEITOS DE TRATAR O CAMPO VAZIO:
 *
 *   • o contrato EM BRANCO (botão "Imprimir em branco") é feito para a caneta:
 *     cada campo sai como linha para completar à mão;
 *   • o contrato PREENCHIDO na tela sai só com o que foi preenchido — o que
 *     ficou em branco some, e a frase se ajusta sem ele ("RUA DAS FLORES, nº
 *     120, bairro CENTRO", sem o "CEP ____" pendurado no fim).
 */
interface Modo {
  /** true = contrato em branco, com linha no lugar de cada campo vazio. */
  linhas: boolean;
}

/**
 * Um pedaço da frase: com valor, monta o texto; sem valor, vira a linha para
 * a caneta (contrato em branco) ou some (contrato preenchido → null).
 */
function campo(
  m: Modo,
  valor: string | null | undefined,
  montar: (t: string) => string,
  linha = LINHA_EM_BRANCO
): string | null {
  const t = valor?.trim();
  if (t) return montar(t);
  return m.linhas ? montar(linha) : null;
}

/** Junta os pedaços que existem: "a, b, c". */
function juntar(partes: (string | null | undefined)[], separador = ", "): string {
  return partes.filter((p): p is string => !!p && !!p.trim()).join(separador);
}

/** "a", "a e b", "a, b e c". */
function listaComE(partes: string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

/** "m" = homem, "f" = mulher, vazio = não informado (migration 116). */
export type Genero = "m" | "f" | null | undefined;

/**
 * A palavra conforme quem é: "portador" (homem), "portadora" (mulher) e, sem
 * saber, as duas formas — "portador(a)".
 */
function gen(g: Genero, masc: string, fem: string, neutro: string): string {
  return g === "m" ? masc : g === "f" ? fem : neutro;
}
const portador = (g: Genero) => gen(g, "portador", "portadora", "portador(a)");
const inscrito = (g: Genero) => gen(g, "inscrito", "inscrita", "inscrito(a)");
const domiciliado = (g: Genero) =>
  gen(g, "residente e domiciliado", "residente e domiciliada", "residente e domiciliado(a)");

/**
 * Como o contrato chama o vendedor. Sem saber se é homem ou mulher fica o
 * masculino, "o VENDEDOR" — é como o contrato sempre saiu.
 */
export interface PapelDoVendedor {
  rotulo: string;
  o: string;
  O: string;
  ao: string;
  do: string;
  /** "DO VENDEDOR" / "DA VENDEDORA", nos títulos em caixa alta. */
  DO: string;
  pelo: string;
  legitimo: string;
}

export function papelDoVendedor(g: Genero): PapelDoVendedor {
  if (g === "f") {
    return {
      rotulo: "VENDEDORA",
      o: "a VENDEDORA",
      O: "A VENDEDORA",
      ao: "à VENDEDORA",
      do: "da VENDEDORA",
      DO: "DA VENDEDORA",
      pelo: "pela VENDEDORA",
      legitimo: "legítima proprietária e possuidora",
    };
  }
  return {
    rotulo: "VENDEDOR",
    o: "o VENDEDOR",
    O: "O VENDEDOR",
    ao: "ao VENDEDOR",
    do: "do VENDEDOR",
    DO: "DO VENDEDOR",
    pelo: "pelo VENDEDOR",
    legitimo: "legítimo proprietário e possuidor",
  };
}

/** Quem assina pela empresa: o cargo diz se é homem ou mulher ("SÓCIA", "DIRETORA"). */
export function generoPeloCargo(cargo?: string | null): Genero {
  const c = cargo?.trim().toUpperCase() ?? "";
  // sem o "\b" no fim, "DIRETORA" casaria com "DIRETOR" e "SÓCIA" com "SÓCIO"
  if (/S[ÓO]CIA\b|DIRETORA\b|PROCURADORA\b|ADMINISTRADORA\b/.test(c)) return "f";
  if (/S[ÓO]CIO\b|DIRETOR\b|PROCURADOR\b|ADMINISTRADOR\b/.test(c)) return "m";
  return null;
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
 * CENTRO, SÃO MATEUS DO MARANHÃO/MA, CEP 65470-000". Com `linhas`, cada pedaço
 * em branco vira a sua linha para a caneta (é assim no contrato de aluguel);
 * sem, o pedaço em branco some. O complemento, que nem todo endereço tem, some
 * sempre. Sem parte nenhuma preenchida vale o texto corrido dos contratos
 * salvos antes da 112 — e, sem ele também, volta vazio no modo sem linhas.
 */
export function enderecoPorExtenso(
  e: EnderecoEmPartes,
  legado?: string | null,
  linhas = true
): string {
  const algum = [e.rua, e.numero, e.complemento, e.bairro, e.cidade, e.cep].some((p) => p?.trim());
  if (!algum && legado?.trim()) return legado.trim();
  const m: Modo = { linhas };
  return juntar([
    campo(m, e.rua, (t) => t),
    // "S/N" sai sozinho — "nº S/N" não existe
    campo(m, e.numero, (t) => (/^s\/?n$/i.test(t) ? "S/N" : `nº ${t}`), "_______"),
    e.complemento?.trim() || null,
    campo(m, e.bairro, (t) => `bairro ${t}`),
    campo(m, e.cidade, (t) => t),
    campo(m, e.cep, (t) => `CEP ${t}`, "___________"),
  ]);
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

/** Tira o ponto final de quem digitou, para a frase não sair com dois. */
function semPonto(s: string): string {
  return s.replace(/\s*\.\s*$/, "");
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

/**
 * O cônjuge sai no papel (qualificação e linha de assinatura)? No contrato em
 * branco, sempre que pode haver cônjuge; no preenchido, só quando algum dado
 * dele foi preenchido — o que ficou em branco não sai.
 */
export function conjugeNoContrato(c: PropertySaleContract): boolean {
  if (!temConjuge(c)) return false;
  if (c.id === "em-branco") return true;
  // Só com o NOME: sem ele não há quem assinar. A nacionalidade vem preenchida
  // ("BRASILEIRA") e, sozinha, fazia aparecer um cônjuge sem nome no papel.
  return !!c.spouse_name?.trim();
}

/** "CASADO" → "casado, sob o regime da comunhão parcial de bens". */
function estadoCivil(m: Modo, c: PropertySaleContract): string | null {
  const estado = c.seller_marital_status?.trim();
  if (!estado) return m.linhas ? `estado civil ${LINHA_EM_BRANCO}` : null;
  const e = estadoCivilNoContrato(estado, c.seller_gender);
  if (!/casad|uni[ãa]o/.test(e)) return e;
  const regime = campo(
    m,
    c.seller_property_regime?.toLowerCase().replace(/^(o |a |de |da |do )/, ""),
    (t) => `sob o regime da ${t}`
  );
  return juntar([e, regime]);
}

function qualificacaoDoVendedor(m: Modo, c: PropertySaleContract): string {
  const endereco = enderecoPorExtenso(enderecoDoVendedor(c), c.seller_address, m.linhas);
  return juntar([
    campo(m, c.seller_name, (t) => t),
    campo(m, c.seller_nationality, (t) => `de nacionalidade ${t.toLowerCase()}`),
    estadoCivil(m, c),
    campo(m, c.seller_profession, (t) => `profissão ${t.toLowerCase()}`),
    campo(m, c.seller_rg, (t) => `${portador(c.seller_gender)} da cédula de identidade RG nº ${t}`),
    campo(m, c.seller_document, (t) => `${inscrito(c.seller_gender)} no CPF/CNPJ sob o nº ${t}`),
    endereco ? `${domiciliado(c.seller_gender)} na ${endereco}` : null,
    c.seller_phone?.trim() ? `telefone ${c.seller_phone.trim()}` : null,
    c.seller_email?.trim() ? `e-mail ${c.seller_email.trim()}` : null,
  ]);
}

function qualificacaoDoConjuge(m: Modo, c: PropertySaleContract): string {
  return juntar([
    campo(m, c.spouse_name, (t) => t),
    campo(m, c.spouse_nationality, (t) => `de nacionalidade ${t.toLowerCase()}`),
    campo(m, c.spouse_profession, (t) => `profissão ${t.toLowerCase()}`),
    campo(m, c.spouse_rg, (t) => `${portador(c.spouse_gender)} da cédula de identidade RG nº ${t}`),
    campo(m, c.spouse_document, (t) => `${inscrito(c.spouse_gender)} no CPF sob o nº ${t}`),
    `${domiciliado(c.spouse_gender)} no mesmo endereço ${papelDoVendedor(c.seller_gender).do}`,
  ]);
}

/**
 * QUEM COMPRA (migration 115): a PRODUMAR (padrão), outra empresa ou uma
 * pessoa física. Empresa é "a COMPRADORA"; pessoa física, "o(a) COMPRADOR(A)" —
 * o mesmo jeito do contrato de escrever "portador(a)" e "residente e
 * domiciliado(a)" para o vendedor.
 */
export interface PartesDoComprador {
  /** Pessoa física? */
  pf: boolean;
  /** "considerada em mora depois de notificada" — concorda com quem compra. */
  mora: string;
  rotulo: string;
  /** "a COMPRADORA" / "o(a) COMPRADOR(A)". */
  a: string;
  /** "à COMPRADORA" / "ao(à) COMPRADOR(A)". */
  aCrase: string;
  /** "da COMPRADORA" / "do(a) COMPRADOR(A)". */
  da: string;
  /** "pela COMPRADORA" / "pelo(a) COMPRADOR(A)". */
  pela: string;
  qualificacao: string;
  /** A linha de assinatura: o nome e o que vai embaixo dele. */
  assinaturaNome: string;
  assinaturaDetalhe: string;
}

export function partesDoComprador(
  m: { linhas: boolean },
  comprador: PropertyBuyer | null | undefined,
  modeloAluguel?: string | null
): PartesDoComprador {
  const feminino = {
    pf: false,
    mora: "considerada em mora depois de notificada",
    rotulo: "COMPRADORA",
    a: "a COMPRADORA",
    aCrase: "à COMPRADORA",
    da: "da COMPRADORA",
    pela: "pela COMPRADORA",
  };

  if (!comprador) {
    return {
      ...feminino,
      qualificacao: qualificacaoDaCompradora(modeloAluguel),
      assinaturaNome: "PRODUMAR SERVIÇOS LTDA",
      assinaturaDetalhe: `COMPRADORA · por ${ASSINA_PELA_PRODUMAR}, sócia administradora`,
    };
  }

  const endereco = enderecoPorExtenso(
    {
      rua: comprador.street,
      numero: comprador.number,
      complemento: comprador.complement,
      bairro: comprador.district,
      cidade: comprador.city,
      cep: comprador.zip,
    },
    null,
    m.linhas
  );

  if (comprador.kind === "pj") {
    const representante = comprador.rep_name?.trim()
      ? juntar([
          `neste ato representada por ${comprador.rep_name.trim()}`,
          comprador.rep_role?.trim() ? comprador.rep_role.trim().toLowerCase() : null,
          comprador.rep_rg?.trim()
            ? `${portador(generoPeloCargo(comprador.rep_role))} do RG nº ${comprador.rep_rg.trim()}`
            : null,
          comprador.rep_document?.trim()
            ? `${inscrito(generoPeloCargo(comprador.rep_role))} no CPF sob o nº ${comprador.rep_document.trim()}`
            : null,
        ])
      : null;
    return {
      ...feminino,
      qualificacao: juntar([
        comprador.name,
        comprador.document?.trim() ? `inscrita no CNPJ sob o nº ${comprador.document.trim()}` : null,
        endereco ? `com sede na ${endereco}` : null,
        representante,
      ]),
      assinaturaNome: comprador.name,
      assinaturaDetalhe: comprador.rep_name?.trim()
        ? `COMPRADORA · por ${comprador.rep_name.trim()}${comprador.rep_role?.trim() ? `, ${comprador.rep_role.trim().toLowerCase()}` : ""}`
        : "COMPRADORA",
    };
  }

  // pessoa física
  const estado = comprador.marital_status?.trim().toLowerCase();
  const casado = !!estado && /casad|uni[ãa]o/.test(estado);
  const g = comprador.gender;
  const rotulo = gen(g, "COMPRADOR", "COMPRADORA", "COMPRADOR(A)");
  return {
    pf: true,
    mora: gen(
      g,
      "considerado em mora depois de notificado",
      "considerada em mora depois de notificada",
      "considerado(a) em mora depois de notificado(a)"
    ),
    rotulo,
    a: `${gen(g, "o", "a", "o(a)")} ${rotulo}`,
    aCrase: `${gen(g, "ao", "à", "ao(à)")} ${rotulo}`,
    da: `${gen(g, "do", "da", "do(a)")} ${rotulo}`,
    pela: `${gen(g, "pelo", "pela", "pelo(a)")} ${rotulo}`,
    qualificacao: juntar([
      comprador.name,
      comprador.nationality?.trim() ? `de nacionalidade ${comprador.nationality.trim().toLowerCase()}` : null,
      estado
        ? juntar([
            estadoCivilNoContrato(estado, g),
            casado && comprador.property_regime?.trim()
              ? `sob o regime da ${comprador.property_regime.trim().toLowerCase().replace(/^(o |a |de |da |do )/, "")}`
              : null,
          ])
        : null,
      comprador.profession?.trim() ? `profissão ${comprador.profession.trim().toLowerCase()}` : null,
      comprador.rg?.trim() ? `${portador(g)} da cédula de identidade RG nº ${comprador.rg.trim()}` : null,
      comprador.document?.trim() ? `${inscrito(g)} no CPF sob o nº ${comprador.document.trim()}` : null,
      endereco ? `${domiciliado(g)} na ${endereco}` : null,
    ]),
    assinaturaNome: comprador.name,
    assinaturaDetalhe: comprador.document?.trim()
      ? `${rotulo} · CPF nº ${comprador.document.trim()}`
      : rotulo,
  };
}

/**
 * O contrato inteiro, um parágrafo por item. O primeiro é o título; a marca
 * [[ASSINATURAS]] vira o bloco de assinaturas na impressão.
 */
export function paragrafosDaCompraEVenda(
  c: PropertySaleContract,
  modeloAluguel?: string | null,
  /** Quem compra (115). Vazio = a PRODUMAR. */
  comprador?: PropertyBuyer | null
): string[] {
  const m: Modo = { linhas: c.id === "em-branco" };
  const C = partesDoComprador(m, comprador, modeloAluguel);
  const V = papelDoVendedor(c.seller_gender);
  const preco = Number(c.price) || 0;

  let n = 0;
  const clausula = (titulo: string) => `CLÁUSULA ${ORDINAIS[n++]} – ${titulo}:`;

  const p: string[] = [];

  p.push("CONTRATO PARTICULAR DE COMPRA E VENDA DE IMÓVEL");

  // sem nada do vendedor, fica ao menos o espaço para o nome dele
  p.push(`${V.rotulo}: ${qualificacaoDoVendedor(m, c) || LINHA_LONGA}.`);

  if (conjugeNoContrato(c)) {
    const rotulo =
      c.seller_marital_status?.trim() || c.spouse_name?.trim()
        ? `CÔNJUGE ${V.DO}`
        : `CÔNJUGE ${V.DO} (se houver)`;
    p.push(
      `${rotulo}: ${qualificacaoDoConjuge(m, c)}, que comparece a este ato para dar o seu consentimento à venda, na forma do artigo 1.647, inciso I, do Código Civil.`
    );
  }

  p.push(`${C.rotulo}: ${C.qualificacao}.`);

  p.push(
    `As partes acima qualificadas, doravante denominadas simplesmente ${V.rotulo} e ${C.rotulo}, têm entre si, justo e contratado, o presente Contrato Particular de Compra e Venda de Imóvel, que se regerá pelas cláusulas e condições seguintes e, no que forem omissas, pelos artigos 481 e seguintes do Código Civil (Lei nº 10.406/2002).`
  );

  // ── Objeto ────────────────────────────────────────────────────────────────
  const enderecoImovel = enderecoPorExtenso(enderecoDoImovel(c), c.property_address, m.linhas);
  const matricula = c.property_registration?.trim();
  const cartorio = c.property_registry_office?.trim();
  const registro =
    matricula || cartorio
      ? juntar(
          [
            "registrado",
            matricula ? `sob a matrícula nº ${matricula}` : null,
            cartorio ? `no ${cartorio}` : null,
          ],
          " "
        )
      : m.linhas
        ? `registrado sob a matrícula nº ${LINHA_EM_BRANCO} no Cartório de Registro de Imóveis de ${LINHA_EM_BRANCO}`
        : null;
  const detalhes = juntar([
    campo(m, c.property_kind, (t) => `do tipo ${t}`),
    enderecoImovel ? `situado na ${enderecoImovel}` : null,
    campo(m, c.property_area, (t) => `com área de ${/m/i.test(t) ? t : `${t} m²`}`),
    registro,
    campo(m, c.property_iptu_code, (t) => `inscrito no cadastro imobiliário municipal (IPTU) sob o nº ${t}`),
  ]);
  p.push(
    `${clausula("DO OBJETO")} ${V.O}, na qualidade de ${V.legitimo}, vende ${C.aCrase} o imóvel${detalhes ? ` ${detalhes}` : ""}.`
  );
  p.push(medidasEDivisas(m, c));

  // ── Preço ─────────────────────────────────────────────────────────────────
  const valor =
    preco > 0
      ? `R$ ${reais(preco)} (${primeiraMaiuscula(valorPorExtenso(preco))})`
      : m.linhas
        ? `R$ ${LINHA_EM_BRANCO} (${LINHA_LONGA})`
        : null;
  // a forma montada pelas respostas (à vista, entrada, parcelas); sem elas,
  // o texto livre de sempre — ou a linha para a caneta no contrato em branco
  const forma =
    formaDePagamento(c) ??
    campo(m, c.payment_terms ? semPonto(c.payment_terms) : null, (t) => t, LINHA_LONGA + LINHA_LONGA);
  const preambuloPreco = valor
    ? `O preço certo e ajustado da presente venda é de ${valor}, que ${C.a} pagará ${V.ao}`
    : `O preço da presente venda será pago ${C.pela} ${V.ao}`;
  p.push(
    `${clausula("DO PREÇO E DA FORMA DE PAGAMENTO")} ${preambuloPreco}${forma ? ` da seguinte forma: ${forma}` : ""}.`
  );

  // A lista de TODOS os pagamentos, com data e valor: a entrada (quando tem) e
  // cada parcela. Parcela sem o 1º vencimento informado sai só com o valor.
  const paragrafosDoPreco: string[] = [];
  const parcelas = parcelasDaCompra(c);
  if (parcelas.length > 0) {
    const entrada = c.payment_mode === "entrada_parcelas" ? Number(c.down_payment) || 0 : 0;
    const linhasDaLista = [
      entrada > 0
        ? `entrada – ${c.down_payment_date ? formatDate(c.down_payment_date) : "na assinatura deste contrato"} – R$ ${reais(entrada)}`
        : null,
      ...parcelas.map(
        (x) => `${x.numero}ª parcela${x.vencimento ? ` – ${formatDate(x.vencimento)}` : ""} – R$ ${reais(x.valor)}`
      ),
    ].filter(Boolean);
    paragrafosDoPreco.push(`Os pagamentos serão feitos assim: ${linhasDaLista.join("; ")}.`);
  }
  paragrafosDoPreco.push(
    `Cada pagamento será comprovado por recibo assinado ${V.pelo} ou pelo comprovante de transferência bancária para ${
      titularDeTerceiro(c) ? "a conta indicada nesta cláusula" : "conta de sua titularidade"
    }, que valerão como quitação da respectiva parcela.`,
    `Com o pagamento integral do preço, ${V.o} dará ${C.aCrase} plena, geral, rasa e irrevogável quitação, para nada mais reclamar a qualquer título.`
  );
  paragrafosDoPreco.forEach((texto, i) => p.push(`PARÁGRAFO ${ORDINAIS_PARAGRAFO[i]}: ${texto}`));

  // ── Posse ─────────────────────────────────────────────────────────────────
  const posse = c.possession_date
    ? ` em ${dataPorExtenso(c.possession_date)}`
    : m.linhas
      ? ` em ${LINHA_EM_BRANCO}`
      : "";
  p.push(
    `${clausula("DA POSSE")} A posse do imóvel será transmitida ${C.aCrase}${posse}, com a entrega das chaves, livre e desocupado de pessoas e coisas, no estado de conservação em que se encontra e que ${C.a} declara conhecer.`
  );

  // ── Declarações do vendedor ───────────────────────────────────────────────
  p.push(
    `${clausula(`DAS DECLARAÇÕES ${V.DO}`)} ${V.O} declara, sob as penas da lei, que o imóvel se encontra livre e desembaraçado de quaisquer ônus reais, judiciais ou extrajudiciais, tais como hipoteca, penhora, arresto, sequestro, alienação fiduciária, usufruto ou servidão, que sobre ele não pesam ações reais ou pessoais reipersecutórias, nem débitos de tributos, taxas ou tarifas, e que não existe contra si ação ou execução capaz de comprometer o imóvel ou de tornar esta venda ineficaz.`
  );
  p.push(
    `PARÁGRAFO ÚNICO: ${V.O} se obriga a entregar ${C.aCrase}, até a lavratura da escritura, a certidão de inteiro teor e de ônus reais da matrícula, as certidões negativas de débitos municipais do imóvel e as certidões dos distribuidores cíveis, fiscais, trabalhistas e de protesto em seu nome e, quando houver, em nome do cônjuge.`
  );

  // ── Tributos e despesas ───────────────────────────────────────────────────
  p.push(
    `${clausula("DOS TRIBUTOS E DAS DESPESAS")} Os impostos, taxas e tarifas incidentes sobre o imóvel (IPTU, água, energia elétrica e outros) vencidos até a data da entrega da posse são de responsabilidade ${V.do}; os que vencerem a partir dela, ${C.da}. O Imposto sobre a Transmissão de Bens Imóveis (ITBI) e as despesas de escritura e de registro ficam a cargo ${C.da}, conforme o artigo 490 do Código Civil.`
  );

  // ── Escritura ─────────────────────────────────────────────────────────────
  const prazoEscritura = c.deed_days
    ? `, no prazo de até ${numeroComExtenso(c.deed_days)} dias`
    : m.linhas
      ? `, no prazo de até ${LINHA_EM_BRANCO} dias`
      : "";
  p.push(
    `${clausula("DA ESCRITURA E DO REGISTRO")} Quitado o preço, as partes comparecerão ao Tabelionato de Notas${prazoEscritura ? `${prazoEscritura},` : ""} para a lavratura da escritura pública definitiva de compra e venda, nos termos do artigo 108 do Código Civil, a ser registrada no Cartório de Registro de Imóveis competente.`
  );
  p.push(
    `PARÁGRAFO ÚNICO: Recusando-se ${V.o} a outorgar a escritura definitiva depois de quitado o preço, ${C.a} poderá requerer a adjudicação compulsória do imóvel, judicial ou extrajudicialmente, na forma dos artigos 1.417 e 1.418 do Código Civil, servindo o presente contrato como título.`
  );

  // ── Irrevogabilidade ──────────────────────────────────────────────────────
  p.push(
    `${clausula("DA IRREVOGABILIDADE")} O presente contrato é celebrado em caráter irrevogável e irretratável, sem direito de arrependimento, e obriga as partes, seus herdeiros e sucessores a qualquer título.`
  );

  // ── Evicção ───────────────────────────────────────────────────────────────
  p.push(
    `${clausula("DA EVICÇÃO")} ${V.O} responde pela evicção de direito, na forma dos artigos 447 e seguintes do Código Civil, obrigando-se a fazer a presente venda sempre boa, firme e valiosa.`
  );

  // ── Descumprimento ────────────────────────────────────────────────────────
  const multa = Number(c.penalty_percent) || 0;
  const multaTexto =
    multa > 0
      ? `${multa.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% (${numeroPorExtensoPercentual(multa)} por cento)`
      : m.linhas
        ? `${LINHA_EM_BRANCO}% (${LINHA_EM_BRANCO} por cento)`
        : null;
  if (multaTexto) {
    p.push(
      `${clausula("DO DESCUMPRIMENTO")} A parte que descumprir qualquer cláusula deste contrato pagará à outra multa de ${multaTexto} sobre o preço total do imóvel, sem prejuízo das perdas e danos e do direito da parte prejudicada de exigir o cumprimento do contrato ou a sua rescisão.`
    );
  } else {
    // sem multa combinada, vale a regra geral: perdas e danos
    p.push(
      `${clausula("DO DESCUMPRIMENTO")} A parte que descumprir qualquer cláusula deste contrato responderá pelas perdas e danos causados à outra, sem prejuízo do direito da parte prejudicada de exigir o cumprimento do contrato ou a sua rescisão.`
    );
  }
  p.push(
    `PARÁGRAFO ÚNICO: Havendo atraso no pagamento, ${C.a} só será ${C.mora}, judicial ou extrajudicialmente, para pagar no prazo de 15 (quinze) dias, conforme o Decreto-Lei nº 745/1969. Rescindido o contrato por culpa ${C.da}, ${V.o} restituirá os valores recebidos, ${multaTexto ? "descontada a multa desta cláusula" : "descontadas as perdas e danos comprovados"}.`
  );

  // ── Cláusulas adicionais (só quando escritas) ─────────────────────────────
  if (c.notes?.trim()) {
    p.push(`${clausula("DAS DISPOSIÇÕES ADICIONAIS")} ${semPonto(c.notes.trim())}.`);
  }

  // ── Foro ──────────────────────────────────────────────────────────────────
  const foro = c.forum_city?.trim() || "São Mateus do Maranhão/MA";
  p.push(
    `${clausula("DO FORO")} Fica eleito o foro da Comarca de ${foro} para dirimir quaisquer questões oriundas deste contrato, com renúncia expressa a qualquer outro, por mais privilegiado que seja.`
  );

  p.push(
    "E, por estarem assim justas e contratadas, as partes assinam o presente instrumento em 2 (duas) vias de igual teor e forma, juntamente com as 2 (duas) testemunhas abaixo, para que produza os seus jurídicos e legais efeitos."
  );

  const data = c.signed_at
    ? `, ${dataPorExtenso(c.signed_at)}`
    : m.linhas
      ? ", ____ de ______________ de ________"
      : "";
  p.push(`${foro}${data}.`);

  p.push(MARCA_ASSINATURAS);
  return p;
}

/** "12,5" → "12,5 m". */
function metros(t: string): string {
  return `${t.replace(/\s*m(etros)?\.?$/i, "")} m`;
}

/**
 * O parágrafo do terreno: as quatro medidas, com quem faz divisa em cada lado
 * e o que tem construído (migration 114). No contrato em branco cada pedaço
 * vira a sua linha para a caneta; no preenchido, só entra o que foi
 * preenchido. Contrato salvo antes da 114, sem nenhuma medida, sai com o texto
 * corrido que tinha.
 */
function medidasEDivisas(m: Modo, c: PropertySaleContract): string {
  const abertura =
    "PARÁGRAFO ÚNICO: A venda compreende o terreno e todas as benfeitorias, acessões e instalações nele existentes";

  const algum = [
    c.property_front,
    c.property_back,
    c.property_right,
    c.property_left,
    c.property_front_with,
    c.property_back_with,
    c.property_right_with,
    c.property_left_with,
    c.property_improvements,
  ].some((x) => x?.trim());
  const extra = c.property_description?.trim() ? semPonto(c.property_description.trim()) : "";

  if (!algum && extra) {
    return `${abertura}, com as seguintes medidas, confrontações e características: ${extra}.`;
  }

  const medida = (v: string | null | undefined, lado: string) =>
    campo(m, v, (t) => `${metros(t)} ${lado}`, "_______");
  const medidas = [
    medida(c.property_front, "de frente"),
    medida(c.property_back, "de fundos"),
    medida(c.property_right, "do lado direito"),
    medida(c.property_left, "do lado esquerdo"),
  ].filter((x): x is string => !!x);

  const divisa = (v: string | null | undefined, lado: string) => campo(m, v, (t) => `${lado} com ${t}`);
  const divisas = [
    divisa(c.property_front_with, "pela frente"),
    divisa(c.property_back_with, "pelos fundos"),
    divisa(c.property_right_with, "pelo lado direito"),
    divisa(c.property_left_with, "pelo lado esquerdo"),
  ].filter((x): x is string => !!x);

  // "direito" e "esquerdo" só se entendem dizendo de onde se olha
  const temLado = [c.property_right, c.property_left, c.property_right_with, c.property_left_with].some(
    (x) => x?.trim()
  );
  const ondeOlha = m.linhas || temLado ? ", de quem da rua olha o imóvel" : "";

  let terreno = "";
  if (medidas.length && divisas.length) {
    terreno = `O terreno mede ${listaComE(medidas)}${ondeOlha}, limitando-se ${listaComE(divisas)}.`;
  } else if (medidas.length) {
    terreno = `O terreno mede ${listaComE(medidas)}${ondeOlha}.`;
  } else if (divisas.length) {
    terreno = `O terreno limita-se ${listaComE(divisas)}${ondeOlha}.`;
  }

  const benfeitorias = campo(
    m,
    c.property_improvements ? semPonto(c.property_improvements) : null,
    (t) => `Benfeitorias: ${t}.`,
    LINHA_LONGA
  );

  return juntar(
    [`${abertura}.`, terreno, benfeitorias, extra ? `${primeiraMaiuscula(extra)}.` : null],
    " "
  );
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

// ─────────────────────────────────────────────────────────────────────────────
// ENTRADA, PARCELAS E VENCIMENTOS (migration 117)
// ─────────────────────────────────────────────────────────────────────────────

const ORDINAIS_PARAGRAFO = ["PRIMEIRO", "SEGUNDO", "TERCEIRO", "QUARTO", "QUINTO", "SEXTO"];

export interface Parcela {
  numero: number;
  /** "2026-11-20" — vazio quando o primeiro vencimento não foi informado. */
  vencimento: string | null;
  valor: number;
}

/** "2026-01-31" + 1 mês → "2026-02-28" (o dia 31 cai no último dia do mês curto). */
export function somarMeses(iso: string, meses: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(y, m - 1 + meses, 1);
  const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  base.setDate(Math.min(d, ultimo));
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${base.getFullYear()}-${mm}-${dd}`;
}

/** Dinheiro sem erro de centavo: 0,1 + 0,2 vira 0,30, não 0,30000000004. */
function centavos(v: number): number {
  return Math.round(v * 100) / 100;
}

type CamposDasParcelas = Pick<
  PropertySaleContract,
  | "payment_mode"
  | "price"
  | "down_payment"
  | "installments"
  | "installment_amount"
  | "first_installment_amount"
  | "different_installment_number"
  | "first_due_date"
>;

/** O saldo devedor: o preço menos a entrada (no "parcelado", o preço todo). */
export function saldoDevedor(c: Pick<CamposDasParcelas, "payment_mode" | "price" | "down_payment">): number {
  const preco = Number(c.price) || 0;
  const entrada = c.payment_mode === "entrada_parcelas" ? Number(c.down_payment) || 0 : 0;
  return centavos(preco - entrada);
}

/**
 * A parcela com valor próprio, quando há uma ("a 2ª é de 20 mil, as outras
 * iguais"). Só existe com 2 ou mais parcelas. Sem o número, é a 1ª.
 */
export function parcelaDiferente(c: CamposDasParcelas): { numero: number; valor: number } | null {
  const n = Math.floor(Number(c.installments) || 0);
  const valor = Number(c.first_installment_amount) || 0;
  if (n < 2 || valor <= 0) return null;
  const numero = Math.min(n, Math.max(1, Math.floor(Number(c.different_installment_number) || 1)));
  return { numero, valor: centavos(valor) };
}

/**
 * O valor das parcelas iguais, sempre pela conta: o saldo devedor (menos a
 * parcela diferente, quando há) dividido pelas parcelas que sobram.
 */
export function valorDasParcelasIguais(c: CamposDasParcelas): number {
  const n = Math.floor(Number(c.installments) || 0);
  if (n <= 0) return 0;
  const dif = parcelaDiferente(c);
  const resto = centavos(saldoDevedor(c) - (dif?.valor ?? 0));
  const quantas = dif ? n - 1 : n;
  return resto > 0 && quantas > 0 ? centavos(resto / quantas) : 0;
}

/**
 * As parcelas, uma a uma, com o vencimento e o valor. Uma delas pode ter valor
 * próprio; as outras dividem o resto em partes iguais. A ÚLTIMA das iguais
 * acerta os centavos: assim entrada + parcelas fecha certinho com o preço.
 */
export function parcelasDaCompra(c: CamposDasParcelas): Parcela[] {
  if (c.payment_mode !== "entrada_parcelas" && c.payment_mode !== "parcelado") return [];
  const n = Math.floor(Number(c.installments) || 0);
  if (n <= 0) return [];

  const dif = parcelaDiferente(c);
  const valor = valorDasParcelasIguais(c);
  const iguais = dif ? n - 1 : n;
  const resto = centavos(saldoDevedor(c) - (dif?.valor ?? 0));
  const ajuste = resto > 0 ? centavos(resto - valor * (iguais - 1)) : valor;
  // a última parcela igual: a n-ésima, ou a anterior se a diferente for a última
  const ultimaIgual = dif?.numero === n ? n - 1 : n;

  return Array.from({ length: n }, (_, i) => {
    const numero = i + 1;
    return {
      numero,
      vencimento: c.first_due_date ? somarMeses(c.first_due_date, i) : null,
      valor:
        dif && numero === dif.numero
          ? dif.valor
          : numero === ultimaIgual && ajuste > 0
            ? ajuste
            : valor,
    };
  });
}

/** "R$ 5.000,00 (cinco mil reais)". */
function reaisPorExtenso(v: number): string {
  return `R$ ${reais(v)} (${valorPorExtenso(v)})`;
}

/** Número de parcelas no feminino: "2 (duas)", "21 (vinte e uma)". */
function parcelasPorExtenso(n: number): string {
  return numeroComExtenso(n)
    .replace(/\bum\b/g, "uma")
    .replace(/\bdois\b/g, "duas")
    .replace(/entos\b/g, "entas");
}

/** "PIX" → "PIX"; "TRANSFERÊNCIA" → "transferência bancária". */
function meioDePagamento(meio?: string | null): string {
  const t = meio?.trim();
  if (!t) return "";
  const conhecido: Record<string, string> = {
    PIX: "PIX",
    "TRANSFERÊNCIA": "transferência bancária",
    DINHEIRO: "dinheiro",
    CHEQUE: "cheque",
    BOLETO: "boleto bancário",
  };
  return conhecido[t.toUpperCase()] ?? t.toLowerCase();
}

/**
 * Para onde pagar: ", para a chave X, de titularidade do VENDEDOR" (PIX) ou
 * ", para a conta X, de titularidade da VENDEDORA" (transferência e o resto).
 * Conta de outra pessoa (120): ", para a chave X, de titularidade de FULANO,
 * CPF nº Y, indicada pela VENDEDORA". Sem chave nem conta informada, nada.
 */
function destinoDoPagamento(c: PropertySaleContract): string {
  const info = c.seller_bank_info?.trim();
  if (!info) return "";
  const V = papelDoVendedor(c.seller_gender);
  const ehPix = destinoEhPix(c);
  const onde = `, para ${ehPix ? "a chave" : "a conta"} ${semPonto(info)}`;
  const titular = titularDeTerceiro(c);
  if (!titular) return `${onde}, de titularidade ${V.do}`;
  const doc = c.seller_bank_holder_document?.trim();
  const rotulo = (doc?.replace(/\D/g, "").length ?? 0) > 11 ? "CNPJ" : "CPF";
  return `${onde}, de titularidade de ${titular}${doc ? `, ${rotulo} nº ${doc}` : ""}, indicada ${V.pelo}`;
}

/** O titular da conta quando ela NÃO é do vendedor — senão, null. */
function titularDeTerceiro(c: PropertySaleContract): string | null {
  return (c.seller_bank_info?.trim() && c.seller_bank_holder_name?.trim()) || null;
}

/** PIX escolhido — ou, sem meio escolhido, o que foi digitado não tem cara de conta bancária. */
function destinoEhPix(c: PropertySaleContract): boolean {
  const meio = c.payment_method?.trim().toUpperCase() ?? "";
  if (meio) return meio === "PIX";
  return !/banco|ag[eêç.]|conta|c\/c|\bcc\b/i.test(c.seller_bank_info ?? "");
}

/**
 * A forma de pagamento por extenso, montada pelas respostas da tela:
 *
 *   "à vista, na assinatura deste contrato, por PIX"
 *   "R$ 50.000,00 (cinquenta mil reais) de entrada, na assinatura deste
 *    contrato, e o saldo de R$ 100.000,00 (...) em 20 (vinte) parcelas mensais
 *    e consecutivas de R$ 5.000,00 (...), vencendo a primeira em 20 de novembro
 *    de 2026 e as demais no mesmo dia dos meses seguintes, pagas por PIX"
 *
 * Sem o modo escolhido (contrato antigo) ou em "outra forma", devolve null — e
 * vale o texto livre de sempre.
 */
export function formaDePagamento(c: PropertySaleContract): string | null {
  const modo = c.payment_mode;
  if (!modo || modo === "outro") return null;

  const obs = c.payment_terms?.trim() ? semPonto(c.payment_terms.trim()) : "";
  const meio = meioDePagamento(c.payment_method);
  // para onde pagar (119): "por PIX, para a chave X, de titularidade do VENDEDOR"
  const destino = destinoDoPagamento(c);
  const comoPaga = meio || destino ? `${meio ? `por ${meio}` : destinoEhPix(c) ? "por PIX" : "por depósito ou transferência"}${destino}` : "";
  let texto: string;

  if (modo === "avista") {
    const quando = c.down_payment_date
      ? `em ${dataPorExtenso(c.down_payment_date)}`
      : "na assinatura deste contrato";
    texto = juntar(["à vista", quando, comoPaga || null]);
  } else {
    const parcelas = parcelasDaCompra(c);
    const n = parcelas.length;
    const entrada = modo === "entrada_parcelas" ? Number(c.down_payment) || 0 : 0;
    const preco = Number(c.price) || 0;

    const textoEntrada =
      entrada > 0
        ? `${reaisPorExtenso(entrada)} de entrada, ${
            c.down_payment_date ? `paga em ${dataPorExtenso(c.down_payment_date)}` : "paga na assinatura deste contrato"
          }`
        : null;

    let textoParcelas: string | null = null;
    if (n > 0) {
      const dif = parcelaDiferente(c);
      const ultima = parcelas[n - 1].valor;
      const saldo = centavos(preco - entrada);
      const inicio =
        textoEntrada && saldo > 0 ? `o saldo de ${reaisPorExtenso(saldo)} em ` : "em ";
      let quantas: string;
      if (n === 1) {
        quantas = `1 (uma) parcela de ${reaisPorExtenso(parcelas[0].valor)}`;
      } else if (dif && n === 2) {
        quantas = `2 (duas) parcelas mensais e consecutivas, sendo a primeira de ${reaisPorExtenso(parcelas[0].valor)} e a segunda de ${reaisPorExtenso(parcelas[1].valor)}`;
      } else if (dif) {
        // uma parcela com valor próprio (a 2ª, a 6ª...) e o resto igual
        const iguais = parcelas.filter((x) => x.numero !== dif.numero);
        const igual = iguais[0].valor;
        const ajustada = iguais[iguais.length - 1];
        quantas = `${parcelasPorExtenso(n)} parcelas mensais e consecutivas de ${reaisPorExtenso(igual)}, exceto a ${dif.numero}ª, de ${reaisPorExtenso(dif.valor)}${
          ajustada.valor !== igual ? `, e a ${ajustada.numero}ª, de ${reaisPorExtenso(ajustada.valor)}` : ""
        }`;
      } else {
        const valor = parcelas[0].valor;
        quantas = `${parcelasPorExtenso(n)} parcelas mensais e consecutivas de ${reaisPorExtenso(valor)}${
          ultima !== valor ? `, sendo a última de ${reaisPorExtenso(ultima)}` : ""
        }`;
      }
      const vencimento = c.first_due_date
        ? n === 1
          ? `, vencendo em ${dataPorExtenso(c.first_due_date)}`
          : `, vencendo a primeira em ${dataPorExtenso(c.first_due_date)} e as demais no mesmo dia dos meses seguintes`
        : "";
      textoParcelas = `${inicio}${quantas}${vencimento}${comoPaga ? `, ${n === 1 ? "paga" : "pagas"} ${comoPaga}` : ""}`;
    }

    texto = [textoEntrada, textoParcelas].filter(Boolean).join(", e ");
    if (!texto) return obs || null;
  }

  // conta de outra pessoa: o vendedor reconhece o depósito ali como pagamento a ele
  if (titularDeTerceiro(c)) {
    const V = papelDoVendedor(c.seller_gender);
    texto += `; os valores depositados nessa conta valem como pagamento feito diretamente ${V.ao}, que dá a respectiva quitação`;
  }

  return obs ? `${texto}; ${obs}` : texto;
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

/** O rótulo em negrito no começo do parágrafo ("VENDEDOR:", "CLÁUSULA TERCEIRA – DA POSSE:"). */
export const RE_ROTULO_COMPRA_VENDA =
  /^(VENDEDORA?|COMPRADORA?|COMPRADOR\(A\)|CÔNJUGE D[OA] VENDEDORA?(?: \(se houver\))?|CLÁUSULA [^:]{1,60}|PARÁGRAFO [^:]{1,40}):/;

/** As linhas de assinatura, na ordem da folha: vendedor, cônjuge (quando entra) e quem compra. */
export function assinaturasDaCompraEVenda(
  c: PropertySaleContract,
  comprador?: PropertyBuyer | null,
  modeloAluguel?: string | null
): { nome: string; detalhe?: string }[] {
  const C = partesDoComprador({ linhas: c.id === "em-branco" }, comprador, modeloAluguel);
  const V = papelDoVendedor(c.seller_gender);
  const lista: { nome: string; detalhe?: string }[] = [
    {
      nome: c.seller_name || V.rotulo,
      detalhe: c.seller_document
        ? `${V.rotulo} · CPF/CNPJ nº ${c.seller_document}`
        : c.seller_name
          ? V.rotulo
          : undefined,
    },
  ];
  if (conjugeNoContrato(c)) {
    lista.push({
      nome: c.spouse_name || `CÔNJUGE ${V.DO}`,
      detalhe: c.spouse_document
        ? `CÔNJUGE · CPF nº ${c.spouse_document}`
        : c.spouse_name
          ? `CÔNJUGE ${V.DO}`
          : undefined,
    });
  }
  lista.push({ nome: C.assinaturaNome, detalhe: C.assinaturaDetalhe });
  return lista;
}

/** "contrato-compra-e-venda-joao-da-silva.pdf" */
export function nomeDoPdfDaCompraEVenda(c: PropertySaleContract): string {
  const quem = c.seller_name ? paraArquivo(c.seller_name) : c.id === "em-branco" ? "em-branco" : "";
  return `contrato-compra-e-venda${quem ? `-${quem}` : ""}.pdf`;
}

function paraArquivo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * O estado civil do jeito que entra no contrato. A tela oferece os botões no
 * masculino (SOLTEIRO, CASADO...), mas a pessoa pode ser mulher — então o texto
 * usa a forma que serve aos dois, como já faz com "portador(a)".
 */
export function estadoCivilNoContrato(estado: string, g?: Genero): string {
  const e = estado.trim().toLowerCase();
  const raiz: Record<string, [string, string]> = {
    solteiro: ["solteiro", "solteira"],
    solteira: ["solteiro", "solteira"],
    casado: ["casado", "casada"],
    casada: ["casado", "casada"],
    divorciado: ["divorciado", "divorciada"],
    divorciada: ["divorciado", "divorciada"],
    "viúvo": ["viúvo", "viúva"],
    "viúva": ["viúvo", "viúva"],
  };
  if (g && raiz[e]) return g === "m" ? raiz[e][0] : raiz[e][1];
  const neutro: Record<string, string> = {
    solteiro: "solteiro(a)",
    solteira: "solteiro(a)",
    casado: "casado(a)",
    casada: "casado(a)",
    divorciado: "divorciado(a)",
    divorciada: "divorciado(a)",
    "viúvo": "viúvo(a)",
    "viúva": "viúvo(a)",
    "união estável": "em união estável",
  };
  return neutro[e] ?? e;
}
