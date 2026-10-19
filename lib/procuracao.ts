// ─────────────────────────────────────────────────────────────────────────────
// PROCURAÇÃO — o texto da folha, montado com o que foi preenchido na tela
// ─────────────────────────────────────────────────────────────────────────────
// Feita para a troca de titularidade da conta de energia (EQUATORIAL), no
// mesmo texto da procuração que era feita no Word:
//
//   • OUTORGANTE — quem dá os poderes (o titular da conta);
//   • OUTORGADO  — quem recebe (quem vai resolver na concessionária);
//   • PODERES    — o serviço, a conta contrato e até quando vale;
//   • a dispensa do reconhecimento de firma (Lei 13.726/2018), a data e as
//     duas assinaturas.
//
// Como na compra e venda: na procuração PREENCHIDA o que ficou em branco some;
// na impressão EM BRANCO sai a linha para a caneta.
// ─────────────────────────────────────────────────────────────────────────────

import { dataPorExtenso } from "./utils";
import {
  LINHA_EM_BRANCO,
  MARCA_ASSINATURAS,
  enderecoPorExtenso,
  estadoCivilNoContrato,
  type Genero,
} from "./compra-venda-contrato";
import type { PowerOfAttorney } from "./types";

export { MARCA_ASSINATURAS };

export const EMPRESA_PADRAO = "EQUATORIAL";
export const SERVICO_PADRAO = "TRANSFERÊNCIA DE TITULARIDADE";
export const VALIDADE_PADRAO = "até a conclusão do processo";
export const CIDADE_PADRAO = "São Mateus do Maranhão";

/** O rótulo em negrito no começo do parágrafo. */
export const RE_ROTULO_PROCURACAO = /^(OUTORGANTE|OUTORGAD[OA]|PODERES OUTORGADOS):/;

function gen(g: Genero, masc: string, fem: string, neutro: string): string {
  return g === "m" ? masc : g === "f" ? fem : neutro;
}

/** Junta os pedaços que existem: "a, b, c". */
function juntar(partes: (string | null | undefined)[]): string {
  return partes.filter((p): p is string => !!p && !!p.trim()).join(", ");
}

/** Com valor, monta o pedaço; sem, a linha para a caneta (em branco) ou nada. */
function campo(
  linhas: boolean,
  valor: string | null | undefined,
  montar: (t: string) => string
): string | null {
  const t = valor?.trim();
  if (t) return montar(t);
  return linhas ? montar(LINHA_EM_BRANCO) : null;
}

function semPonto(s: string): string {
  return s.replace(/\s*\.\s*$/, "");
}

interface Pessoa {
  nome: string | null;
  genero: Genero;
  nacionalidade: string | null;
  estadoCivil: string | null;
  profissao: string | null;
  naturalidade?: string | null;
  rg: string | null;
  cpf: string | null;
  endereco: string;
}

function outorgante(p: PowerOfAttorney, linhas: boolean): Pessoa {
  return {
    nome: p.grantor_name,
    genero: p.grantor_gender,
    nacionalidade: p.grantor_nationality,
    estadoCivil: p.grantor_marital_status,
    profissao: p.grantor_profession,
    naturalidade: p.grantor_birthplace,
    rg: p.grantor_rg,
    cpf: p.grantor_document,
    endereco: enderecoPorExtenso(
      {
        rua: p.grantor_street,
        numero: p.grantor_number,
        complemento: p.grantor_complement,
        bairro: p.grantor_district,
        cidade: p.grantor_city,
        cep: p.grantor_zip,
      },
      null,
      linhas
    ),
  };
}

function outorgado(p: PowerOfAttorney, linhas: boolean): Pessoa {
  return {
    nome: p.attorney_name,
    genero: p.attorney_gender,
    nacionalidade: p.attorney_nationality,
    estadoCivil: p.attorney_marital_status,
    profissao: p.attorney_profession,
    rg: p.attorney_rg,
    cpf: p.attorney_document,
    endereco: enderecoPorExtenso(
      {
        rua: p.attorney_street,
        numero: p.attorney_number,
        complemento: p.attorney_complement,
        bairro: p.attorney_district,
        cidade: p.attorney_city,
        cep: p.attorney_zip,
      },
      null,
      linhas
    ),
  };
}

/** "FULANO, de nacionalidade brasileira, solteiro, profissão mecânico, natural de..." */
function qualificacao(x: Pessoa, linhas: boolean): string {
  const g = x.genero;
  return juntar([
    campo(linhas, x.nome, (t) => t),
    campo(linhas, x.nacionalidade, (t) => `de nacionalidade ${t.toLowerCase()}`),
    campo(linhas, x.estadoCivil, (t) =>
      t === LINHA_EM_BRANCO ? `estado civil ${t}` : estadoCivilNoContrato(t, g)
    ),
    campo(linhas, x.profissao, (t) => `profissão ${t.toLowerCase()}`),
    x.naturalidade !== undefined ? campo(linhas, x.naturalidade, (t) => `natural de ${t}`) : null,
    campo(linhas, x.rg, (t) => `${gen(g, "portador", "portadora", "portador(a)")} da cédula de identidade RG nº ${t}`),
    campo(linhas, x.cpf, (t) => `${gen(g, "inscrito", "inscrita", "inscrito(a)")} no CPF sob o nº ${t}`),
    x.endereco
      ? `${gen(g, "residente e domiciliado", "residente e domiciliada", "residente e domiciliado(a)")} na ${x.endereco}`
      : null,
  ]);
}

/** "junto à EQUATORIAL" / "junto ao SAAE" — a concessionária, com o artigo certo. */
function juntoA(empresa: string): string {
  const feminina =
    /^(EQUATORIAL|CEMAR|CAEMA|ENERGISA|CELPA|COELBA|NEOENERGIA|COMPANHIA|CONCESSION)/i.test(empresa) ||
    /A$/i.test(empresa);
  return `junto ${feminina ? "à" : "ao"} ${empresa}`;
}

/**
 * A procuração inteira, um parágrafo por item. O primeiro é o título; a marca
 * [[ASSINATURAS]] vira o bloco de assinaturas.
 */
export function paragrafosDaProcuracao(p: PowerOfAttorney): string[] {
  const linhas = p.id === "em-branco";
  const gA = p.grantor_gender;
  const gB = p.attorney_gender;
  const oOutorgante = gen(gA, "o outorgante", "a outorgante", "o(a) outorgante");
  const rotuloOutorgado = gen(gB, "OUTORGADO", "OUTORGADA", "OUTORGADO");
  const procurador = gen(gB, "seu bastante procurador", "sua bastante procuradora", "seu(sua) bastante procurador(a)");
  const oOutorgado = gen(gB, "o ora outorgado", "a ora outorgada", "o(a) ora outorgado(a)");

  const empresa = p.company?.trim() || (linhas ? LINHA_EM_BRANCO : EMPRESA_PADRAO);
  const servico = (p.service?.trim() || SERVICO_PADRAO).toLowerCase();
  const conta = campo(linhas, p.account_number, (t) => `da unidade consumidora de conta contrato nº ${t}`);
  const validade = semPonto(p.validity?.trim() || VALIDADE_PADRAO);

  const poderes =
    `pelo presente instrumento, ${oOutorgante} nomeia e constitui como ${procurador} ${oOutorgado}, ` +
    `com o fim específico de solicitar, ${juntoA(empresa)}, o serviço de ${servico}${conta ? ` ${conta}` : ""}, ` +
    `podendo, para tanto, assinar requerimentos, termos e declarações, apresentar e receber documentos, ` +
    `prestar informações e praticar todos os atos necessários ao fiel cumprimento deste mandato, ` +
    `responsabilizando-se ${oOutorgante} por todos os atos praticados no cumprimento deste instrumento. ` +
    `Esta procuração tem validade ${validade}.`;

  const cidade = p.city?.trim() || (linhas ? LINHA_EM_BRANCO : CIDADE_PADRAO);
  const data = p.signed_at ? dataPorExtenso(p.signed_at) : "____ de ____________ de ______";

  return [
    "PROCURAÇÃO",
    `OUTORGANTE: ${qualificacao(outorgante(p, linhas), linhas)}.`,
    `${rotuloOutorgado}: ${qualificacao(outorgado(p, linhas), linhas)}.`,
    `PODERES OUTORGADOS: ${poderes}`,
    ...(p.notes?.trim() ? [`${semPonto(p.notes.trim())}.`] : []),
    "Valendo-se do que dispõe o art. 3º, I, da Lei Federal nº 13.726/2018, as partes acima qualificadas dispensam o reconhecimento de firma em suas respectivas assinaturas, ao mesmo tempo em que declaram ter pleno conhecimento do que dispõe o art. 299 do Código Penal Brasileiro, assumindo assim as responsabilidades pelos atos praticados.",
    `${cidade}, ${data}.`,
    MARCA_ASSINATURAS,
  ];
}

/** As linhas de assinatura: outorgante e outorgado. */
export function assinaturasDaProcuracao(p: PowerOfAttorney): { nome: string; detalhe?: string }[] {
  const linha = (nome: string | null, rotulo: string, cpf: string | null) => ({
    nome: nome?.trim() || rotulo,
    detalhe: cpf?.trim() ? `${rotulo} · CPF nº ${cpf.trim()}` : rotulo,
  });
  return [
    linha(p.grantor_name, "OUTORGANTE", p.grantor_document),
    linha(p.attorney_name, gen(p.attorney_gender, "OUTORGADO", "OUTORGADA", "OUTORGADO"), p.attorney_document),
  ];
}

export function nomeDoPdfDaProcuracao(p: PowerOfAttorney): string {
  const quem = p.grantor_name
    ? p.grantor_name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    : p.id === "em-branco"
      ? "em-branco"
      : "";
  return `procuracao${quem ? `-${quem}` : ""}.pdf`;
}

/** Procuração vazia — a impressão em branco, para preencher à caneta. */
export function procuracaoEmBranco(): PowerOfAttorney {
  return {
    id: "em-branco",
    grantor_name: null,
    grantor_gender: null,
    grantor_nationality: null,
    grantor_marital_status: null,
    grantor_profession: null,
    grantor_birthplace: null,
    grantor_rg: null,
    grantor_document: null,
    grantor_street: null,
    grantor_number: null,
    grantor_complement: null,
    grantor_district: null,
    grantor_city: null,
    grantor_zip: null,
    attorney_name: null,
    attorney_gender: null,
    attorney_nationality: null,
    attorney_marital_status: null,
    attorney_profession: null,
    attorney_rg: null,
    attorney_document: null,
    attorney_street: null,
    attorney_number: null,
    attorney_complement: null,
    attorney_district: null,
    attorney_city: null,
    attorney_zip: null,
    company: EMPRESA_PADRAO,
    service: SERVICO_PADRAO,
    account_number: null,
    validity: VALIDADE_PADRAO,
    city: null,
    signed_at: null,
    notes: null,
  };
}
