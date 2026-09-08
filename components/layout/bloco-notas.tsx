"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { StickyNote, X } from "lucide-react";
import { salvarNota } from "@/app/(app)/bloco-notas/actions";
import { actionError } from "@/lib/action-result";

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO DE NOTAS — o papelzinho ao lado do teclado
// ─────────────────────────────────────────────────────────────────────────────
// Mora na Topbar, então aparece em TODOS os módulos. O bloco é da pessoa: quem
// entra com outro login abre outro papel (a RLS da migration 090 não deixa
// ninguém ver o do vizinho).
//
// Cada LINHA é uma tarefa: o marcador entra sozinho na frente, e o texto sobe
// para caixa alta — do jeito que o resto do sistema já grava nome de obra, de
// peão e de máquina.

/** O marcador que abre cada tarefa. */
const MARCA = "▸ ";

/**
 * Marcadores que já podem estar escritos no papel — o ponto de antes, o
 * quadradinho, o próprio triângulo. Todos são trocados pelo MARCA de hoje, e é
 * por isso que bloco velho se ajeita sozinho ao abrir.
 * Traço comum (-) fica de fora de propósito: "-200 DE DIESEL" é conta, não
 * marcador.
 */
const MARCADORES = /^[\s•▪▸‣·]+/;

/** Espera depois da última tecla antes de gravar (ms). */
const ESPERA = 700;

// O cursor tem que voltar ao lugar ANTES do navegador pintar, senão ele pisca
// no fim do texto a cada tecla. No servidor não existe pintura: lá o
// useLayoutEffect só renderia aviso no console, então cai no useEffect.
const useEfeitoDePintura = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Arruma o papel inteiro: caixa alta, um marcador por linha escrita, linha
 * vazia continua vazia (serve para separar assunto). Devolve junto onde o
 * cursor tem que ficar — sem isso ele pularia para o fim do texto a cada tecla.
 */
function arrumar(valor: string, cursor: number): { texto: string; cursor: number } {
  const linhas = valor.toUpperCase().split("\n");
  let novoCursor = cursor;
  let lidos = 0;    // caracteres do texto ANTIGO já percorridos
  let escritos = 0; // caracteres do texto NOVO já montados

  const prontas = linhas.map((linha) => {
    const limpa = linha.replace(MARCADORES, "");
    const nova = limpa ? MARCA + limpa : "";

    // o cursor está nesta linha?
    if (cursor >= lidos && cursor <= lidos + linha.length) {
      const coluna = cursor - lidos;
      const comidos = linha.length - limpa.length; // o que o marcador ocupava
      novoCursor = nova
        ? escritos + Math.min(Math.max(coluna - comidos, 0) + MARCA.length, nova.length)
        : escritos;
    }

    lidos += linha.length + 1;
    escritos += nova.length + 1;
    return nova;
  });

  return { texto: prontas.join("\n"), cursor: novoCursor };
}

/** Quantas tarefas escritas o papel tem (linha vazia não conta). */
function contar(texto: string): number {
  return texto.split("\n").filter((l) => l.replace(MARCADORES, "").trim()).length;
}

/** "Salvo às 11:33" — com a data junto quando não foi hoje. */
function quandoSalvou(ms: number): string {
  const d = new Date(ms);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return `Salvo às ${hora}`;
  const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `Salvo em ${dia} às ${hora}`;
}

interface BlocoNotasProps {
  /** O papel como está no banco. */
  inicial: string;
  /** Quando foi gravado pela última vez (ISO). */
  atualizadoEm?: string | null;
}

export function BlocoNotas({ inicial, atualizadoEm = null }: BlocoNotasProps) {
  // O texto do banco entra já arrumado: bloco escrito com o ponto de antes
  // aparece com o marcador de hoje sem precisar mexer em nada.
  const primeiro = arrumar(inicial, 0).texto;

  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(primeiro);
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvoEm, setSalvoEm] = useState<number | null>(
    atualizadoEm ? Date.parse(atualizadoEm) : null
  );

  const areaRef = useRef<HTMLTextAreaElement>(null);
  const textoRef = useRef(primeiro);
  const cursorRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const salvoRef = useRef(primeiro); // o que o banco já tem (arrumado)
  const salvoEmRef = useRef(0);

  // ── Gravar ────────────────────────────────────────────────────────────────
  const salvar = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const conteudo = textoRef.current;
    if (conteudo === salvoRef.current) {
      setSujo(false);
      return;
    }
    setSalvando(true);
    const msg = actionError(await salvarNota(conteudo));
    setSalvando(false);
    if (msg) {
      setErro(msg);
      return;
    }
    salvoRef.current = conteudo;
    salvoEmRef.current = Date.now();
    setSalvoEm(salvoEmRef.current);
    setErro(null);
    setSujo(false);
  }, []);

  const agendar = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void salvar();
    }, ESPERA);
  }, [salvar]);

  const aplicar = useCallback(
    (novo: string, cursor: number) => {
      textoRef.current = novo;
      cursorRef.current = cursor;
      setTexto(novo);
      setSujo(novo !== salvoRef.current);
      setErro(null);
      agendar();
    },
    [agendar]
  );

  const fechar = useCallback(() => {
    setAberto(false);
    void salvar();
  }, [salvar]);

  // ── O cursor volta para o lugar depois que o React repinta o texto ────────
  useEfeitoDePintura(() => {
    const el = areaRef.current;
    const pos = cursorRef.current;
    if (!el || pos === null) return;
    cursorRef.current = null;
    el.setSelectionRange(pos, pos);
  }, [texto]);

  // ── Esc fecha ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      fechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto, fechar]);

  // ── Trocou de aba, bloqueou o celular, fechou o app: grava antes de sumir ──
  useEffect(() => {
    const aoSumir = () => {
      if (document.visibilityState === "hidden") void salvar();
    };
    document.addEventListener("visibilitychange", aoSumir);
    return () => document.removeEventListener("visibilitychange", aoSumir);
  }, [salvar]);

  // ── Escreveu no celular, abriu no computador ──────────────────────────────
  // Cada página aberta traz o texto do banco. Com o bloco fechado e nada
  // esperando para salvar, ele manda. A folga de 10s evita que uma página que
  // já estava a caminho quando gravamos traga de volta o texto velho.
  useEffect(() => {
    if (aberto || sujo) return;
    const vindo = arrumar(inicial, 0).texto;
    if (vindo === salvoRef.current) return;
    if (Date.now() - salvoEmRef.current < 10000) return;
    salvoRef.current = vindo;
    textoRef.current = vindo;
    setTexto(vindo);
    if (atualizadoEm) setSalvoEm(Date.parse(atualizadoEm));
  }, [inicial, atualizadoEm, aberto, sujo]);

  // ── Digitação ─────────────────────────────────────────────────────────────
  function aoDigitar(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    const { texto: novo, cursor } = arrumar(el.value, el.selectionStart ?? el.value.length);
    aplicar(novo, cursor);
  }

  // Apagar no começo da tarefa junta ela com a de cima, como em qualquer lista.
  // Sem isso o backspace bateria no marcador, que voltaria na mesma hora — e a
  // tecla pareceria travada.
  function aoApagar(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Backspace") return;
    const el = e.currentTarget;
    const pos = el.selectionStart ?? 0;
    if (pos !== el.selectionEnd) return; // apagando seleção: caminho normal

    const inicioLinha = el.value.lastIndexOf("\n", pos - 1) + 1;
    if (pos - inicioLinha > MARCA.length) return; // no meio da tarefa: caminho normal

    e.preventDefault();
    if (inicioLinha === 0) return; // primeira linha: não há tarefa acima

    const antes = el.value.slice(0, inicioLinha - 1);
    const resto = el.value.slice(inicioLinha).replace(MARCADORES, "");
    const { texto: novo, cursor } = arrumar(antes + resto, antes.length);
    aplicar(novo, cursor);
  }

  function abrir() {
    setAberto(true);
    // No computador o cursor já entra no papel. No celular não: o teclado
    // subiria por cima antes de a pessoa ler o que está escrito.
    if (typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches) {
      setTimeout(() => {
        const el = areaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }, 0);
    }
  }

  const total = contar(texto);
  const situacao = salvando
    ? "Salvando…"
    : sujo
      ? "Não salvo"
      : salvoEm
        ? quandoSalvou(salvoEm)
        : "";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (aberto ? fechar() : abrir())}
        className="relative w-10 h-10 sm:w-9 sm:h-9 rounded-full bg-amber-400 hover:bg-amber-300 text-amber-950 flex items-center justify-center transition-colors shadow-sm shadow-black/10"
        aria-label="Bloco de notas"
        aria-expanded={aberto}
      >
        <StickyNote className="w-5 h-5" />
        {total > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-950 text-amber-50 text-[10px] font-bold leading-none flex items-center justify-center">
            {total}
          </span>
        )}
      </button>

      {aberto && (
        <>
          {/* Clique fora fecha (e grava no caminho) */}
          <div className="fixed inset-0 z-40" onClick={fechar} aria-hidden />

          {/* Papel branco com a tarja amarela em cima e embaixo — igual nos dois
              temas: o bloco é o amarelo da tela, não acompanha o modo escuro. */}
          <div className="absolute right-0 mt-2 w-[min(380px,calc(100vw-1.5rem))] rounded-xl border-2 border-amber-400 bg-white shadow-2xl shadow-black/30 overflow-hidden z-50">
            <div className="px-4 py-2.5 bg-amber-400 flex items-center justify-between gap-2">
              <span className="text-sm font-bold uppercase tracking-wide text-amber-950">
                Bloco de notas
              </span>
              <button
                type="button"
                onClick={fechar}
                className="w-7 h-7 -mr-1.5 rounded-full flex items-center justify-center text-amber-900 hover:bg-amber-300 transition-colors"
                aria-label="Fechar bloco de notas"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <textarea
              ref={areaRef}
              value={texto}
              onChange={aoDigitar}
              onKeyDown={aoApagar}
              spellCheck={false}
              placeholder="Escreva uma tarefa por linha…"
              // text-base no celular evita o zoom automático do iOS ao focar
              className="block w-full h-64 sm:h-72 resize-none bg-white px-4 py-3 text-base sm:text-sm leading-6 font-bold uppercase text-slate-900 placeholder:text-slate-400 placeholder:font-medium placeholder:normal-case focus:outline-none"
            />

            <div className="px-4 py-2 bg-amber-100 border-t border-amber-300 flex items-center justify-between gap-3">
              {erro ? (
                <p className="text-[11px] text-red-700 font-medium">{erro}</p>
              ) : (
                <>
                  <span className="text-[11px] text-amber-800">Só você vê este bloco.</span>
                  <span className="text-[11px] text-amber-800 shrink-0">{situacao}</span>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
