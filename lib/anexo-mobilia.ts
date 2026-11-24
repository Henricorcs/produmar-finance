import { dataPorExtenso, localDateISO } from "./utils";
import { ASSINA_PELA_PRODUMAR, PRODUMAR_PADRAO, enderecoPorExtenso } from "./compra-venda-contrato";
import { rentalKindLabel, type ItemDeMobilia, type RentalContractView } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// ANEXO AO CONTRATO DE LOCAÇÃO DO IMÓVEL — a casa (ou kitnet) mobiliada
// ─────────────────────────────────────────────────────────────────────────────
// O texto é o do modelo do dono (D:\CONTRATOS DE ALUGUEL\KIT NET\ANEXO AO
// CONTRATO DE LOCAÇÃO DO IMÓVEL.docx), palavra por palavra. O que era escrito à
// mão sai do contrato de aluguel cadastrado: o imóvel, o locatário e o locador
// (este, do parágrafo "LOCADOR:" do modelo do contrato em uso — o mesmo CNPJ
// dos dois documentos). A folha impressa e o PDF saem daqui: sempre iguais.
// ─────────────────────────────────────────────────────────────────────────────

export const TITULO_DO_ANEXO = "ANEXO AO CONTRATO DE LOCAÇÃO DO IMÓVEL";

export const CIDADE_DO_ANEXO = "São Mateus do Maranhão/MA";

/** Os cômodos do modelo, na ordem da folha. */
export const COMODOS_DO_MODELO = [
  "SALA DE ESTAR/JANTAR",
  "COZINHA E ÁREA DE SERVIÇO",
  "QUARTO(S)",
  "BANHEIRO(S)",
];

/** O estado de cada item, a um toque. */
export const ESTADOS_DA_MOBILIA = ["NOVO", "MUITO BOM", "BOM", "REGULAR"];

/** A lista do modelo — é com ela que o primeiro anexo de um imóvel começa. */
export const MOBILIAS_DO_MODELO: ItemDeMobilia[] = [
  { comodo: "SALA DE ESTAR/JANTAR", nome: "Sofá", descricao: "02 lugares cinza", estado: "MUITO BOM", valor: 700 },
  { comodo: "SALA DE ESTAR/JANTAR", nome: "Painel de TV", descricao: "Placas Adesivas estilo mármore", estado: "BOM", valor: 200 },
  { comodo: "SALA DE ESTAR/JANTAR", nome: "Televisor", descricao: "32P, marca Britânia com controle remoto", estado: "BOM", valor: 1200 },
  { comodo: "SALA DE ESTAR/JANTAR", nome: "Mesa de Jantar", descricao: "Redonda em MDF, 02 cadeiras", estado: "BOM", valor: 800 },
  { comodo: "COZINHA E ÁREA DE SERVIÇO", nome: "Geladeira/Refrigerador", descricao: "Marca HQ 240L", estado: "BOM", valor: 2400 },
  { comodo: "COZINHA E ÁREA DE SERVIÇO", nome: "Fogão", descricao: "04 bocas com botijão de gás", estado: "BOM", valor: 700 },
  { comodo: "COZINHA E ÁREA DE SERVIÇO", nome: "Armários", descricao: "Armário de aço", estado: "BOM", valor: 900 },
  { comodo: "QUARTO(S)", nome: "Cama", descricao: "Cama de casal (Cama BOX)", estado: "BOM", valor: 800 },
  { comodo: "QUARTO(S)", nome: "Guarda-roupa", descricao: "G/Roupas 04 pt com espelho MDF", estado: "BOM", valor: 700 },
  { comodo: "QUARTO(S)", nome: "Ar-condicionado", descricao: "12.000 btus com controle remoto", estado: "BOM", valor: 2500 },
  { comodo: "QUARTO(S)", nome: "Internet", descricao: "Sistema com UNU/Roteador", estado: "BOM", valor: 800 },
  { comodo: "BANHEIRO(S)", nome: "Chuveiro", descricao: "Normal", estado: "BOM", valor: 15 },
  { comodo: "BANHEIRO(S)", nome: "Vaso", descricao: "Assento de Vaso", estado: "BOM", valor: 50 },
];

export const RECEBIMENTO_DO_ANEXO =
  "O locatário declara receber nesta data, em perfeitas condições de uso e limpeza, os móveis, " +
  "eletrodomésticos e utensílios abaixo relacionados, responsabilizando-se pela conservação e " +
  "integridade dos mesmos, obrigando-se a devolvê-los nas mesmas condições ao término da locação.";

export const OBSERVACOES_DO_MODELO =
  "Todos os itens foram testados em conjunto pelo locador e locatário na data de assinatura. A falha " +
  "no funcionamento de eletrodomésticos por uso inadequado será de responsabilidade do locatário.";

/** Um pedaço de parágrafo — em negrito ou não, como no modelo. */
export interface Trecho {
  texto: string;
  negrito?: boolean;
}

export interface ComodoDoAnexo {
  /** "1. SALA DE ESTAR/JANTAR:" */
  titulo: string;
  itens: { texto: string; estado: string; valor: string }[];
}

export interface AssinaturaDoAnexo {
  nome: string;
  detalhe?: string;
}

/** O anexo pronto para a folha e para o PDF. */
export interface AnexoMontado {
  titulo: string;
  /** Endereço do imóvel, locador e locatário. */
  partes: Trecho[][];
  recebimento: string;
  comodos: ComodoDoAnexo[];
  observacoes: string;
  localEData: string;
  assinaturas: AssinaturaDoAnexo[];
  nomeArquivo: string;
}

/** O que o anexo guarda (o resto vem do contrato). */
export interface AnexoParaFolha {
  property_label: string | null;
  items: ItemDeMobilia[];
  notes: string | null;
  city: string | null;
  signed_at: string | null;
}

/** 700 → "700,00"; 2500 → "2.500,00". */
export function reaisDoItem(valor: number): string {
  return (Number(valor) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "1.200,50" → 1200.5 (o que se digita no campo de dinheiro). */
export function lerReais(texto: string): number {
  const n = Number(texto.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export function totalDaMobilia(itens: ItemDeMobilia[]): number {
  return itens.reduce((s, i) => s + (Number(i.valor) || 0), 0);
}

/** A lista que vem do banco (jsonb): só o que é item de verdade. */
export function itensValidos(bruto: unknown): ItemDeMobilia[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((i) => {
      const o = (i ?? {}) as Record<string, unknown>;
      const t = (v: unknown) => (typeof v === "string" ? v.trim() : "");
      return {
        comodo: t(o.comodo).toUpperCase() || "OUTROS",
        nome: t(o.nome),
        descricao: t(o.descricao),
        estado: t(o.estado).toUpperCase(),
        valor: Math.max(0, Math.round((Number(o.valor) || 0) * 100) / 100),
      };
    })
    .filter((i) => i.nome || i.descricao);
}

/** Os itens agrupados por cômodo, na ordem em que o cômodo aparece primeiro. */
export function agruparPorComodo(itens: ItemDeMobilia[]): { comodo: string; itens: { item: ItemDeMobilia; indice: number }[] }[] {
  const grupos: { comodo: string; itens: { item: ItemDeMobilia; indice: number }[] }[] = [];
  itens.forEach((item, indice) => {
    const comodo = item.comodo.trim().toUpperCase() || "OUTROS";
    let g = grupos.find((x) => x.comodo === comodo);
    if (!g) {
      g = { comodo, itens: [] };
      grupos.push(g);
    }
    g.itens.push({ item, indice });
  });
  return grupos;
}

/** O parágrafo "LOCADOR:" do modelo do contrato de aluguel em uso (sem o rótulo). */
export function qualificacaoDoLocador(modeloAluguel?: string | null): string {
  const paragrafo = (modeloAluguel ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .find((p) => /^LOCADORA?\s*:/i.test(p));
  const texto = paragrafo?.replace(/^LOCADORA?\s*:\s*/i, "").trim() || PRODUMAR_PADRAO.replace("representada", "representado");
  return texto.replace(/\.$/, "");
}

/** "Rua São Pedro, S/N°, Bairro Avenida Piqui, São Mateus do Maranhão – MA., CEP 65470-000" */
export function enderecoDoImovelNoAnexo(c: RentalContractView): string {
  const numero = c.property_number?.trim();
  const cidadeUf = [c.property_city, c.property_state].map((p) => p?.trim()).filter(Boolean).join(" – ");
  return [
    c.property_street?.trim(),
    numero ? (/^s\/?n/i.test(numero) ? "S/N°" : `Nº ${numero}`) : null,
    c.property_complement?.trim(),
    c.property_district?.trim() ? `Bairro ${c.property_district.trim()}` : null,
    cidadeUf || null,
    c.property_zip?.trim() ? `CEP ${c.property_zip.trim()}` : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/** O que sai em "o imóvel, KITNET, situado na...": o tipo do cadastro, se o anexo não disser. */
export function rotuloDoImovel(c: RentalContractView): string {
  return rentalKindLabel(c.property_kind).toUpperCase();
}

function ehCnpj(doc?: string | null): boolean {
  return (doc ?? "").replace(/\D/g, "").length === 14;
}

/** A qualificação do locatário, só com o que está cadastrado no contrato. */
function qualificacaoDoLocatario(c: RentalContractView): string {
  const casaDele = enderecoPorExtenso(
    {
      rua: c.tenant_street,
      numero: c.tenant_number,
      complemento: c.tenant_complement,
      bairro: c.tenant_district,
      cidade: c.tenant_city,
      cep: c.tenant_zip,
    },
    c.tenant_address,
    false
  );
  // inquilino sem endereço cadastrado: mora no imóvel alugado
  const endereco = casaDele || enderecoDoImovelNoAnexo(c);
  const doc = c.tenant_document?.trim();
  const partes: string[] = [];
  if (ehCnpj(doc)) {
    partes.push(`inscrita no CNPJ n° ${doc}`);
    if (endereco) partes.push(`com sede na ${endereco}`);
  } else {
    if (c.tenant_rg?.trim()) partes.push(`portador do RG n.º ${c.tenant_rg.trim()}`);
    if (doc) partes.push(`${partes.length ? "e " : "portador do "}CPF n° ${doc}`);
    if (endereco) partes.push(`residente e domiciliado na ${endereco}`);
  }
  return partes.length ? `, ${partes.join(", ")}.` : ".";
}

/** "anexo-mobilia-sebastiao-adailton-montelo.pdf" */
function nomeDoArquivo(c: RentalContractView): string {
  const slug = (c.tenant_name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `anexo-mobilia${slug ? `-${slug}` : ""}.pdf`;
}

/** O anexo inteiro, com os dados do contrato no lugar do que era escrito à mão. */
export function montarAnexo(
  a: AnexoParaFolha,
  c: RentalContractView,
  modeloAluguel?: string | null
): AnexoMontado {
  const qualificacao = qualificacaoDoLocador(modeloAluguel);
  // "PRODUMAR SERVIÇOS LTDA, CNPJ..." — o nome da empresa em negrito, como no modelo
  const virgula = qualificacao.indexOf(",");
  const nomeLocador = virgula > 0 ? qualificacao.slice(0, virgula) : qualificacao;
  const restoLocador = virgula > 0 ? qualificacao.slice(virgula) : "";

  const imovel = (a.property_label?.trim() || rotuloDoImovel(c)).toUpperCase();
  const endereco = enderecoDoImovelNoAnexo(c);

  const comodos: ComodoDoAnexo[] = agruparPorComodo(a.items).map((g, i) => ({
    titulo: `${i + 1}. ${g.comodo}:`,
    itens: g.itens.map(({ item }) => ({
      texto: [item.nome, item.descricao].filter(Boolean).join(": "),
      estado: item.estado ? `Estado: ${item.estado}` : "",
      valor: item.valor > 0 ? `R$ ${reaisDoItem(item.valor)}` : "",
    })),
  }));

  const doc = c.tenant_document?.trim();

  return {
    titulo: TITULO_DO_ANEXO,
    partes: [
      [
        { texto: "Endereço do Imóvel:", negrito: true },
        { texto: " O objeto deste contrato de locação é o imóvel, " },
        { texto: imovel, negrito: true },
        { texto: endereco ? `, situado na ${endereco}.` : "." },
      ],
      [
        { texto: "LOCADOR: ", negrito: true },
        { texto: nomeLocador, negrito: true },
        { texto: `${restoLocador}.` },
      ],
      [
        { texto: "LOCATÁRIO: ", negrito: true },
        { texto: (c.tenant_name ?? "").toUpperCase(), negrito: true },
        { texto: qualificacaoDoLocatario(c) },
      ],
    ],
    recebimento: RECEBIMENTO_DO_ANEXO,
    comodos,
    observacoes: a.notes?.trim() || "",
    localEData: `${a.city?.trim() || CIDADE_DO_ANEXO}, ${dataPorExtenso(a.signed_at || localDateISO())}.`,
    assinaturas: [
      { nome: ASSINA_PELA_PRODUMAR, detalhe: `LOCADOR · ${nomeLocador}` },
      {
        nome: (c.tenant_name ?? "").toUpperCase(),
        detalhe: doc ? `LOCATÁRIO · ${ehCnpj(doc) ? "CNPJ" : "CPF"} nº ${doc}` : "LOCATÁRIO",
      },
    ],
    nomeArquivo: nomeDoArquivo(c),
  };
}
