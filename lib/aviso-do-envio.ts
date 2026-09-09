/**
 * O RECADO DE QUANDO O CELULAR NÃO TOCOU.
 *
 * O aviso embaixo do campo "enviar para" cobre o que dá para saber ANTES de
 * mandar: aquela pessoa tem aparelho inscrito? o servidor tem as chaves? Só que
 * o envio ainda pode falhar na hora — o caso mais comum é a inscrição vencida,
 * de quem apagou o app, trocou de aparelho ou limpou os dados. Nesse caso o
 * campo não avisa nada (o aparelho constava lá), o envio não entrega e a tela
 * fechava calada: quem mandou saía achando que o celular tinha tocado.
 *
 * Este arquivo é o texto desse recado, do lado do NAVEGADOR — por isso ele não
 * vive em lib/push.ts, que carrega a biblioteca de envio e só roda no servidor.
 */

/** Por que ninguém foi avisado. */
export type MotivoSemAviso = "sem-chaves" | "sem-aparelho" | "falhou";

const MOTIVOS: readonly string[] = ["sem-chaves", "sem-aparelho", "falhou"];

/**
 * Lê o motivo no retorno da action. Não estoura nem quando a action caiu e o
 * retorno veio como undefined (ver lib/action-result.ts).
 */
export function avisoNaoEntregue(result: unknown): MotivoSemAviso | null {
  if (!result || typeof result !== "object") return null;
  const motivo = (result as { avisoNaoEntregue?: unknown }).avisoNaoEntregue;
  return typeof motivo === "string" && MOTIVOS.includes(motivo)
    ? (motivo as MotivoSemAviso)
    : null;
}

/** O primeiro nome, para o recado falar da pessoa e não de "o destinatário". */
function primeiroNome(nome?: string | null): string {
  const limpo = nome?.trim().split(" ")[0];
  return limpo ? limpo : "Ele";
}

/**
 * O que dizer a quem acabou de mandar a OS. Sempre começa pelo que já está
 * garantido — a OS foi salva — para o recado não parecer que perdeu o serviço.
 */
export function recadoDoAvisoNaoEntregue(
  motivo: MotivoSemAviso,
  nome?: string | null
): string {
  const quem = primeiroNome(nome);

  if (motivo === "sem-chaves") {
    return (
      "A OS foi salva, mas nenhum celular vai tocar: os alertas não estão " +
      "configurados no servidor (faltam as chaves). A OS aparece normalmente " +
      "quando a pessoa abrir o app."
    );
  }

  if (motivo === "sem-aparelho") {
    return (
      `A OS foi salva, mas o celular de ${quem} NÃO tocou: o aparelho dele não ` +
      "está inscrito nos alertas — ou a inscrição venceu (app apagado, aparelho " +
      "novo, dados limpos).\n\n" +
      `Peça para ${quem} abrir o Painel de OS no celular dele e tocar em ` +
      '"Ativar alertas neste celular". A OS já está esperando por ele lá.'
    );
  }

  return (
    `A OS foi salva, mas não deu para fazer o celular de ${quem} tocar agora. ` +
    "A OS aparece para ele assim que abrir o app; se isso se repetir, peça para " +
    'ele ligar de novo os alertas no Painel de OS ("Ativar alertas neste celular").'
  );
}
