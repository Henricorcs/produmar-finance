/**
 * Máquina pesada lançada junto com a diária (migration 132).
 *
 * O colaborador operou a retro, o trator, a carregadeira: o encarregado anota
 * o horímetro de quando começou e de quando parou, e a conta sai daqui —
 * horas = final − inicial, valor = horas × valor da hora da máquina. É esse
 * valor que entra no custo da obra da diária.
 *
 * A mesma conta roda na tela (para mostrar antes de lançar) e no servidor
 * (para validar o que chegou). Ficar num lugar só é o que garante que o número
 * que o encarregado viu é o mesmo que foi para a obra.
 */

/** Mais que isso num dia é horímetro digitado errado (um zero a mais). */
export const MAX_HORAS_NO_DIA = 24;

/**
 * Lê o horímetro digitado do jeito brasileiro ("1.234,5", "1234,5") e também
 * com ponto decimal ("1234.5"), que é o que alguns teclados mandam.
 *
 * Com vírgula, o ponto é milhar. Sem vírgula, um ponto seguido de 1 ou 2
 * dígitos é decimal (horímetro marca décimos, nunca milésimos); qualquer
 * outro ponto é milhar. Vazio ou lixo → null.
 */
export function lerHorimetro(texto: string | null | undefined): number | null {
  const t = (texto ?? "").trim().replace(/\s/g, "");
  if (!t) return null;
  let normal: string;
  if (t.includes(",")) normal = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d+\.\d{1,2}$/.test(t)) normal = t;
  else normal = t.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(normal)) return null;
  const n = Number(normal);
  // o banco guarda 2 casas: a conta da tela tem que ser a mesma do banco
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Horas usadas: final − inicial, com 2 casas. Null se falta um dos dois. */
export function horasDaMaquina(inicial: number | null, final: number | null): number | null {
  if (inicial == null || final == null) return null;
  return Math.round((final - inicial) * 100) / 100;
}

/** Valor da máquina na obra: horas × valor da hora, com 2 casas. */
export function valorDaMaquina(horas: number | null, valorHora: number | null): number {
  if (horas == null || horas <= 0 || !valorHora || valorHora <= 0) return 0;
  return Math.round(horas * valorHora * 100) / 100;
}

/**
 * O que está errado no horímetro, em português de quem está na rua — ou null
 * quando está tudo certo.
 */
export function erroDoHorimetro(inicial: number | null, final: number | null): string | null {
  if (inicial == null) return "Preencha o horímetro inicial da máquina";
  if (final == null) return "Preencha o horímetro final da máquina";
  if (inicial < 0 || final < 0) return "O horímetro não pode ser negativo";
  if (final <= inicial) return "O horímetro final tem que ser maior que o inicial";
  const horas = horasDaMaquina(inicial, final) ?? 0;
  if (horas > MAX_HORAS_NO_DIA)
    return `Deu ${horas.toLocaleString("pt-BR")} horas num dia só — confira o horímetro`;
  return null;
}

/**
 * Um serviço que está começando: o inicial é obrigatório e o final pode ficar
 * para depois. Quando o final vem junto, valem as regras completas.
 */
export function erroDoNovoServico(inicial: number | null, final: number | null): string | null {
  if (final != null) return erroDoHorimetro(inicial, final);
  if (inicial == null) return "Preencha o horímetro inicial da máquina";
  if (inicial < 0) return "O horímetro não pode ser negativo";
  return null;
}

/** A diária tem serviço de máquina esperando o horímetro final? */
export function temServicoAberto(dia: {
  servicos_maquina?: { hourmeter_end: number | null }[];
}): boolean {
  return (dia.servicos_maquina ?? []).some((s) => s.hourmeter_end == null);
}

/**
 * As máquinas que aparecem na pergunta "Usou máquina pesada?": as ativas que
 * marcam HORÍMETRO (caminhão e caçamba marcam km — não são o caso aqui). Se o
 * cadastro não tiver nenhuma de horímetro, mostra todas as ativas, para a
 * pergunta nunca ficar sem resposta.
 */
export function maquinasPesadas<
  T extends { active?: boolean | null; tracking_type?: string | null },
>(machines: T[]): T[] {
  const ativas = machines.filter((m) => m.active !== false);
  const deHorimetro = ativas.filter((m) => (m.tracking_type ?? "hourmeter") === "hourmeter");
  return deHorimetro.length > 0 ? deHorimetro : ativas;
}

/** "2,5 h" — horas legíveis, sem casa sobrando. */
export function formatHoras(horas: number): string {
  return `${horas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} h`;
}
