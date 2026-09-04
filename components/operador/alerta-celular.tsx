"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Share } from "lucide-react";
import {
  apagarInscricaoDeAviso,
  salvarInscricaoDeAviso,
} from "@/app/(app)/operador/actions";

/**
 * "AVISE MEU CELULAR QUANDO CHEGAR OS."
 *
 * A OS chegava calada: o escritório lançava e o funcionário só descobria ao
 * abrir o app por conta própria — ou quando alguém ligava. O telefonema fazia
 * papel de alerta, e é ele que este botão aposenta.
 *
 * A permissão TEM que nascer de um toque dele. Navegador nenhum deixa um site
 * pedir isso sozinho ao abrir, e é bom que seja assim: alerta que a pessoa não
 * pediu vira alerta que ela desliga.
 */

/** A chave pública, do jeito que o navegador exige (bytes, não texto). */
function chaveEmBytes(base64: string): ArrayBuffer {
  const completo = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const cru = atob(completo);
  const buffer = new ArrayBuffer(cru.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < cru.length; i++) bytes[i] = cru.charCodeAt(i);
  return buffer;
}

/** As chaves da inscrição vêm como buffer; o servidor guarda em texto. */
function chaveEmTexto(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

/** O app foi aberto pelo ícone da tela de início (e não por dentro do Safari)? */
function abertoComoApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // o jeito antigo do iPhone, que ainda é o que vale lá
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function ehIPhone(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

type Estado = "carregando" | "sem-suporte" | "precisa-instalar" | "desligado" | "ligado";

export function AlertaCelular() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    (async () => {
      const temSuporte =
        typeof navigator !== "undefined" &&
        "serviceWorker" in navigator &&
        typeof window !== "undefined" &&
        "PushManager" in window &&
        "Notification" in window;

      // No iPhone o aviso só existe dentro do app instalado. Aberto pelo
      // Safari, o PushManager nem aparece — então o recado certo é o caminho
      // da instalação, e não um "seu celular não dá".
      if (ehIPhone() && !abertoComoApp()) {
        setEstado("precisa-instalar");
        return;
      }
      if (!temSuporte) {
        setEstado("sem-suporte");
        return;
      }

      try {
        const registro = await navigator.serviceWorker.getRegistration();
        const inscricao = await registro?.pushManager.getSubscription();
        setEstado(inscricao && Notification.permission === "granted" ? "ligado" : "desligado");
      } catch {
        setEstado("desligado");
      }
    })();
  }, []);

  async function ligar() {
    setErro(null);
    setOcupado(true);
    try {
      const chave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!chave) {
        setErro("Os alertas ainda não foram configurados no servidor.");
        return;
      }

      const registro = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setErro(
          "Você recusou os avisos. Para ligar depois, libere as notificações do PRODUMAR nos ajustes do celular."
        );
        return;
      }

      const inscricao = await registro.pushManager.subscribe({
        // Todo aviso vai aparecer na tela. É exigência do navegador, e é a
        // regra certa: nada de mensagem invisível.
        userVisibleOnly: true,
        applicationServerKey: chaveEmBytes(chave),
      });

      const r = await salvarInscricaoDeAviso({
        endpoint: inscricao.endpoint,
        p256dh: chaveEmTexto(inscricao.getKey("p256dh")),
        auth: chaveEmTexto(inscricao.getKey("auth")),
        user_agent: navigator.userAgent.slice(0, 200),
      });
      if (r && "error" in r) {
        setErro(r.error ?? "Não consegui guardar a inscrição");
        return;
      }

      setEstado("ligado");
    } catch {
      setErro("Não consegui ligar os alertas neste aparelho.");
    } finally {
      setOcupado(false);
    }
  }

  async function desligar() {
    setOcupado(true);
    try {
      const registro = await navigator.serviceWorker.getRegistration();
      const inscricao = await registro?.pushManager.getSubscription();
      if (inscricao) {
        await apagarInscricaoDeAviso(inscricao.endpoint);
        await inscricao.unsubscribe();
      }
      setEstado("desligado");
    } catch {
      setErro("Não consegui desligar. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  if (estado === "carregando" || estado === "sem-suporte") return null;

  if (estado === "precisa-instalar") {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 dark:border-sky-900/50 bg-sky-50 dark:bg-sky-950/30 px-4 py-3">
        <Share className="w-5 h-5 text-sky-600 dark:text-sky-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-sky-800 dark:text-sky-300">
            Instale o app para ser avisado
          </p>
          <p className="text-[13px] text-sky-700 dark:text-sky-400/90">
            No iPhone o aviso só toca com o app na tela de início. Toque em{" "}
            <strong>Compartilhar</strong> aqui embaixo, escolha{" "}
            <strong>Adicionar à Tela de Início</strong> e abra o PRODUMAR por esse ícone.
          </p>
        </div>
      </div>
    );
  }

  if (estado === "ligado") {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3">
        <BellRing className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            Alertas ligados neste celular
          </p>
          <p className="text-[12px] text-emerald-700 dark:text-emerald-400/90">
            Você é avisado quando chega OS nova, mesmo com o app fechado.
          </p>
        </div>
        <button
          type="button"
          onClick={desligar}
          disabled={ocupado}
          aria-label="Desligar os alertas neste celular"
          className="w-9 h-9 flex items-center justify-center rounded-lg text-emerald-700/60 dark:text-emerald-400/60 hover:text-red-500 flex-shrink-0"
        >
          <BellOff className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-produmar-200 dark:border-slate-700 bg-produmar-50/50 dark:bg-slate-800/40 px-4 py-3 space-y-2">
      <div className="flex items-start gap-2.5">
        <Bell className="w-5 h-5 text-produmar-600 dark:text-produmar-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Quer ser avisado quando chegar OS?
          </p>
          <p className="text-[13px] text-slate-600 dark:text-slate-400">
            O celular toca sozinho, mesmo com o app fechado — sem precisar ficar abrindo
            pra ver se chegou.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={ligar}
        disabled={ocupado}
        className="w-full h-11 rounded-lg bg-produmar-600 text-white text-sm font-semibold disabled:opacity-60"
      >
        {ocupado ? "Ligando..." : "Ativar alertas neste celular"}
      </button>

      {erro && <p className="text-[12px] text-red-600 dark:text-red-400">{erro}</p>}
    </div>
  );
}
