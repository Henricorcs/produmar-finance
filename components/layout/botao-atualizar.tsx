"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * ATUALIZAR O APP — o botão que troca a versão sem fechar e abrir de novo.
 *
 * Depois de uma implantação o aparelho continua com a versão velha na mão: no
 * iPhone o app fica guardado na memória e volta do jeito que estava quando saiu
 * da tela. A saída era fechar o app de vez e abrir — e quem não sabe disso fica
 * dias sem ver o que já subiu.
 *
 * Este botão faz o que fechar e abrir faria, e um pouco mais:
 *   1. manda o ajudante do app (service worker) procurar versão nova;
 *   2. joga fora as cópias guardadas no aparelho;
 *   3. recarrega a tela buscando tudo do servidor.
 *
 * Ele mora na barra de cima, ao lado do bloco de notas — antes ficava só no hub
 * de módulos, que nem todo perfil abre.
 */
export function BotaoAtualizar() {
  const [rodando, setRodando] = useState(false);

  async function atualizar() {
    if (rodando) return;
    setRodando(true);

    // SEM SINAL, NÃO JOGA NADA FORA. Antes este botão só existia no hub e o
    // vaqueiro nunca chegava nele; agora ele está na barra de toda tela, e a
    // tela do vaqueiro é justamente a que funciona no mato sem rede. Apagar as
    // cópias guardadas ali deixaria o app sem nada para abrir até voltar o
    // sinal — e não haveria versão nova para buscar de qualquer jeito.
    const semSinal = typeof navigator !== "undefined" && navigator.onLine === false;

    try {
      if (!semSinal && "serviceWorker" in navigator) {
        const registros = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registros.map((r) => r.update().catch(() => {})));
      }
      if (!semSinal && "caches" in window) {
        const nomes = await caches.keys();
        await Promise.all(nomes.map((n) => caches.delete(n)));
      }
    } catch {
      // Se a limpeza falhar, o recarregar abaixo ainda resolve na maioria das
      // vezes — não é motivo para deixar a pessoa sem atualizar.
    }

    // Recarrega A TELA EM QUE ELA ESTÁ (o botão agora aparece em todas), com
    // endereço novo a cada toque: assim o iPhone busca a página no servidor em
    // vez de devolver a que ele já tinha na mão.
    const url = new URL(window.location.href);
    url.searchParams.set("atualizado", String(Date.now()));
    window.location.replace(url.toString());
  }

  return (
    <button
      type="button"
      onClick={atualizar}
      disabled={rodando}
      className="w-10 h-10 sm:w-9 sm:h-9 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors disabled:opacity-70"
      aria-label="Atualizar o app"
      title="Atualizar o app"
    >
      <RefreshCw className={`w-5 h-5 ${rodando ? "animate-spin" : ""}`} />
    </button>
  );
}
