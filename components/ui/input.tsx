"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { BotaoDitado, escreverNoCampo } from "@/components/ui/botao-ditado";
import { dataPorFala, digitosPorFala, horaPorFala, valorPorFala } from "@/lib/ditado-pt";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Tira o microfone deste campo. */
  semDitado?: boolean;
}

type Ditado = {
  /** Converte o que foi falado no que o campo espera. Sem isso, entra o texto. */
  transformar?: (falado: string) => string | null;
  rotulo: string;
  recado?: string;
  /** Onde o botão fica dentro do campo. */
  posicao?: string;
};

/**
 * Em campo de data e hora o botão anda um pouco para a esquerda no computador:
 * ali o Chrome desenha o calendarinho dele encostado na beirada, e os dois em
 * cima do mesmo canto viram um borrão. No celular o calendarinho não existe —
 * o iPhone mostra só a data —, então o botão fica no canto como nos demais
 * campos, e a data continua cabendo inteira.
 */
const CANTO = "absolute right-1 top-1/2 -translate-y-1/2";
const CANTO_DATA = "absolute right-1 sm:right-10 top-1/2 -translate-y-1/2";

/**
 * O que o microfone faz em cada tipo de campo.
 *
 * Em campo de escrever, o falado entra como texto. Em campo de valor, de data e
 * de hora, ele passa antes pelo tradutor (lib/ditado-pt): "mil e quinhentos"
 * vira 1.500,00 e "dezoito de setembro" vira a data que o campo entende.
 *
 * Fora da lista ficam senha, e-mail, arquivo e campo de duas letras (UF) — em
 * senha e e-mail ditar é pedir erro, e no campo de sigla o botão tomaria metade
 * do espaço.
 */
function ditadoDoCampo(type?: string, inputMode?: string, maxLength?: number): Ditado | null {
  if (maxLength !== undefined && maxLength <= 4) return null;

  if (type === "date")
    return {
      transformar: dataPorFala,
      rotulo: "Ditar a data",
      recado: "Não entendi a data. Diga assim: dezoito de setembro.",
      posicao: CANTO_DATA,
    };
  if (type === "time")
    return {
      transformar: horaPorFala,
      rotulo: "Ditar a hora",
      recado: "Não entendi a hora. Diga assim: oito e meia.",
      posicao: CANTO_DATA,
    };
  if (inputMode === "decimal")
    return {
      transformar: valorPorFala,
      rotulo: "Ditar o valor",
      recado: "Não entendi o valor. Diga assim: mil e quinhentos.",
    };
  if (inputMode === "numeric" || inputMode === "tel")
    return {
      transformar: digitosPorFala,
      rotulo: "Ditar o número",
      recado: "Não entendi o número.",
    };
  // e-mail, url e afins: teclado próprio, ditado só atrapalha
  if (inputMode && inputMode !== "text" && inputMode !== "search") return null;
  if (!type || type === "text" || type === "search") return { rotulo: "Ditar" };
  return null;
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
    const ditado =
      semDitado || props.disabled || props.readOnly
        ? null
        : ditadoDoCampo(type, props.inputMode, props.maxLength);

    const campo = (
      <input
        type={type}
        className={cn(
          // h-11/text-base no mobile: alvo de toque maior e evita o zoom automático do iOS (fonte < 16px)
          "flex h-11 sm:h-10 w-full rounded-md border border-produmar-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-base sm:text-sm text-slate-900 dark:text-slate-100",
          "placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-produmar-500 focus-visible:border-produmar-500 transition-colors",
          "disabled:cursor-not-allowed disabled:opacity-50",
          // O espaço do microfone, para o texto não passar por baixo dele.
          ditado && "pr-11",
          className
        )}
        ref={guardarRef}
        {...props}
      />
    );

    // Sem microfone, o campo sai exatamente como sempre saiu — nada de div a
    // mais em volta de senha, e-mail ou arquivo.
    if (!ditado) return campo;

    return (
      <div className="relative w-full flex-1 min-w-0">
        {campo}
        <BotaoDitado
          lerAtual={() => campoRef.current?.value ?? ""}
          onTexto={(texto) => campoRef.current && escreverNoCampo(campoRef.current, texto)}
          transformar={ditado.transformar}
          recadoNaoEntendi={ditado.recado}
          rotulo={ditado.rotulo}
          className={ditado.posicao ?? CANTO}
        />
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
