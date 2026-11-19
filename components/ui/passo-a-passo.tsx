"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CampoComSugestoes } from "@/components/ui/campo-com-sugestoes";
import { cn, formatBRLInput, formatDate, mascaraCpfCnpj, mascaraTelefone } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// FORMULÁRIO PASSO A PASSO — uma pergunta por vez
// ─────────────────────────────────────────────────────────────────────────────
// No celular, o formulário inteiro numa tela só é uma parede de campos. Aqui a
// tela faz UMA pergunta de cada vez: responde, toca em "seguinte" no teclado e
// aparece a próxima. No fim, a REVISÃO mostra tudo junto e qualquer item se
// corrige com um toque. Usado pelos contratos de aluguel e de compra e venda.
//
// As perguntas de texto usam SEMPRE o mesmo campo (mesmo lugar na árvore do
// React): trocar de pergunta não derruba o foco, e o teclado do iPhone fica
// aberto de uma resposta para a outra.
// ─────────────────────────────────────────────────────────────────────────────

export type TipoPasso =
  | "texto"
  | "documento"
  | "numero"
  | "telefone"
  | "email"
  | "cep"
  | "dinheiro"
  | "percentual"
  | "medida"
  | "area"
  | "data"
  | "longo"
  | "opcoes"
  | "especial";

export type OpcaoPasso = string | { valor: string; label: string };

export interface PassoDef<C extends string> {
  campo: C;
  secao: string;
  pergunta: string;
  tipo: TipoPasso;
  placeholder?: string;
  dica?: string;
  opcoes?: OpcaoPasso[];
  /** Sai em CAIXA ALTA na tela (quem grava em caixa alta é o servidor). */
  maiusculo?: boolean;
  /** Sem ele o formulário não salva — a revisão aponta o que falta. */
  obrigatorio?: boolean;
  /** O passo só aparece quando faz sentido (o cônjuge, o fiador...). */
  quando?: (d: Record<C, string>) => boolean;
  /** Campo de texto que é só número (matrícula, nº da casa): teclado numérico. */
  teclado?: "numerico";
  /** Respostas prontas a um toque, embaixo do campo (ex.: "S/N"). */
  atalhos?: string[];
  /**
   * O que já foi escrito nesta pergunta antes: aparece embaixo do campo
   * enquanto se digita, filtrado letra a letra, para escolher com um toque.
   */
  sugestoes?: string[];
  /**
   * Teclas que o teclado numérico do iPhone não tem — o hífen e o X do dígito
   * final do RG. Acrescentam no fim do que já foi digitado, sem fechar o teclado.
   */
  teclasExtras?: string[];
  /** Quantos dígitos cabem no campo de número. */
  maxDigitos?: number;
  /** Campo desenhado pela própria tela (ex.: a escolha do imóvel). */
  especial?: (valor: string, mudar: (v: string) => void, avancar: () => void) => ReactNode;
  /** Como o valor aparece na revisão, quando não é o próprio texto. */
  mostrar?: (valor: string) => string;
  /** Opções que nunca ficam em branco: tocar na já escolhida só segue em frente. */
  fixo?: boolean;
}

function valorDaOpcao(o: OpcaoPasso): string {
  return typeof o === "string" ? o : o.valor;
}
function rotuloDaOpcao(o: OpcaoPasso): string {
  return typeof o === "string" ? o : o.label;
}

const SEM_SUGESTOES: string[] = [];

/** Órgãos expedidores do RG mais comuns por aqui, a um toque. */
export const ORGAOS_RG = ["SSP/MA", "SEJUSP/MA", "DETRAN/MA", "PC/MA"];

/**
 * O RG é guardado num campo só ("123456 SSP/MA"), mas perguntado em dois — o
 * número com teclado numérico, o órgão com letras. Aqui ele se separa ao abrir
 * um cadastro: o começo com dígitos é o número, o resto é o órgão.
 */
export function separarRg(rg?: string | null): { numero: string; orgao: string } {
  const t = (rg ?? "").trim();
  const m = t.match(/^([\d.\-xX]+)\s*(.*)$/);
  if (!m) return { numero: t, orgao: "" };
  return { numero: m[1], orgao: m[2].trim() };
}

/** E se junta de novo para gravar: "123456" + "SSP/MA" → "123456 SSP/MA". */
export function juntarRg(numero: string, orgao: string): string {
  return [numero.trim(), orgao.trim()].filter(Boolean).join(" ");
}

/** "65470000" → "65470-000". */
export function mascaraCep(s: string): string {
  const d = s.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** O que a revisão mostra no lugar de cada resposta. */
function valorNaRevisao<C extends string>(p: PassoDef<C>, valor: string): string {
  if (!valor.trim()) return "";
  if (p.mostrar) return p.mostrar(valor);
  if (p.tipo === "opcoes") {
    const o = p.opcoes?.find((x) => valorDaOpcao(x) === valor);
    return o ? rotuloDaOpcao(o) : valor;
  }
  if (p.tipo === "data") return formatDate(valor);
  if (p.tipo === "dinheiro") return `R$ ${valor}`;
  if (p.tipo === "percentual") return `${valor}%`;
  if (p.tipo === "medida") return `${valor} m`;
  if (p.tipo === "area") return /m/i.test(valor) ? valor : `${valor} m²`;
  return valor;
}

/**
 * O andamento do formulário: qual pergunta está na tela, as que valem para as
 * respostas dadas até aqui, e a ida e volta da revisão.
 */
export function usePassoAPasso<C extends string>(
  todos: PassoDef<C>[],
  dados: Record<C, string>,
  open: boolean,
  comecarNaRevisao: boolean
) {
  /** Índice na lista VISÍVEL; -1 = a revisão. */
  const [idx, setIdx] = useState(0);
  /** Abriu a pergunta a partir da revisão: o "OK" volta para lá. */
  const [daRevisao, setDaRevisao] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIdx(comecarNaRevisao ? -1 : 0);
    setDaRevisao(false);
    // abrir o diálogo é o gatilho; `comecarNaRevisao` vem junto com ele
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const passos = useMemo(() => todos.filter((p) => !p.quando || p.quando(dados)), [todos, dados]);
  const naRevisao = idx < 0 || idx >= passos.length;
  const passo = naRevisao ? null : passos[idx];

  function avancar() {
    if (daRevisao) {
      setDaRevisao(false);
      setIdx(-1);
      return;
    }
    setIdx((i) => (i + 1 >= passos.length ? -1 : i + 1));
  }

  function voltar() {
    if (daRevisao) {
      setDaRevisao(false);
      setIdx(-1);
      return;
    }
    if (naRevisao) setIdx(passos.length - 1);
    else setIdx((i) => Math.max(0, i - 1));
  }

  function irParaRevisao() {
    setDaRevisao(false);
    setIdx(-1);
  }

  function editar(campo: C) {
    const i = passos.findIndex((p) => p.campo === campo);
    if (i < 0) return;
    setDaRevisao(true);
    setIdx(i);
  }

  /** Pula direto para uma pergunta (ex.: depois de preencher um bloco de uma vez). */
  function irPara(campo: C) {
    const i = passos.findIndex((p) => p.campo === campo);
    setDaRevisao(false);
    setIdx(i < 0 ? -1 : i);
  }

  /** O que é obrigatório e ficou em branco. */
  const faltando = passos.filter((p) => p.obrigatorio && !dados[p.campo]?.trim());

  return { passos, idx, naRevisao, passo, daRevisao, avancar, voltar, irParaRevisao, editar, irPara, faltando };
}

/** A pergunta da vez: a seção, a barra de andamento, o campo e os botões. */
export function PerguntaDoPasso<C extends string>({
  passo,
  idx,
  total,
  valor,
  onMudar,
  onAvancar,
  onVoltar,
  onRevisao,
  daRevisao,
  extra,
  rodape,
}: {
  passo: PassoDef<C>;
  idx: number;
  total: number;
  valor: string;
  onMudar: (v: string) => void;
  onAvancar: () => void;
  onVoltar: () => void;
  onRevisao: () => void;
  daRevisao: boolean;
  /** Algo a mais embaixo do campo (ex.: o valor por extenso). */
  extra?: ReactNode;
  /** O recado fixo do pé da tela. */
  rodape?: ReactNode;
}) {
  const campoRef = useRef<HTMLInputElement | null>(null);
  const textoRef = useRef<HTMLTextAreaElement | null>(null);
  const ultimo = idx === total - 1;

  // Foco no campo a cada pergunta — no computador o cursor já está lá.
  useEffect(() => {
    const t = setTimeout(() => {
      if (passo.tipo === "longo") textoRef.current?.focus();
      else if (passo.tipo !== "opcoes" && passo.tipo !== "data" && passo.tipo !== "especial")
        campoRef.current?.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [idx, passo.tipo]);

  function escolher(opcao: string) {
    const novo = valor === opcao && !passo.fixo ? "" : opcao;
    onMudar(novo);
    // escolheu: segue sozinho para a próxima pergunta
    if (novo) setTimeout(onAvancar, 150);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onAvancar();
      }}
    >
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
          <span className="font-semibold tracking-wide">{passo.secao.toUpperCase()}</span>
          <span className="tabular-nums">
            {idx + 1} de {total}
          </span>
        </div>
        <div className="h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-produmar-500 transition-all"
            style={{ width: `${((idx + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      <label
        htmlFor="pp_campo"
        className="block text-lg font-semibold leading-snug text-slate-800 dark:text-slate-100"
      >
        {passo.pergunta}
        {passo.obrigatorio && <span className="text-red-500"> *</span>}
      </label>

      <CampoDoPasso
        passo={passo}
        valor={valor}
        onMudar={onMudar}
        onEscolher={escolher}
        onAvancar={onAvancar}
        campoRef={campoRef}
        textoRef={textoRef}
        ultimo={ultimo}
      />

      {/* O hífen e o X do dígito do RG. O toque não tira o foco do campo
          (preventDefault no apertar), então o teclado continua aberto. */}
      {passo.teclasExtras && passo.teclasExtras.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400 dark:text-slate-500">Dígito no fim:</span>
          {passo.teclasExtras.map((t) => (
            <button
              key={t}
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onMudar(valor + t);
                campoRef.current?.focus();
              }}
              aria-label={t === "-" ? "Acrescentar hífen" : `Acrescentar ${t}`}
              className="min-w-[48px] min-h-[40px] px-3 rounded-xl border border-slate-200 bg-white text-base font-semibold text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200"
            >
              {t === "-" ? "–" : t}
            </button>
          ))}
        </div>
      )}

      {/* Respostas prontas: "S/N" no número da casa, que o teclado numérico não tem */}
      {passo.atalhos && passo.atalhos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {passo.atalhos.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => {
                onMudar(a);
                setTimeout(onAvancar, 150);
              }}
              className={cn(
                "min-h-[40px] px-4 rounded-xl border text-sm font-semibold transition-colors",
                valor === a
                  ? "bg-produmar-600 border-produmar-600 text-white"
                  : "bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
              )}
            >
              {a}
            </button>
          ))}
        </div>
      )}

      {extra}
      {passo.dica && <p className="text-[11px] text-slate-400 dark:text-slate-500">{passo.dica}</p>}

      <div className="flex items-center gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          onClick={onVoltar}
          disabled={!daRevisao && idx === 0}
          className="h-11 px-3"
          aria-label="Voltar"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Button type="submit" className="h-11 flex-1">
          {daRevisao ? "OK" : ultimo ? "Revisar" : valor.trim() ? "Próximo" : "Pular"}
          {!daRevisao && <ChevronRight className="w-4 h-4" />}
        </Button>
      </div>

      {!daRevisao && (
        <button
          type="button"
          onClick={onRevisao}
          className="w-full text-center text-[11px] font-medium text-produmar-600 dark:text-produmar-400 underline underline-offset-2"
        >
          Ir para a revisão e salvar
        </button>
      )}

      {rodape && <div className="text-[11px] text-slate-400 dark:text-slate-500">{rodape}</div>}
    </form>
  );
}

function CampoDoPasso<C extends string>({
  passo,
  valor,
  onMudar,
  onEscolher,
  onAvancar,
  campoRef,
  textoRef,
  ultimo,
}: {
  passo: PassoDef<C>;
  valor: string;
  onMudar: (v: string) => void;
  onEscolher: (opcao: string) => void;
  onAvancar: () => void;
  campoRef: React.MutableRefObject<HTMLInputElement | null>;
  textoRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  ultimo: boolean;
}) {
  if (passo.tipo === "especial" && passo.especial) {
    return <>{passo.especial(valor, onMudar, onAvancar)}</>;
  }

  if (passo.tipo === "opcoes") {
    return (
      <div className="flex flex-wrap gap-2">
        {passo.opcoes?.map((o) => {
          const v = valorDaOpcao(o);
          return (
            <button
              key={v}
              type="button"
              onClick={() => onEscolher(v)}
              className={cn(
                "min-h-[44px] px-4 rounded-xl border text-sm font-semibold transition-colors",
                valor === v
                  ? "bg-produmar-600 border-produmar-600 text-white"
                  : "bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300"
              )}
            >
              {rotuloDaOpcao(o)}
            </button>
          );
        })}
      </div>
    );
  }

  if (passo.tipo === "longo") {
    return (
      <Textarea
        id="pp_campo"
        ref={textoRef}
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        placeholder={passo.placeholder}
        rows={4}
      />
    );
  }

  if (passo.tipo === "data") {
    return (
      <Input
        id="pp_campo"
        type="date"
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        className="h-12 text-base"
      />
    );
  }

  const inputMode =
    passo.tipo === "documento" ||
    passo.tipo === "numero" ||
    passo.tipo === "cep" ||
    passo.teclado === "numerico"
      ? "numeric"
      : passo.tipo === "telefone"
        ? "tel"
        : passo.tipo === "dinheiro" ||
            passo.tipo === "percentual" ||
            passo.tipo === "medida" ||
            passo.tipo === "area"
          ? "decimal"
          : passo.tipo === "email"
            ? "email"
            : "text";

  function formatar(bruto: string): string {
    switch (passo.tipo) {
      case "dinheiro":
        return formatBRLInput(bruto);
      case "cep":
        return mascaraCep(bruto);
      case "documento":
        return mascaraCpfCnpj(bruto);
      case "telefone":
        return mascaraTelefone(bruto);
      case "numero":
        return bruto.replace(/\D/g, "").slice(0, passo.maxDigitos ?? 4);
      case "medida":
      case "area":
        return bruto.replace(/[^\d,]/g, "").slice(0, 9);
      case "percentual":
        return bruto.replace(/[^\d,]/g, "").slice(0, 5);
      default:
        return bruto;
    }
  }

  return (
    // Sempre o mesmo campo (com ou sem sugestões): a árvore não muda de uma
    // pergunta para a outra e o teclado do iPhone fica aberto.
    <CampoComSugestoes
      id="pp_campo"
      ref={campoRef}
      // CPF/CNPJ e telefone salvos antes da máscara já aparecem formatados
      value={passo.tipo === "documento" || passo.tipo === "telefone" ? formatar(valor) : valor}
      onChange={(e) => onMudar(formatar(e.target.value))}
      sugestoes={passo.sugestoes ?? SEM_SUGESTOES}
      onEscolher={(v) => onMudar(formatar(v))}
      placeholder={passo.placeholder}
      inputMode={inputMode}
      enterKeyHint={ultimo ? "done" : "next"}
      autoComplete="off"
      autoCapitalize={passo.maiusculo ? "characters" : "off"}
      className={cn(
        "h-12 text-base",
        passo.maiusculo && "uppercase placeholder:normal-case",
        (passo.tipo === "dinheiro" || passo.tipo === "documento" || passo.tipo === "cep") &&
          "tabular-nums font-semibold"
      )}
    />
  );
}

/** Tudo o que foi respondido, por seção, com um toque para corrigir. */
export function RevisaoDosPassos<C extends string>({
  passos,
  dados,
  onEditar,
  topo,
}: {
  passos: PassoDef<C>[];
  dados: Record<C, string>;
  onEditar: (campo: C) => void;
  /** O que vem antes da lista (ex.: quem é a outra parte do contrato). */
  topo?: ReactNode;
}) {
  const secoes: { titulo: string; itens: PassoDef<C>[] }[] = [];
  for (const p of passos) {
    const ultima = secoes[secoes.length - 1];
    if (ultima && ultima.titulo === p.secao) ultima.itens.push(p);
    else secoes.push({ titulo: p.secao, itens: [p] });
  }
  const emBranco = passos.filter((p) => !p.obrigatorio && !dados[p.campo]?.trim()).length;
  const faltando = passos.filter((p) => p.obrigatorio && !dados[p.campo]?.trim());

  return (
    <div className="space-y-3">
      {topo}

      {faltando.length > 0 && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-400">
          Falta preencher: {faltando.map((p) => p.pergunta.toLowerCase()).join(", ")}.
        </p>
      )}

      {emBranco > 0 && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {emBranco} {emBranco === 1 ? "campo ficou" : "campos ficaram"} em branco — saem no papel
          como linha para a caneta. Toque em qualquer item para corrigir.
        </p>
      )}

      {secoes.map((s) => (
        <div key={s.titulo} className="space-y-1">
          <p className="text-[11px] font-semibold tracking-wide text-slate-400 dark:text-slate-500">
            {s.titulo.toUpperCase()}
          </p>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            {s.itens.map((p) => {
              const valor = valorNaRevisao(p, dados[p.campo] ?? "");
              const falta = p.obrigatorio && !valor;
              return (
                <button
                  key={p.campo}
                  type="button"
                  onClick={() => onEditar(p.campo)}
                  className={cn(
                    "w-full flex items-start gap-2 px-3 py-2 text-left transition-colors",
                    falta
                      ? "bg-red-50 dark:bg-red-950/20"
                      : "bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  )}
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-[11px] text-slate-400 dark:text-slate-500">
                      {p.pergunta}
                      {p.obrigatorio && <span className="text-red-500"> *</span>}
                    </span>
                    <span
                      className={cn(
                        "block text-sm break-words",
                        valor
                          ? "text-slate-800 dark:text-slate-100"
                          : falta
                            ? "text-red-600 dark:text-red-400 italic"
                            : "text-slate-300 dark:text-slate-600 italic"
                      )}
                    >
                      {valor || (falta ? "falta preencher" : "em branco")}
                    </span>
                  </span>
                  <Pencil className="w-3.5 h-3.5 mt-1 flex-shrink-0 text-slate-300 dark:text-slate-600" />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
