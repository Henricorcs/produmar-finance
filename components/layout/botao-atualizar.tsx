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
 * A cópia da tela do vaqueiro também é jogada fora, e é de propósito: ela se
 * refaz na primeira abertura com sinal, e o vaqueiro nem chega neste botão (o
 * hub de módulos não é tela dele).
 */
export function BotaoAtualizar() {
  const [rodando, setRodando] = useState(false);

  async function atualizar() {
    if (rodando) return;
    setRodando(true);

    try {
      if ("serviceWorker" in navigator) {
        const registros = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registros.map((r) => r.update().catch(() => {})));
      }
      if ("caches" in window) {
        const nomes = await caches.keys();
        await Promise.all(nomes.map((n) => caches.delete(n)));
      }
    } catch {
      // Se a limpeza falhar, o recarregar abaixo ainda resolve na maioria das
      // vezes — não é motivo para deixar a pessoa sem atualizar.
    }

    // Endereço novo a cada toque: garante que o iPhone busque a página no
    // servidor em vez de devolver a que ele já tinha na mão.
    window.location.replace(`/inicio?atualizado=${Date.now()}`);
  }

  return (
    <button
      type="button"
      onClick={atualizar}
      disabled={rodando}
      className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-produmar-100 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-medium text-produmar-700 dark:text-slate-200 shadow-sm transition-colors hover:bg-produmar-50 dark:hover:bg-slate-800 active:scale-[0.97] disabled:opacity-70"
      aria-label="Atualizar o app"
    >
      <RefreshCw className={`w-4 h-4 ${rodando ? "animate-spin" : ""}`} />
      {rodando ? "Atualizando…" : "Atualizar"}
    </button>
  );
}
