"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { BotaoDitado, escreverNoCampo } from "@/components/ui/botao-ditado";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Tira o microfone deste campo (código, placa, senha — coisa de digitar certinho). */
  semDitado?: boolean;
}

/**
 * Campo de ESCREVER (não é dinheiro, data, hora, número nem senha).
 *
 * Dinheiro e quantidade se reconhecem pelo inputMode="decimal"/"numeric" que o
 * sistema já usa em todos eles — ditar número dá mais trabalho que digitar.
 */
function ehDeTexto(type?: string, inputMode?: string, maxLength?: number): boolean {
  if (inputMode && inputMode !== "text" && inputMode !== "search") return false;
  // Campo de duas ou três letras (UF, sigla) não é lugar de falar — e o botão
  // ainda tomaria metade dele.
  if (maxLength !== undefined && maxLength <= 4) return false;
  if (!type) return true;
  return type === "text" || type === "search";
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, semDitado, ...props }, ref) => {
    const campoRef = React.useRef<HTMLInputElement | null>(null);

    // O ref continua chegando a quem pediu (foco, seleção): guardamos o nosso
    // e repassamos o mesmo elemento.
    const guardarRef = React.useCallback(
      (el: HTMLInputElement | null) => {
        campoRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      },
      [ref]
    );

    // Quem decide é só a props — nada de esperar o navegador responder se sabe
    // ouvir. Se dependesse disso, o campo nasceria solto e logo em seguida seria
    // trocado por um campo dentro de uma caixa: o React desmontaria e montaria
    // o campo de novo, piscando e derrubando o foco de toda tela do sistema.
    // Quem some sozinho onde o aparelho não sabe ouvir é o botão.
    const comMicrofone =
      !semDitado &&
      !props.disabled &&
      !props.readOnly &&
      ehDeTexto(type, props.inputMode, props.maxLength);

    const campo = (
      <input
        type={type}
        className={cn(
          // h-11/text-base no mobile: alvo de toque maior e evita o zoom automático do iOS (fonte < 16px)
          "flex h-11 sm:h-10 w-full rounded-md border border-produmar-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-base sm:text-sm text-slate-900 dark:text-slate-100",
          "placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-produmar-500 focus-visible:border-produmar-500 transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-50",
          // espaço do microfone, para o texto não passar por baixo dele
          comMicrofone && "pr-11",
          className
        )}
        ref={guardarRef}
        {...props}
      />
    );

    // Sem microfone, o campo sai exatamente como sempre saiu — nada de div a
    // mais em volta de campo de dinheiro, data ou número.
    if (!comMicrofone) return campo;

    return (
      <div className="relative w-full flex-1 min-w-0">
        {campo}
        <BotaoDitado
          lerAtual={() => campoRef.current?.value ?? ""}
          onTexto={(texto) => campoRef.current && escreverNoCampo(campoRef.current, texto)}
          className="absolute right-1 top-1/2 -translate-y-1/2"
        />
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
