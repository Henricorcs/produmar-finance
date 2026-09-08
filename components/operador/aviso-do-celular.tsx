"use client";

import { useEffect, useState } from "react";
import { BellOff } from "lucide-react";
import { situacaoDoAlerta } from "@/app/(app)/operador/actions";

/**
 * "O CELULAR DELE VAI TOCAR?" — o recado embaixo do campo "enviar para".
 *
 * A OS que vai para alguém que nunca ligou os alertas dava a mesma tela da que
 * chega apitando: quem lançava saía achando que o funcionário foi avisado, e o
 * funcionário só descobria a OS ao abrir o app por conta própria. Este aviso
 * existe para essa diferença aparecer na hora de mandar, e não depois.
 *
 * Some sozinho quando está tudo certo — quem recebe aviso não precisa ler nada.
 */
export function AvisoDoCelular({
  userId,
  nome,
}: {
  userId?: string | null;
  nome?: string | null;
}) {
  const [situacao, setSituacao] = useState<{ configurado: boolean; ligado: boolean } | null>(
    null
  );

  useEffect(() => {
    if (!userId) {
      setSituacao(null);
      return;
    }
    let valendo = true;
    situacaoDoAlerta(userId)
      .then((s) => {
        if (valendo) setSituacao(s ?? null);
      })
      .catch(() => {
        // Falhou a pergunta: melhor não dizer nada do que dizer errado.
        if (valendo) setSituacao(null);
      });
    return () => {
      valendo = false;
    };
  }, [userId]);

  if (!userId || !situacao) return null;
  if (situacao.configurado && situacao.ligado) return null;

  const quem = nome?.trim() ? nome.trim().split(" ")[0] : "Ele";

  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2">
      <BellOff className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
      <p className="text-[12px] leading-snug text-amber-800 dark:text-amber-300">
        {situacao.configurado ? (
          <>
            <strong>O celular de {quem} não vai tocar.</strong> Ele ainda não ligou os
            alertas no aparelho dele — a OS aparece normalmente quando ele abrir o app.
            Para o celular apitar, peça para ele abrir o painel dele e tocar em{" "}
            <em>Ativar alertas neste celular</em>.
          </>
        ) : (
          <>
            <strong>Nenhum celular vai tocar.</strong> Os alertas não estão configurados no
            servidor (faltam as chaves VAPID). A OS é lançada do mesmo jeito.
          </>
        )}
      </p>
    </div>
  );
}
