"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// FALAR NO LUGAR DE DIGITAR
// ─────────────────────────────────────────────────────────────────────────────
// Quem está no pátio, com a mão suja e o celular no ombro, não digita "CONTA DE
// ENERGIA DA SEDE" — fala. Este botão põe o microfone dentro do campo: toca,
// fala, e o que foi dito entra escrito, depois do que já estava lá.
//
// Quem escuta é o próprio aparelho (o mesmo reconhecimento de voz do teclado do
// celular, em português). Nada de áudio sai daqui: não há gravação, não há
// arquivo e não há servidor nenhum no meio — o navegador entrega o texto pronto.
//
// ── O QUE NÃO PODE ACONTECER ────────────────────────────────────────────────
// O microfone preso. Enquanto o reconhecimento está de pé ele segura o áudio do
// aparelho, e no iPhone isso trava o teclado: a pessoa toca no campo e não
// consegue escrever. Foi o que aconteceu na primeira versão, que pedia escuta
// contínua — coisa que o Safari não faz: a fala nunca terminava, nada voltava
// escrito e o campo ficava mudo.
//
// Daí as travas desta versão, todas com o mesmo fim (soltar o microfone):
//   • escuta UMA fala por vez, que é o que o iPhone sabe fazer;
//   • tocou em qualquer lugar fora do botão (no campo, por exemplo), desliga;
//   • 8s sem ouvir nada, desliga e avisa;
//   • 20s no total, desliga de qualquer jeito;
//   • saiu da tela ou trocou de app, desliga.
// Nenhum caminho deixa o microfone ligado sozinho.

/** O pouco da API de voz do navegador que usamos — o TypeScript não a conhece. */
interface ResultadoFala {
  isFinal: boolean;
  0: { transcript: string };
}
interface EventoFala {
  resultIndex: number;
  results: { length: number; [i: number]: ResultadoFala };
}
interface Reconhecedor {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: EventoFala) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function pegarReconhecedor(): (new () => Reconhecedor) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Reconhecedor;
    webkitSpeechRecognition?: new () => Reconhecedor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Emenda o que foi falado no que já estava escrito. */
function juntar(base: string, dito: string, separador = " "): string {
  const antes = base.replace(/\s+$/, "");
  if (!dito) return antes;
  if (!antes) return dito;
  return antes + separador + dito;
}

/** Este aparelho sabe ouvir? Só depois de montar — no servidor não há navegador. */
export function useSuportaDitado(): boolean {
  const [suporta, setSuporta] = useState(false);
  useEffect(() => setSuporta(!!pegarReconhecedor()), []);
  return suporta;
}

/**
 * Escreve no campo por fora do React.
 *
 * O sistema tem campo controlado (o valor mora num useState) e campo solto
 * (defaultValue). Mexer no `value` do elemento não avisa nem um nem outro: o
 * React guarda o último valor que ele mesmo escreveu e, sem esse aviso, ignora
 * a mudança. Usando o setter original do navegador e disparando um `input` de
 * mentira, a tela reage como se a pessoa tivesse digitado — e a máscara do
 * campo (caixa alta, formatação) roda igual.
 */
export function escreverNoCampo(
  campo: HTMLInputElement | HTMLTextAreaElement,
  texto: string
): void {
  const molde =
    campo instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(molde, "value")?.set;
  if (setter) setter.call(campo, texto);
  else campo.value = texto;
  campo.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Sem nada ouvido nesse tempo, desliga e avisa. */
const TEMPO_SEM_RESPOSTA = 8000;
/** Teto de uma fala, aconteça o que acontecer. */
const TEMPO_MAXIMO = 20000;

interface Props {
  /** O que já está escrito no campo — o ditado entra depois disso. */
  atual?: string;
  /** Idem, para quem só sabe o texto na hora de começar (campo solto no DOM). */
  lerAtual?: () => string;
  /** Devolve o campo inteiro (o que estava + o que foi falado). */
  onTexto: (texto: string) => void;
  /** O que entra entre o texto de antes e o falado: espaço, ou quebra de linha
   *  para cada fala virar uma linha nova (é o caso do bloco de notas). */
  separador?: string;
  /** Ex.: "Ditar a descrição" — é o que o leitor de tela fala. */
  rotulo?: string;
  className?: string;
  disabled?: boolean;
}

export function BotaoDitado({
  atual = "",
  lerAtual,
  separador = " ",
  onTexto,
  rotulo = "Ditar",
  className,
  disabled,
}: Props) {
  const suporta = useSuportaDitado();
  const [ouvindo, setOuvindo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const botaoRef = useRef<HTMLButtonElement>(null);
  const recRef = useRef<Reconhecedor | null>(null);
  const baseRef = useRef("");   // o texto que já estava no campo quando começou
  const finaisRef = useRef(""); // o que já foi reconhecido em definitivo
  const timerVazioRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerTetoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const atualRef = useRef(atual);
  const lerAtualRef = useRef(lerAtual);
  const separadorRef = useRef(separador);
  const onTextoRef = useRef(onTexto);

  useEffect(() => {
    atualRef.current = atual;
  }, [atual]);
  useEffect(() => {
    separadorRef.current = separador;
  }, [separador]);
  useEffect(() => {
    lerAtualRef.current = lerAtual;
  }, [lerAtual]);
  useEffect(() => {
    onTextoRef.current = onTexto;
  }, [onTexto]);

  const limparEspera = useCallback(() => {
    if (timerVazioRef.current) clearTimeout(timerVazioRef.current);
    timerVazioRef.current = null;
  }, []);

  const limparTimers = useCallback(() => {
    limparEspera();
    if (timerTetoRef.current) clearTimeout(timerTetoRef.current);
    timerTetoRef.current = null;
  }, [limparEspera]);

  /** Desliga o microfone e devolve o teclado. Pode ser chamado à vontade. */
  const parar = useCallback(
    (recado?: string) => {
      limparTimers();
      setOuvindo(false);
      if (recado) setAviso(recado);
      const rec = recRef.current;
      recRef.current = null;
      if (!rec) return;
      try {
        rec.stop(); // stop() ainda entrega o que ouviu
      } catch {
        /* já estava parado */
      }
      // Não encerrou sozinho? Corta na marra — microfone preso é o pior caso.
      setTimeout(() => {
        try {
          rec.abort();
        } catch {
          /* nada a fazer */
        }
      }, 1500);
    },
    [limparTimers]
  );

  // Saiu da tela, trocou de app, bloqueou o celular: desliga.
  useEffect(() => {
    return () => {
      limparTimers();
      try {
        recRef.current?.abort();
      } catch {
        /* nada a fazer */
      }
      recRef.current = null;
    };
  }, [limparTimers]);

  useEffect(() => {
    if (!ouvindo) return;
    const aoSumir = () => {
      if (document.visibilityState === "hidden") parar();
    };
    // Tocar em qualquer outro lugar — no próprio campo, por exemplo — desliga o
    // microfone. É o que devolve o teclado para quem quer terminar digitando.
    const aoTocarFora = (e: Event) => {
      if (botaoRef.current?.contains(e.target as Node)) return;
      parar();
    };
    document.addEventListener("visibilitychange", aoSumir);
    document.addEventListener("pointerdown", aoTocarFora, true);
    return () => {
      document.removeEventListener("visibilitychange", aoSumir);
      document.removeEventListener("pointerdown", aoTocarFora, true);
    };
  }, [ouvindo, parar]);

  // O aviso some sozinho.
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);

  const ouvir = useCallback(() => {
    const Reconhecimento = pegarReconhecedor();
    if (!Reconhecimento) return;

    setAviso(null);
    const rec = new Reconhecimento();
    rec.lang = "pt-BR";
    // UMA fala por vez: é o que o iPhone entrega, e é o que garante que o
    // microfone se solte na primeira pausa.
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    baseRef.current = lerAtualRef.current ? lerAtualRef.current() : atualRef.current;
    finaisRef.current = "";

    rec.onresult = (e) => {
      // Veio texto: cai a espera do "não ouvi nada", mas o teto continua de pé.
      limparEspera();
      let parcial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const texto = r[0].transcript.trim();
        if (!texto) continue;
        if (r.isFinal) finaisRef.current = juntar(finaisRef.current, texto);
        else parcial = juntar(parcial, texto);
      }
      onTextoRef.current(
        juntar(baseRef.current, juntar(finaisRef.current, parcial), separadorRef.current)
      );
    };

    rec.onerror = (e) => {
      // Sem alert: recado que trava a tela, na tela que acabou de travar, não.
      if (e.error === "no-speech") return parar("Não ouvi nada. Toque e fale de novo.");
      if (e.error === "aborted") return parar();
      if (e.error === "not-allowed" || e.error === "service-not-allowed")
        return parar("Libere o microfone para o PRODUMAR nos ajustes do aparelho.");
      parar("Não consegui ouvir. Use o microfone do teclado.");
    };

    rec.onend = () => {
      limparTimers();
      recRef.current = null;
      setOuvindo(false);
    };

    recRef.current = rec;
    setOuvindo(true);
    try {
      rec.start();
    } catch {
      parar();
      return;
    }

    limparTimers();
    // Ficou de pé sem devolver nada: é o caso do aparelho que aceita ligar o
    // microfone mas não entrega texto. Solta e diz o que fazer.
    timerVazioRef.current = setTimeout(
      () => parar("Não consegui ouvir. Use o microfone do teclado."),
      TEMPO_SEM_RESPOSTA
    );
    timerTetoRef.current = setTimeout(() => parar(), TEMPO_MAXIMO);
  }, [limparEspera, limparTimers, parar]);

  if (!suporta) return null;

  return (
    <button
      ref={botaoRef}
      type="button"
      onClick={() => (ouvindo ? parar() : ouvir())}
      disabled={disabled}
      aria-label={ouvindo ? "Parar de ditar" : rotulo}
      title={ouvindo ? "Parar de ditar" : rotulo}
      className={cn(
        "relative flex items-center justify-center w-9 h-9 rounded-lg transition-colors shrink-0",
        ouvindo
          ? "bg-red-500 text-white animate-pulse"
          : "text-produmar-600 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-slate-700",
        "disabled:opacity-50 disabled:pointer-events-none",
        className
      )}
    >
      <Mic className="w-5 h-5" />
      {aviso && (
        <span className="absolute bottom-full right-0 mb-1.5 z-10 w-max max-w-[220px] text-right rounded-md bg-slate-900 text-white text-[11px] leading-snug px-2 py-1 shadow-lg">
          {aviso}
        </span>
      )}
    </button>
  );
}
