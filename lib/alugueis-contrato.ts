import {
  dataPorExtenso,
  formatDate,
  numeroComExtenso,
  primeiraMaiuscula,
  valorPorExtenso,
} from "./utils";
import { rentalKindLabel, type RentalContractView } from "./types";
import { enderecoPorExtenso } from "./compra-venda-contrato";

// ─────────────────────────────────────────────────────────────────────────────
// O CONTRATO PREENCHIDO
// ─────────────────────────────────────────────────────────────────────────────
// O modelo é o contrato de vocês, palavra por palavra, com os campos que eram
// escritos à mão (os que estavam em vermelho) entre chaves duplas. Aqui é onde
// cada um vira o dado do contrato cadastrado.
//
// Campo sem resposta não some: vira uma linha para preencher à caneta, que é
// melhor do que um contrato com um buraco no meio da frase.

/** O que sai no lugar do campo que ainda não foi preenchido. */
const LINHA_EM_BRANCO = "____________________";

/** A lista que a tela do modelo mostra, para quem for mexer no texto. */
export const CAMPOS_DO_CONTRATO: { campo: string; descricao: string }[] = [
  { campo: "INQUILINO_NOME", descricao: "Nome do locatário" },
  { campo: "INQUILINO_RG", descricao: "RG do locatário (com o órgão emissor)" },
  { campo: "INQUILINO_CPF", descricao: "CPF (ou CNPJ) do locatário" },
  { campo: "INQUILINO_NATURALIDADE", descricao: "Naturalidade do locatário" },
  { campo: "INQUILINO_ESTADO_CIVIL", descricao: "Estado civil do locatário" },
  { campo: "INQUILINO_PROFISSAO", descricao: "Profissão do locatário" },
  { campo: "INQUILINO_ENDERECO", descricao: "Onde o locatário reside hoje" },
  { campo: "INQUILINO_TELEFONE", descricao: "Telefone do locatário" },
  { campo: "IMOVEL_TIPO", descricao: "Tipo do imóvel (PONTO COMERCIAL, CASA...)" },
  { campo: "IMOVEL_ENDERECO", descricao: "Endereço completo do imóvel alugado" },
  { campo: "IMOVEL_APELIDO", descricao: "Como o imóvel é chamado no dia a dia" },
  { campo: "IMOVEL_CIDADE", descricao: "Cidade do imóvel" },
  { campo: "IMOVEL_UF", descricao: "Estado do imóvel" },
  { campo: "IMOVEL_CEP", descricao: "CEP do imóvel" },
  { campo: "IMOVEL_MATRICULA", descricao: "Matrícula do imóvel no cartório" },
  { campo: "IMOVEL_IPTU", descricao: "Inscrição do IPTU" },
  { campo: "IMOVEL_AGUA", descricao: "Instalação da água" },
  { campo: "IMOVEL_LUZ", descricao: "Instalação da luz" },
  { campo: "CODIGO", descricao: "Código do imóvel no sistema" },
  { campo: "PRAZO_MESES", descricao: 'Prazo com o extenso — "12 (doze)"' },
  { campo: "INICIO", descricao: "Início da locação" },
  { campo: "FIM", descricao: "Término da locação" },
  { campo: "DIA_VENCIMENTO", descricao: "Dia do mês em que o aluguel vence" },
  { campo: "ALUGUEL_VALOR", descricao: 'Valor do aluguel — "1.000,00"' },
  { campo: "ALUGUEL_EXTENSO", descricao: 'Valor por extenso — "Um mil reais"' },
  { campo: "CAUCAO", descricao: "Valor do depósito/caução" },
  { campo: "CAUCAO_EXTENSO", descricao: "Caução por extenso" },
  { campo: "MULTA", descricao: "Multa por atraso (%)" },
  { campo: "JUROS", descricao: "Juros ao mês (%)" },
  { campo: "REAJUSTE", descricao: "Índice de reajuste (IGP-M, IPCA...)" },
  { campo: "FINALIDADE", descricao: "Uso do imóvel (residencial / comercial)" },
  { campo: "FIADOR_NOME", descricao: "Nome do fiador" },
  { campo: "FIADOR_CPF", descricao: "CPF do fiador" },
  { campo: "FIADOR_RG", descricao: "RG do fiador" },
  { campo: "FIADOR_ENDERECO", descricao: "Endereço do fiador" },
  { campo: "FIADOR_TELEFONE", descricao: "Telefone do fiador" },
  { campo: "CIDADE_FORO", descricao: "Cidade do foro / da assinatura" },
  { campo: "ASSINATURA_DATA", descricao: 'Data da assinatura por extenso' },
  { campo: "HOJE", descricao: "A data de hoje, por extenso" },
];

/** Junta os pedaços de um endereço, pulando o que está em branco. */
function juntar(partes: (string | null | undefined)[], separador = ", "): string {
  return partes.map((p) => p?.trim()).filter(Boolean).join(separador);
}

/**
 * O endereço do imóvel do jeito que entra no contrato:
 * "Avenida Antonio Pereira Aragão, Nº 1867, Bairro CENTRO, São Mateus do
 * Maranhão – MA, CEP 65470-000".
 */
export function enderecoDoImovel(c: {
  property_street?: string | null;
  property_number?: string | null;
  property_complement?: string | null;
  property_district?: string | null;
  property_city?: string | null;
  property_state?: string | null;
  property_zip?: string | null;
}): string {
  const cidadeUf = juntar([c.property_city, c.property_state], " – ");
  return juntar([
    c.property_street,
    c.property_number ? `Nº ${c.property_number}` : null,
    c.property_complement,
    c.property_district ? `Bairro ${c.property_district}` : null,
    cidadeUf || null,
    c.property_zip ? `CEP ${c.property_zip}` : null,
  ]);
}

/** Endereço curto, para as listas da tela. */
export function enderecoCurto(c: {
  property_street?: string | null;
  property_number?: string | null;
  property_district?: string | null;
}): string {
  return juntar([
    c.property_street,
    c.property_number ? `Nº ${c.property_number}` : null,
    c.property_district,
  ]);
}

function reais(valor: number): string {
  return (Number(valor) || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function porcento(valor?: number | null): string {
  if (valor === null || valor === undefined) return "";
  const n = Number(valor);
  if (!n) return "";
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

/** Todos os campos do contrato, prontos para entrar no lugar de {{CAMPO}}. */
export function camposDoContrato(c: RentalContractView): Record<string, string> {
  const hoje = new Date();

  return {
    CODIGO: String(c.property_code ?? ""),

    INQUILINO_NOME: c.tenant_name ?? "",
    INQUILINO_RG: c.tenant_rg ?? "",
    INQUILINO_CPF: c.tenant_document ?? "",
    INQUILINO_NATURALIDADE: c.tenant_birthplace ?? "",
    INQUILINO_ESTADO_CIVIL: c.tenant_marital_status ?? "",
    INQUILINO_PROFISSAO: c.tenant_profession ?? "",
    // em partes desde a 113; contrato antigo sai com o endereço corrido
    INQUILINO_ENDERECO: enderecoPorExtenso(
      {
        rua: c.tenant_street,
        numero: c.tenant_number,
        complemento: c.tenant_complement,
        bairro: c.tenant_district,
        cidade: c.tenant_city,
        cep: c.tenant_zip,
      },
      c.tenant_address
    ),
    INQUILINO_TELEFONE: c.tenant_phone ?? "",

    IMOVEL_TIPO: rentalKindLabel(c.property_kind).toUpperCase(),
    IMOVEL_ENDERECO: enderecoDoImovel(c),
    IMOVEL_APELIDO: c.property_name ?? "",
    IMOVEL_CIDADE: c.property_city ?? "",
    IMOVEL_UF: c.property_state ?? "",
    IMOVEL_CEP: c.property_zip ?? "",
    IMOVEL_MATRICULA: c.property_registration ?? "",
    IMOVEL_IPTU: c.property_iptu_code ?? "",
    IMOVEL_AGUA: c.property_water_code ?? "",
    IMOVEL_LUZ: c.property_power_code ?? "",

    PRAZO_MESES: c.months ? numeroComExtenso(c.months) : "",
    INICIO: c.start_date ? formatDate(c.start_date) : "",
    FIM: c.end_date ? formatDate(c.end_date) : "",

    DIA_VENCIMENTO: String(c.due_day ?? ""),
    ALUGUEL_VALOR: reais(c.monthly_amount),
    ALUGUEL_EXTENSO: primeiraMaiuscula(valorPorExtenso(Number(c.monthly_amount) || 0)),
    CAUCAO: Number(c.deposit_amount) > 0 ? reais(c.deposit_amount) : "",
    CAUCAO_EXTENSO:
      Number(c.deposit_amount) > 0
        ? primeiraMaiuscula(valorPorExtenso(Number(c.deposit_amount)))
        : "",
    MULTA: porcento(c.late_fee_percent),
    JUROS: porcento(c.interest_percent),
    REAJUSTE: c.readjust_index ?? "",

    // A cláusula sexta fala do uso do imóvel; o contrato cadastrado é que diz
    // se é moradia ou comércio.
    FINALIDADE:
      c.purpose === "comercial" ? "comercial" : "residencial e de sua família",

    FIADOR_NOME: c.guarantor_name ?? "",
    FIADOR_CPF: c.guarantor_document ?? "",
    FIADOR_RG: c.guarantor_rg ?? "",
    // sem fiador, o campo fica vazio (linha para a caneta), não um endereço em branco
    FIADOR_ENDERECO: c.guarantor_name?.trim()
      ? enderecoPorExtenso(
          {
            rua: c.guarantor_street,
            numero: c.guarantor_number,
            complemento: c.guarantor_complement,
            bairro: c.guarantor_district,
            cidade: c.guarantor_city,
            cep: c.guarantor_zip,
          },
          c.guarantor_address
        )
      : c.guarantor_address ?? "",
    FIADOR_TELEFONE: c.guarantor_phone ?? "",

    CIDADE_FORO: c.forum_city ?? "São Mateus do Maranhão/MA",
    ASSINATURA_DATA: dataPorExtenso(c.signed_at ?? hoje),
    HOJE: dataPorExtenso(hoje),
  };
}

/**
 * Troca cada {{CAMPO}} pelo dado do contrato. Campo vazio vira linha em branco
 * para preencher à caneta; campo que não existe fica como está, para quem
 * estiver editando o modelo perceber o erro de digitação.
 */
export function preencherModelo(
  body: string,
  campos: Record<string, string>
): string {
  return body.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (original, campo: string) => {
    if (!(campo in campos)) return original;
    const valor = campos[campo]?.trim();
    return valor ? valor : LINHA_EM_BRANCO;
  });
}
