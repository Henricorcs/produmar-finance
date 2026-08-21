import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { USER_ID_HEADER } from "@/lib/auth-header";

export { USER_ID_HEADER };

/**
 * Id do usuário da requisição.
 *
 * O middleware já bateu no Supabase (getUser, com rede) e conferiu a sessão
 * antes da página rodar — repetir a chamada aqui é uma ida e volta jogada
 * fora. Lemos o id do header e só caímos no getUser() se ele não veio (rota
 * fora do matcher do middleware).
 *
 * O cache() é por requisição: layout e página chamam à vontade, a busca
 * acontece uma vez só.
 */
export const getCurrentUserId = cache(async (): Promise<string | null> => {
  const fromMiddleware = headers().get(USER_ID_HEADER);
  if (fromMiddleware) return fromMiddleware;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
});

/**
 * Perfil do usuário da requisição, buscado uma vez por requisição. Layout e
 * página compartilham o mesmo resultado em vez de consultar a mesma linha duas
 * vezes.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const id = await getCurrentUserId();
  if (!id) return null;

  const supabase = createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", id).single();
  return (data as Profile | null) ?? null;
});
