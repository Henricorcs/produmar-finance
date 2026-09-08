"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/login/actions";

/**
 * FECHAR O SISTEMA — a saída, no pé da tela inicial.
 *
 * Dentro do módulo a barra tem o "Fechar módulo", que volta para cá. Aqui, o
 * que se fecha é o sistema inteiro: a sessão é encerrada e a próxima abertura
 * pede a senha de novo.
 *
 * Pergunta antes: no celular o dedo escorrega, e sair sem querer significa
 * digitar e-mail e senha para voltar ao mesmo lugar.
 */
export function BotaoFecharSistema() {
  const [saindo, iniciar] = useTransition();

  function fechar() {
    if (saindo) return;
    if (!confirm("Fechar o sistema? Para voltar você vai precisar entrar com sua senha.")) return;
    iniciar(() => {
      void signOutAction();
    });
  }

  return (
    <button
      type="button"
      onClick={fechar}
      disabled={saindo}
      className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-red-200 dark:border-red-900/60 bg-white dark:bg-slate-900 text-sm font-medium text-red-600 dark:text-red-400 shadow-sm transition-colors hover:bg-red-50 dark:hover:bg-red-950/40 active:scale-[0.97] disabled:opacity-70"
    >
      <LogOut className="w-4 h-4" />
      {saindo ? "Fechando…" : "Fechar o sistema"}
    </button>
  );
}
