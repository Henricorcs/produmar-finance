"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { StickyNote, X } from "lucide-react";
import { salvarNota } from "@/app/(app)/bloco-notas/actions";
import { actionError } from "@/lib/action-result";

// ─────────────────────────────────────────────────────────────────────────────
// BLOCO DE NOTAS — o papelzinho amarelo ao lado do teclado
// ─────────────────────────────────────────────────────────────────────────────
// Mora na Topbar, então aparece em TODOS os módulos. O bloco é da pessoa: quem
// entra com outro login abre outro papel (a RLS da migration 090 não deixa
// ninguém ver o do vizinho).
//
// Uma linha é uma tarefa: o ponto entra sozinho na frente, e o que se digita
// sobe para caixa alta — do jeito que o resto do sistema já grava nome de obra,
// de peão e de máquina.

/** O ponto que abre cada tarefa. */
const MARCA = "• ";

/** Espera depois da última tecla antes de gravar (ms). */
const ESPERA = 700;

// O cursor tem que voltar ao lugar ANTES do navegador pintar, senão ele pisca
// no fim do texto a cada tecla. No servidor não existe pintura: lá o
// useLayoutEffect só renderia aviso no console, então cai no useEffect.
const useEfeitoDePintura = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Arruma o papel inteiro: caixa alta, um ponto por linha escrita, linha vazia
 * continua vazia (serve para separar assunto). Devolve junto onde o cursor tem
 * que ficar — sem isso ele pularia para o fim do texto a cada tecla.
 */
function arrumar(valor: string, cursor: number): { texto: string; cursor: number } {
  const linhas = valor.toUpperCase().split("\n");
  let novoCursor = cursor;
  let lidos = 0;    // caracteres do texto ANTIGO já percorridos
  let escritos = 0; // caracteres do texto NOVO já montados

  const prontas = linhas.map((linha) => {
    const limpa = linha.replace(/^[\s•]+/, "");
    const nova = limpa ? MARCA + limpa : "";

    // o cursor está nesta linha?
    if (cursor >= lidos && cursor <= lidos + linha.length) {
      const coluna = cursor - lidos;
      const comidos = linha.length - limpa.length; // o que o ponto e os espaços ocupavam
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
  return texto.split("\n").filter((l) => l.replace(/^[\s•]+/, "").trim()).length;
}

export function BlocoNotas({ inicial }: { inicial: string }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const areaRef = useRef<HTMLTextAreaElement>(null);
  const textoRef = useRef(inicial);
  const cursorRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const salvoRef = useRef(inicial); // o que o banco já tem
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
    if (inicial === salvoRef.current) return;
    if (Date.now() - salvoEmRef.current < 10000) return;
    salvoRef.current = inicial;
    textoRef.current = inicial;
    setTexto(inicial);
  }, [inicial, aberto, sujo]);

  // ── Digitação ─────────────────────────────────────────────────────────────
  function aoDigitar(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    const { texto: novo, cursor } = arrumar(el.value, el.selectionStart ?? el.value.length);
    aplicar(novo, cursor);
  }

  // Apagar no começo da tarefa junta ela com a de cima, como em qualquer lista.
  // Sem isso o backspace bateria no ponto, que voltaria na mesma hora — e a
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
    const resto = el.value.slice(inicioLinha).replace(/^[\s•]+/, "");
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

          <div className="absolute right-0 mt-2 w-[min(360px,calc(100vw-2rem))] rounded-xl border border-amber-300 bg-amber-100 shadow-xl shadow-black/20 overflow-hidden z-50">
            <div className="px-4 py-2.5 bg-amber-200/70 border-b border-amber-300 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-amber-950">Bloco de notas</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wide text-amber-800">
                  {salvando ? "Salvando…" : sujo ? "Não salvo" : "Salvo"}
                </span>
                <button
                  type="button"
                  onClick={fechar}
                  className="w-7 h-7 -mr-1.5 rounded-full flex items-center justify-center text-amber-800 hover:bg-amber-300/70 transition-colors"
                  aria-label="Fechar bloco de notas"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <textarea
              ref={areaRef}
              value={texto}
              onChange={aoDigitar}
              onKeyDown={aoApagar}
              spellCheck={false}
              placeholder="Escreva uma tarefa por linha…"
              // text-base no celular evita o zoom automático do iOS ao focar
              className="block w-full h-56 sm:h-64 resize-none bg-transparent px-4 py-3 text-base sm:text-sm leading-7 font-bold uppercase tracking-wide text-amber-950 placeholder:text-amber-700/60 placeholder:font-medium placeholder:normal-case placeholder:tracking-normal focus:outline-none"
              // as linhas do papel acompanham a rolagem do texto (background local)
              style={{
                backgroundImage:
                  "repeating-linear-gradient(to bottom, transparent 0 27px, rgba(180,83,9,.20) 27px 28px)",
                backgroundAttachment: "local",
                backgroundPosition: "0 12px",
              }}
            />

            <div className="px-4 py-2 bg-amber-200/70 border-t border-amber-300">
              {erro ? (
                <p className="text-[11px] text-red-700 font-medium">{erro}</p>
              ) : (
                <p className="text-[11px] text-amber-800">
                  Só você vê este bloco · Esc ou clique fora para fechar
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
