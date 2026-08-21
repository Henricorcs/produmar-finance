/**
 * Nome do header onde o middleware deixa o id do usuário já conferido.
 *
 * Fica num arquivo só dele, SEM imports, porque o middleware roda no Edge e
 * não pode arrastar `next/headers` nem o cliente de servidor do Supabase para
 * o bundle — mesmo cuidado do lib/module-access.ts.
 */
export const USER_ID_HEADER = "x-user-id";
