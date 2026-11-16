"use client";

import { useEffect, useMemo } from "react";
import { ChevronRight, ListFilter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SPECIES_META,
  criacaoPorLote,
  ehRacaPO,
  speciesOf,
  useSoBovinos,
  useSpeciesOptions,
} from "./animal-shared";
import type { AnimalBreed, AnimalSpecies, AnimalWithInfo } from "@/lib/types";

/**
 * O que está escolhido no menu de raças.
 *
 *   species "todos"                → o rebanho inteiro
 *   species "bovino", breedId null → todos os bovinos
 *   species "bovino", breedId id   → só aquela raça
 *   species "bovino", breedId "sem"→ os bovinos sem raça no cadastro
 *   species "bovino", breedId "po" → o gado PO (todas as raças PO juntas)
 *
 * A raça sempre vem junto com o tipo dela: cada raça pertence a um tipo
 * (animal_breeds.species), e é o tipo que manda nas vacinas, nos nomes das
 * categorias e no cadastro rápido.
 */
export interface EscolhaRaca {
  species: "todos" | AnimalSpecies;
  breedId: string | null;
}

/** O id de mentira que quer dizer "sem raça no cadastro". */
export const SEM_RACA = "sem";

/**
 * O id de mentira do grupo "Gado PO": todos os bovinos de raça PO (puro de
 * origem), seja Nelore PO, Gir PO ou outra — o gado do código de compra.
 */
export const GRUPO_PO = "po";

/** A raça de verdade da escolha (para o cadastro já entrar nela), ou null. */
export function racaDaEscolha(breedId: string | null): string | null {
  return breedId && breedId !== SEM_RACA && breedId !== GRUPO_PO ? breedId : null;
}

/** O animal entra na escolha do menu? */
export function animalNaEscolha(a: AnimalWithInfo, e: EscolhaRaca): boolean {
  if (e.species !== "todos" && speciesOf(a.species) !== e.species) return false;
  if (e.breedId === null) return true;
  if (e.breedId === SEM_RACA) return !a.breed_id;
  if (e.breedId === GRUPO_PO) return ehRacaPO(a.breed_name);
  return a.breed_id === e.breedId;
}

/** O nome do que está escolhido — vai no botão da gaveta e nos recados. */
export function nomeDaEscolha(e: EscolhaRaca, breeds: AnimalBreed[]): string {
  if (e.species === "todos") return "Todos os animais";
  const plural = SPECIES_META[e.species].plural;
  if (e.breedId === null) return criacaoPorLote(e.species) ? plural : `Todos os ${plural.toLowerCase()}`;
  if (e.breedId === SEM_RACA) return `${plural} sem raça`;
  if (e.breedId === GRUPO_PO) return "Gado PO";
  return breeds.find((b) => b.id === e.breedId)?.name ?? plural;
}

interface ListaProps {
  breeds: AnimalBreed[];
  /** O rebanho de hoje (só quem está ativo) — é dele que saem os números. */
  animals: AnimalWithInfo[];
  value: EscolhaRaca;
  onChange: (e: EscolhaRaca) => void;
}

/**
 * A lista do menu: "Todos os animais" e, embaixo, cada tipo com a opção do
 * tipo inteiro e as raças dele. Peixe e ave trabalham por tanque, sem raça —
 * entram só como o tipo. Raça e tipo sem nenhum animal ficam apagados, mas dá
 * para escolher (é assim que se cadastra o primeiro).
 */
export function ListaRacas({ breeds, animals, value, onChange }: ListaProps) {
  const contagem = useMemo(() => {
    const porTipo = new Map<AnimalSpecies, number>();
    const porRaca = new Map<string, number>();
    const semRaca = new Map<AnimalSpecies, number>();
    let po = 0;
    for (const a of animals) {
      const s = speciesOf(a.species);
      if (s === "bovino" && ehRacaPO(a.breed_name)) po++;
      porTipo.set(s, (porTipo.get(s) ?? 0) + 1);
      if (a.breed_id) porRaca.set(a.breed_id, (porRaca.get(a.breed_id) ?? 0) + 1);
      else semRaca.set(s, (semRaca.get(s) ?? 0) + 1);
    }
    return { porTipo, porRaca, semRaca, po };
  }, [animals]);

  const racasPorTipo = useMemo(() => {
    const m = new Map<AnimalSpecies, AnimalBreed[]>();
    for (const b of breeds) {
      const s = speciesOf(b.species);
      const arr = m.get(s);
      if (arr) arr.push(b);
      else m.set(s, [b]);
    }
    for (const arr of m.values())
      arr.sort((x, y) => x.name.localeCompare(y.name, "pt-BR", { sensitivity: "base" }));
    return m;
  }, [breeds]);

  const ativo = (species: EscolhaRaca["species"], breedId: string | null) =>
    value.species === species && value.breedId === breedId;

  // Vaqueiro nível 01 (146): só o gado — e "Todos os animais" seria o mesmo
  // que "Todos os bovinos", então nem aparece.
  const soBovinos = useSoBovinos();
  const tipos = useSpeciesOptions();

  return (
    <nav aria-label="Escolher tipo e raça" className="space-y-3">
      {!soBovinos && (
        <Item
          label="Todos os animais"
          count={animals.length}
          ativo={ativo("todos", null)}
          onClick={() => onChange({ species: "todos", breedId: null })}
          destaque
        />
      )}

      {tipos.map(({ value: sp }) => {
        const meta = SPECIES_META[sp];
        const porLote = criacaoPorLote(sp);
        const racas = porLote ? [] : racasPorTipo.get(sp) ?? [];
        const semRaca = contagem.semRaca.get(sp) ?? 0;
        const total = contagem.porTipo.get(sp) ?? 0;
        return (
          <div key={sp}>
            {/* peixe e ave não têm raça: o tipo é o próprio item */}
            {!porLote && (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {meta.plural}
              </p>
            )}
            <div className="space-y-0.5">
              <Item
                label={porLote ? meta.plural : `Todos os ${meta.plural.toLowerCase()}`}
                count={porLote ? undefined : total}
                vazio={!porLote && total === 0}
                ativo={ativo(sp, null)}
                onClick={() => onChange({ species: sp, breedId: null })}
                destaque={porLote}
              />
              {/* o gado PO junto, qualquer que seja a raça: é nele que o
                  número vira o código de compra (GSC 7893, CSCN 21368...) */}
              {sp === "bovino" && (racas.some((b) => ehRacaPO(b.name)) || contagem.po > 0) && (
                <Item
                  label="Gado PO (código de compra)"
                  count={contagem.po}
                  vazio={contagem.po === 0}
                  ativo={ativo(sp, GRUPO_PO)}
                  onClick={() => onChange({ species: sp, breedId: GRUPO_PO })}
                  recuo
                />
              )}
              {racas.map((b) => {
                const n = contagem.porRaca.get(b.id) ?? 0;
                return (
                  <Item
                    key={b.id}
                    label={b.name}
                    count={n}
                    vazio={n === 0}
                    ativo={ativo(sp, b.id)}
                    onClick={() => onChange({ species: sp, breedId: b.id })}
                    recuo
                  />
                );
              })}
              {/* quem foi cadastrado sem raça também tem onde ser achado */}
              {!porLote && semRaca > 0 && (
                <Item
                  label="Sem raça no cadastro"
                  count={semRaca}
                  ativo={ativo(sp, SEM_RACA)}
                  onClick={() => onChange({ species: sp, breedId: SEM_RACA })}
                  recuo
                  apagado
                />
              )}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function Item({
  label,
  count,
  ativo,
  onClick,
  vazio,
  recuo,
  destaque,
  apagado,
}: {
  label: string;
  count?: number;
  ativo: boolean;
  onClick: () => void;
  /** Nenhum animal ainda: fica apagado, mas dá pra escolher. */
  vazio?: boolean;
  /** Raça dentro do tipo: um pouco para dentro. */
  recuo?: boolean;
  /** Item de primeiro nível (Todos os animais, Piscicultura, Aves). */
  destaque?: boolean;
  /** "Sem raça no cadastro" — em itálico, para não parecer uma raça. */
  apagado?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={ativo ? "true" : undefined}
      className={cn(
        "w-full flex items-center gap-2 min-h-[44px] rounded-xl px-3 text-left text-sm transition-colors active:scale-[0.98]",
        recuo && "pl-6",
        destaque && "font-semibold",
        apagado && "italic",
        ativo
          ? "bg-produmar-600 text-white"
          : vazio
            ? "text-slate-400 hover:bg-slate-100 dark:text-slate-600 dark:hover:bg-slate-800"
            : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
      )}
    >
      <span className="flex-1 min-w-0 truncate">{label}</span>
      {count !== undefined && (
        <span
          className={cn(
            "flex-shrink-0 text-xs tabular-nums",
            ativo ? "text-white/80" : "text-slate-400 dark:text-slate-500"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * O botão que abre a gaveta no celular e no tablet. Mostra o que está
 * escolhido, para a pessoa saber que a tela está filtrada.
 */
export function BotaoRacas({
  nome,
  filtrado,
  onClick,
}: {
  nome: string;
  filtrado: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "lg:hidden w-full flex items-center gap-3 min-h-[48px] px-3 rounded-xl border text-left transition-colors active:scale-[0.98]",
        filtrado
          ? "border-produmar-300 bg-produmar-50 dark:border-produmar-800 dark:bg-produmar-950/40"
          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
      )}
    >
      <span className="w-8 h-8 rounded-lg flex items-center justify-center bg-produmar-600 text-white flex-shrink-0">
        <ListFilter className="w-4 h-4" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 leading-tight">
          Tipo e raça
        </span>
        <span className="block text-sm font-semibold text-produmar-800 dark:text-slate-100 truncate">
          {nome}
        </span>
      </span>
      <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
    </button>
  );
}

/**
 * A gaveta do celular: entra pela esquerda por cima da tela (e da barra de
 * baixo). Toque fora, no X ou numa raça fecha. Enquanto aberta a página de
 * trás não rola — no Safari do iPhone, sem isso, o dedo arrasta a página
 * junto com a lista.
 */
export function GavetaRacas({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const antes = body.style.overflow;
    body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      body.style.overflow = antes;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div
      className={cn("lg:hidden fixed inset-0 z-50", open ? "visible" : "invisible pointer-events-none")}
      aria-hidden={!open}
    >
      <div
        className={cn(
          "absolute inset-0 bg-slate-900/40 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0"
        )}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tipo e raça"
        className={cn(
          "absolute inset-y-0 left-0 flex w-[82vw] max-w-[320px] flex-col bg-white shadow-xl transition-transform duration-200 dark:bg-slate-900 pt-safe",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <p className="text-base font-semibold text-produmar-800 dark:text-slate-100">Tipo e raça</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="w-10 h-10 -mr-2 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-2 pt-3">
          <div className="pb-safe">
            {children}
            <div className="h-4" />
          </div>
        </div>
      </div>
    </div>
  );
}
