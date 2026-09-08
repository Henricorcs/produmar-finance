"use server";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { avisosConfigurados, temAparelhoAvisavel } from "@/lib/push";

/**
 * A INSCRIÇÃO DO APARELHO PARA RECEBER AVISO DE OS.
 *
 * Quem se inscreve é o navegador do funcionário, no aparelho dele: ele toca em
 * "Ativar alertas", o navegador pede a permissão e devolve um endereço só
 * daquele aparelho, com duas chaves. É isso que é guardado (migration 085) —
 * nenhum dado de OS passa por aqui.
 */

/**
 * A CHAVE PÚBLICA DOS AVISOS, LIDA NO SERVIDOR.
 *
 * Ela é pública de verdade — vai para o navegador de todo mundo que ativa os
 * alertas. Mesmo assim NÃO dá para embutir no código pelo NEXT_PUBLIC_, e a
 * primeira tentativa morreu exatamente aí: o build acontece dentro do EasyPanel
 * antes das variáveis de ambiente existirem, então a chave saía do forno como
 * texto vazio. O botão dizia "não configurado" com a chave salva ali do lado,
 * e nada no app apontava para a causa.
 *
 * Lida aqui, vale na hora em que a tela pergunta. Trocar a chave passa a ser
 * salvar e reiniciar — sem precisar construir o app de novo.
 */
export async function chavePublicaDeAviso(): Promise<{ chave: string | null }> {
  return { chave: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null };
}

interface Inscricao {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string | null;
}

export async function salvarInscricaoDeAviso(inscricao: Inscricao) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  if (!inscricao?.endpoint || !inscricao.p256dh || !inscricao.auth)
    return { error: "Inscrição incompleta — tente ativar de novo" };

  // O navegador troca a inscrição de tempos em tempos e reenvia a mesma do
  // mesmo aparelho. Por endpoint: atualiza em vez de encher a tabela de linhas
  // repetidas do mesmo celular.
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: inscricao.endpoint,
      p256dh: inscricao.p256dh,
      auth: inscricao.auth,
      user_agent: inscricao.user_agent ?? null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );

  if (error) {
    if (error.message.includes("push_subscriptions"))
      return { error: "Rode a migration 085 no Supabase para ligar os alertas" };
    return { error: error.message };
  }

  return { ok: true };
}

/** "Não quero mais ser avisado neste aparelho." */
export async function apagarInscricaoDeAviso(endpoint: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  return { ok: true };
}

/**
 * O CELULAR DESTE FUNCIONÁRIO VAI TOCAR?
 *
 * Serve para a tela de quem LANÇA a OS: antes, mandar OS para quem nunca ligou
 * os alertas dava exatamente a mesma tela de quem recebe o aviso na hora — o
 * chefe achava que o celular tinha tocado e o funcionário só via a OS quando
 * abria o app por conta própria. Foi o que aconteceu com a OS do Jeferson.
 *
 * Devolve só sim/não: nenhum endereço de aparelho sai daqui. E responde apenas
 * a quem manda OS; para os outros devolve "está tudo certo", que é o jeito de
 * não alarmar quem não pode resolver.
 */
export async function situacaoDoAlerta(
  userId: string
): Promise<{ configurado: boolean; ligado: boolean }> {
  const tudoCerto = { configurado: true, ligado: true };
  if (!userId) return tudoCerto;

  const perfil = await getProfile();
  const podePerguntar =
    perfil?.role === "admin" || perfil?.role === "financeiro" || perfil?.role === "encarregado";
  if (!podePerguntar) return tudoCerto;

  return {
    configurado: avisosConfigurados(),
    ligado: await temAparelhoAvisavel(userId),
  };
}
