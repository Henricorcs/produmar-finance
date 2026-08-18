/**
 * Leitura segura do retorno de uma server action.
 *
 * Por que existe: quando uma server action estoura no servidor, o Next 14 não
 * rejeita a promise do cliente — devolve a resposta de erro (que não é RSC) e
 * resolve com `undefined` (ver `serverActionReducer`). Quem escreve o
 * `"error" in result` de sempre recebe um "Cannot use 'in' operator to search
 * for 'error' in undefined", o TypeError sobe até o error boundary e a tela
 * inteira vira "Application error: a client-side exception has occurred" —
 * apagando também o formulário que o usuário acabou de preencher.
 *
 * Então nenhuma tela deve confiar que a action respondeu: passe o retorno por
 * aqui e trate a mensagem.
 */
const SERVER_CRASH =
  "O servidor não concluiu a ação (erro interno). Tente de novo — se continuar, confira os logs do servidor e as migrations pendentes no Supabase.";

/** Mensagem de erro da action, ou null se deu certo. Nunca estoura. */
export function actionError(result: unknown): string | null {
  if (result === undefined || result === null) return SERVER_CRASH;
  if (typeof result !== "object") return null;
  if (!("error" in result)) return null;
  const message = (result as { error?: unknown }).error;
  return typeof message === "string" && message.trim() ? message : SERVER_CRASH;
}
