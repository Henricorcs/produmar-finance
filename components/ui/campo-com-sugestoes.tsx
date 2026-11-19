"use client";

import * as React from "react";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// CAMPO COM SUGESTÕES — o que já foi escrito ali antes, enquanto se digita
// ─────────────────────────────────────────────────────────────────────────────
// Começou a escrever, aparece embaixo do campo uma lista com o que já foi usado
// naquele mesmo campo (a cidade, o bairro, a profissão...), filtrada letra a
// letra. Um toque escolhe. A lista é nossa, e não o <datalist> do navegador: no
// iPhone o datalist quase não aparece e não dá para tocar direito.
// ─────────────────────────────────────────────────────────────────────────────

/** Sem acento e em caixa alta: "São" acha "SAO" e vice-versa. */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

/**
 * Os valores distintos de uma lista, do mais usado para o menos usado — a base
 * das sugestões. Ignora o vazio e junta os que só mudam de acento ou de caixa.
 */
export function valoresUsados(valores: (string | null | undefined)[]): string[] {
  const contagem = new Map<string, { valor: string; vezes: number }>();
  for (const v of valores) {
    const t = (v ?? "").trim().replace(/\s+/g, " ");
    if (!t) continue;
    const chave = normalizar(t);
    const atual = contagem.get(chave);
    if (atual) atual.vezes++;
    else contagem.set(chave, { valor: t, vezes: 1 });
  }
  return Array.from(contagem.values())
    .sort((a, b) => b.vezes - a.vezes || a.valor.localeCompare(b.valor, "pt-BR"))
    .map((x) => x.valor);
}

/** Quantas sugestões cabem embaixo do campo sem empurrar a tela demais. */
const MAXIMO = 6;

/**
 * As que batem com o que foi digitado: primeiro as que COMEÇAM igual, depois as
 * que têm uma palavra começando igual ("SIL" acha "JOÃO SILVA").
 */
function filtrar(sugestoes: string[], digitado: string): string[] {
  const d = normalizar(digitado);
  if (!d) return [];
  const comeca: string[] = [];
  const palavra: string[] = [];
  for (const s of sugestoes) {
    const n = normalizar(s);
    if (n === d) continue; // já está escrito inteiro: não tem o que sugerir
    if (n.startsWith(d)) comeca.push(s);
    else if (n.split(/[\s/,.-]+/).some((p) => p.startsWith(d))) palavra.push(s);
    if (comeca.length >= MAXIMO) break;
  }
  return [...comeca, ...palavra].slice(0, MAXIMO);
}

export interface CampoComSugestoesProps extends Omit<InputProps, "value"> {
  value: string;
  /** O que já foi usado neste campo (de preferência por `valoresUsados`). */
  sugestoes: string[];
  /** Tocou numa sugestão: o valor escolhido. */
  onEscolher: (valor: string) => void;
  /** Classe da caixa em volta do campo e da lista. */
  classeCaixa?: string;
}

export const CampoComSugestoes = React.forwardRef<HTMLInputElement, CampoComSugestoesProps>(
  ({ value, sugestoes, onEscolher, classeCaixa, onFocus, onBlur, onKeyDown, ...props }, ref) => {
    const [aberto, setAberto] = React.useState(false);
    const lista = React.useMemo(() => filtrar(sugestoes, value), [sugestoes, value]);
    const mostrar = aberto && lista.length > 0;

    return (
      <div className={cn("w-full min-w-0 flex-1", classeCaixa)}>
        <Input
          ref={ref}
          value={value}
          autoComplete="off"
          {...props}
          onFocus={(e) => {
            setAberto(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setAberto(false);
            onBlur?.(e);
          }}
          onKeyDown={(e) => {
            // Esc fecha a lista sem apagar o que foi escrito
            if (e.key === "Escape" && mostrar) {
              e.preventDefault();
              e.stopPropagation();
              setAberto(false);
              return;
            }
            onKeyDown?.(e);
          }}
          onInput={() => setAberto(true)}
        />
        {mostrar && (
          <ul
            role="listbox"
            className="mt-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-700/60 overflow-hidden"
          >
            {lista.map((s) => (
              <li key={s} role="option" aria-selected={false}>
                <button
                  type="button"
                  // Apertar não tira o foco do campo: o teclado do iPhone fica
                  // aberto e o toque chega no botão (sem isso o blur fecha a
                  // lista antes do clique).
                  onPointerDown={(e) => e.preventDefault()}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onEscolher(s);
                    setAberto(false);
                  }}
                  className="w-full min-h-[44px] px-3 py-2 text-left text-base sm:text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-produmar-50 dark:active:bg-produmar-950/40"
                >
                  <Destaque texto={s} digitado={value} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
);
CampoComSugestoes.displayName = "CampoComSugestoes";

/** O pedaço digitado sai em negrito dentro da sugestão. */
function Destaque({ texto, digitado }: { texto: string; digitado: string }) {
  const d = normalizar(digitado);
  // A normalização tira só os acentos (um caractere vira um), então a posição
  // achada no texto normalizado é a mesma no texto original.
  const semAcento = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const mesmoTamanho = semAcento.length === texto.length;
  const i = mesmoTamanho && d ? semAcento.indexOf(d) : -1;
  if (i < 0) return <>{texto}</>;
  return (
    <>
      {texto.slice(0, i)}
      <strong className="font-bold text-slate-900 dark:text-white">{texto.slice(i, i + d.length)}</strong>
      {texto.slice(i + d.length)}
    </>
  );
}
