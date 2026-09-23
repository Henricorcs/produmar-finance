/** Valida CPF (11 dígitos) ou CNPJ (14 dígitos) pelo dígito verificador. */
export function validarCpfCnpj(valor: string): boolean {
  const digitos = (valor ?? "").replace(/\D/g, "");
  if (digitos.length === 11) return validarCpf(digitos);
  if (digitos.length === 14) return validarCnpj(digitos);
  return false;
}

/** "CPF" ou "CNPJ" pela quantidade de dígitos — null se não for nenhum dos dois. */
export function tipoDocumento(valor: string): "CPF" | "CNPJ" | null {
  const digitos = (valor ?? "").replace(/\D/g, "");
  if (digitos.length === 11) return "CPF";
  if (digitos.length === 14) return "CNPJ";
  return null;
}

function validarCpf(cpf: string): boolean {
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  for (const posFinal of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < posFinal; i++) soma += Number(cpf[i]) * (posFinal + 1 - i);
    const resto = (soma * 10) % 11;
    const digitoEsperado = resto === 10 ? 0 : resto;
    if (digitoEsperado !== Number(cpf[posFinal])) return false;
  }
  return true;
}

function validarCnpj(cnpj: string): boolean {
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcularDigito = (base: string): number => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const primeiroDigito = calcularDigito(cnpj.slice(0, 12));
  if (primeiroDigito !== Number(cnpj[12])) return false;

  const segundoDigito = calcularDigito(cnpj.slice(0, 13));
  return segundoDigito === Number(cnpj[13]);
}
