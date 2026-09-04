import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * O AVISO QUE FAZ O CELULAR DO FUNCIONÁRIO APITAR.
 *
 * Antes, a OS chegava calada: o escritório lançava e o funcionário só ficava
 * sabendo quando abria o app por conta própria — ou quando alguém ligava pra
 * avisar. O telefonema era o alerta, e é ele que isto aqui aposenta.
 *
 * Como funciona, sem mistério: o navegador do aparelho guarda uma "inscrição"
 * (migration 085) e o servidor manda a mensagem para o serviço de avisos do
 * próprio navegador — Apple no iPhone, Google no Android —, que entrega e faz
 * o aparelho tocar. Nada disso passa por operadora nem custa mensagem.
 *
 * REGRA DE OURO: avisar é o acessório, nunca o principal. Se o aviso falhar, a
 * OS continua lançada do mesmo jeito. Por isso tudo aqui é silencioso: erro de
 * envio não derruba a ação de quem estava trabalhando.
 */

/** Nome que aparece no serviço de avisos como responsável pelo envio. */
const CONTATO = "mailto:produmar.ma@hotmail.com";

/** Configura as chaves uma vez só. Sem chaves, não há como assinar o envio. */
function chavesProntas(): boolean {
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!publica || !privada) return false;

  webpush.setVapidDetails(CONTATO, publica, privada);
  return true;
}

export interface AvisoDoCelular {
  titulo: string;
  corpo: string;
  /** Para onde a tela vai quando ele toca no aviso. */
  url?: string;
  /** Junta avisos do mesmo assunto em vez de empilhar vários. */
  assunto?: string;
}

/**
 * Manda o aviso para TODOS os aparelhos daquela pessoa (ela pode ter celular e
 * tablet). Devolve quantos foram entregues — útil para a tela dizer se o
 * funcionário está mesmo alcançável.
 *
 * Inscrição morta (app apagado, permissão revogada, dados limpos) é apagada
 * aqui mesmo: o serviço de avisos responde 404 ou 410 e a linha some sozinha,
 * sem faxina manual.
 */
export async function avisarNoCelular(
  userId: string,
  aviso: AvisoDoCelular
): Promise<number> {
  if (!userId || !chavesProntas()) return 0;

  try {
    const supabase = createAdminClient();
    const { data: inscricoes } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);

    if (!inscricoes || inscricoes.length === 0) return 0;

    const carga = JSON.stringify({
      titulo: aviso.titulo,
      corpo: aviso.corpo,
      url: aviso.url ?? "/operador",
      assunto: aviso.assunto ?? "produmar",
    });

    const mortas: string[] = [];
    let entregues = 0;

    await Promise.all(
      inscricoes.map(async (i) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: i.endpoint as string,
              keys: { p256dh: i.p256dh as string, auth: i.auth as string },
            },
            carga,
            // O aviso espera até 12h por um celular desligado ou sem sinal —
            // no pasto isso é rotina. Passou disso, a OS já não é novidade.
            { TTL: 60 * 60 * 12, urgency: "high" }
          );
          entregues++;
        } catch (e) {
          const status = (e as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) mortas.push(i.id as string);
        }
      })
    );

    if (mortas.length > 0) {
      await supabase.from("push_subscriptions").delete().in("id", mortas);
    }

    return entregues;
  } catch {
    // Avisar é acessório: o que importava (a OS) já está gravado.
    return 0;
  }
}
