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
// Aparelho que não sabe ouvir não ganha botão: some sem erro, e o microfone do
// teclado continua ali para quem quiser.

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
function juntar(base: string, dito: string): string {
  const antes = base.replace(/\s+$/, "");
  if (!dito) return antes;
  if (!antes) return dito;
  return `${antes} ${dito}`;
}

interface Props {
  /** O que já está escrito no campo — o ditado entra depois disso. */
  atual?: string;
  /** Devolve o campo inteiro (o que estava + o que foi falado). */
  onTexto: (texto: string) => void;
  /** Ex.: "Ditar a descrição" — é o que o leitor de tela fala. */
  rotulo?: string;
  className?: string;
  disabled?: boolean;
}

export function BotaoDitado({ atual = "", onTexto, rotulo = "Ditar", className, disabled }: Props) {
  const [suporta, setSuporta] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);

  const recRef = useRef<Reconhecedor | null>(null);
  const baseRef = useRef("");   // o texto que já estava no campo quando começou
  const finaisRef = useRef(""); // o que já foi reconhecido em definitivo
  const atualRef = useRef(atual);
  const onTextoRef = useRef(onTexto);

  useEffect(() => {
    atualRef.current = atual;
  }, [atual]);
  useEffect(() => {
    onTextoRef.current = onTexto;
  }, [onTexto]);

  // Só existe botão onde o aparelho sabe ouvir.
  useEffect(() => {
    setSuporta(!!pegarReconhecedor());
  }, []);

  // Saiu da tela no meio da fala: desliga o microfone.
  useEffect(() => {
    return () => {
      recRef.current?.abort();
      recRef.current = null;
    };
  }, []);

  const parar = useCallback(() => {
    recRef.current?.stop();
    setOuvindo(false);
  }, []);

  const ouvir = useCallback(() => {
    const Reconhecimento = pegarReconhecedor();
    if (!Reconhecimento) return;

    const rec = new Reconhecimento();
    rec.lang = "pt-BR";
    // No iPhone o reconhecimento é de uma fala por vez: ele encerra sozinho na
    // pausa. Onde dá para continuar (Android, computador), continua.
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    baseRef.current = atualRef.current;
    finaisRef.current = "";

    rec.onresult = (e) => {
      let parcial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const texto = r[0].transcript.trim();
        if (!texto) continue;
        if (r.isFinal) finaisRef.current = juntar(finaisRef.current, texto);
        else parcial = juntar(parcial, texto);
      }
      onTextoRef.current(juntar(baseRef.current, juntar(finaisRef.current, parcial)));
    };

    rec.onerror = (e) => {
      setOuvindo(false);
      recRef.current = null;
      // Silêncio não é erro: quem tocou sem falar só tenta de novo.
      if (e.error === "no-speech" || e.error === "aborted") return;
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        alert(
          "O aparelho não deixou usar o microfone. Libere o microfone (e o reconhecimento de voz) para o PRODUMAR nos ajustes e tente de novo."
        );
        return;
      }
      alert("Não consegui ouvir agora. Tente de novo ou escreva pelo teclado.");
    };

    rec.onend = () => {
      setOuvindo(false);
      recRef.current = null;
    };

    recRef.current = rec;
    setOuvindo(true);
    try {
      rec.start();
    } catch {
      // start() estoura se já estiver ouvindo — nada a fazer.
      setOuvindo(false);
      recRef.current = null;
    }
  }, []);

  if (!suporta) return null;

  return (
    <button
      type="button"
      onClick={() => (ouvindo ? parar() : ouvir())}
      disabled={disabled}
      aria-label={ouvindo ? "Parar de ditar" : rotulo}
      title={ouvindo ? "Parar de ditar" : rotulo}
      className={cn(
        "flex items-center justify-center w-9 h-9 rounded-lg transition-colors shrink-0",
        ouvindo
          ? "bg-red-500 text-white animate-pulse"
          : "text-produmar-600 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-slate-700",
        "disabled:opacity-50 disabled:pointer-events-none",
        className
      )}
    >
      <Mic className="w-5 h-5" />
    </button>
  );
}
