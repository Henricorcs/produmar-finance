"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { BotaoDitado, escreverNoCampo } from "@/components/ui/botao-ditado";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Tira o microfone deste campo. */
  semDitado?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, semDitado, ...props }, ref) => {
    const campoRef = React.useRef<HTMLTextAreaElement | null>(null);

    const guardarRef = React.useCallback(
      (el: HTMLTextAreaElement | null) => {
        campoRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      },
      [ref]
    );

    // Caixa de texto é sempre escrita livre: é onde falar rende mais. Quem some
    // onde o aparelho não sabe ouvir é o botão — a caixa em volta fica, senão o
    // campo seria remontado depois que a tela abre (pisca e perde o foco).
    const comMicrofone = !semDitado && !props.disabled && !props.readOnly;

    const campo = (
      <textarea
        className={cn(
          // text-base no mobile evita o zoom automático do iOS ao focar
          "flex min-h-[80px] w-full rounded-md border border-produmar-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-base sm:text-sm text-slate-900 dark:text-slate-100",
          "placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-produmar-500 focus-visible:border-produmar-500 transition-colors resize-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          comMicrofone && "pr-12",
          className
        )}
        ref={guardarRef}
        {...props}
      />
    );

    if (!comMicrofone) return campo;

    return (
      <div className="relative w-full flex-1 min-w-0">
        {campo}
        <BotaoDitado
          lerAtual={() => campoRef.current?.value ?? ""}
          onTexto={(texto) => campoRef.current && escreverNoCampo(campoRef.current, texto)}
          rotulo="Ditar o texto"
          className="absolute right-1.5 bottom-2"
        />
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
