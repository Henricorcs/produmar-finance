import { enderecoPorExtenso, type EnderecoEmPartes } from "./compra-venda-contrato";
import type { Loan } from "./types";

type ComEndereco = Pick<
  Loan,
  | "borrower_address"
  | "borrower_street"
  | "borrower_number"
  | "borrower_complement"
  | "borrower_district"
  | "borrower_city"
  | "borrower_state"
  | "borrower_zip"
>;

/** As partes do endereço do devedor (migration 144); cidade e UF saem juntas: "SÃO LUÍS/MA". */
export function partesDoEnderecoDoDevedor(l: Partial<ComEndereco>): EnderecoEmPartes {
  const cidade = [l.borrower_city?.trim(), l.borrower_state?.trim()].filter(Boolean).join("/");
  return {
    rua: l.borrower_street,
    numero: l.borrower_number,
    complemento: l.borrower_complement,
    bairro: l.borrower_district,
    cidade,
    cep: l.borrower_zip,
  };
}

/**
 * O endereço do devedor numa linha só: "RUA X, nº 10, bairro CENTRO,
 * SÃO LUÍS/MA, CEP 65000-000". Dívida de antes da 144, sem as partes,
 * continua saindo com o endereço corrido que tinha. Vazio = "".
 */
export function enderecoDoDevedor(l: Partial<ComEndereco>): string {
  return enderecoPorExtenso(partesDoEnderecoDoDevedor(l), l.borrower_address, false);
}
