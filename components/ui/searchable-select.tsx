"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, Search, Plus, Check, X } from "lucide-react";
import { cn, paraBusca } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/** Quantas escolhas recentes aparecem no topo da tela de escolha. */
const MAX_RECENTES = 5;
/** Lista curta não precisa de "usadas por último": cabe tudo na tela. */
const MIN_ITENS_PARA_RECENTES = 9;

function chaveRecentes(nome: string) {
  return `produmar:recentes:${nome}`;
}

function lerRecentesDoAparelho(nome: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(chaveRecentes(nome)) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function guardarRecenteNoAparelho(nome: string, id: string) {
  try {
    const lista = [id, ...lerRecentesDoAparelho(nome).filter((x) => x !== id)].slice(0, 10);
    localStorage.setItem(chaveRecentes(nome), JSON.stringify(lista));
  } catch {
    // modo privado / sem espaço: só não lembra
  }
}

interface Props<T> {
  items: T[];
  value: string;
  onChange: (id: string) => void;
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  renderItem?: (item: T) => React.ReactNode;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  onCreateNew?: () => void;
  createNewLabel?: string;
  clearable?: boolean;
  /** Foca a busca (abre o teclado) ao abrir. Default: false: o teclado só
   *  sobe quando o usuário toca no campo de busca. */
  autoFocusSearch?: boolean;
  /** Só mostra a lista depois que o usuário digita algo. Default: false. */
  suggestOnType?: boolean;
  /**
   * LISTA ABERTA: sem a caixinha que abre — a busca e as opções já ficam à
   * mostra, ocupando o espaço da tela. Para quando a escolha é a pergunta da
   * vez (no celular, a caixinha dentro de uma janela mostrava 2 itens só).
   * Tocar de novo na opção escolhida tira a escolha (se `clearable`).
   */
  inline?: boolean;
  /**
   * TELA DE ESCOLHA: tocar no campo abre uma janela própria, da altura da
   * tela, só para escolher — busca no alto, linhas grandes de tocar e as
   * usadas por último em cima. Para listas compridas (as obras), que no
   * celular ficavam espremidas e cortadas dentro do diálogo.
   */
  telaCheia?: boolean;
  /** Título da tela de escolha (ex.: "Escolher obra"). */
  titulo?: string;
  /** Segunda linha de cada opção na tela de escolha (ex.: o cliente da obra). */
  getDetalhe?: (item: T) => string | null | undefined;
  /** Ids que aparecem em "Usadas por último", na ordem (ex.: do colaborador). */
  recentes?: string[];
  /**
   * Nome para o aparelho lembrar as últimas escolhas (ex.: "obras"). Completa
   * `recentes` quando faltam itens.
   */
  lembrarRecentes?: string;
}

export function SearchableSelect<T>({
  items,
  value,
  onChange,
  getId,
  getLabel,
  renderItem,
  placeholder = "Selecione...",
  searchPlaceholder = "Buscar...",
  emptyMessage = "Nenhum resultado",
  onCreateNew,
  createNewLabel = "Criar novo",
  clearable = true,
  autoFocusSearch = false,
  suggestOnType = false,
  inline = false,
  telaCheia = false,
  titulo,
  getDetalhe,
  recentes,
  lembrarRecentes,
}: Props<T>) {
  if (telaCheia && !inline) {
    return (
      <SeletorEmTela
        items={items}
        value={value}
        onChange={onChange}
        getId={getId}
        getLabel={getLabel}
        renderItem={renderItem}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        emptyMessage={emptyMessage}
        onCreateNew={onCreateNew}
        createNewLabel={createNewLabel}
        clearable={clearable}
        suggestOnType={suggestOnType}
        titulo={titulo}
        getDetalhe={getDetalhe}
        recentes={recentes}
        lembrarRecentes={lembrarRecentes}
      />
    );
  }
  return (
    <SeletorSimples
      items={items}
      value={value}
      onChange={onChange}
      getId={getId}
      getLabel={getLabel}
      renderItem={renderItem}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyMessage={emptyMessage}
      onCreateNew={onCreateNew}
      createNewLabel={createNewLabel}
      clearable={clearable}
      autoFocusSearch={autoFocusSearch}
      suggestOnType={suggestOnType}
      inline={inline}
    />
  );
}

/** A busca não liga para acento nem maiúscula ("joao" acha JOÃO). */
function filtrar<T>(
  items: T[],
  query: string,
  getLabel: (item: T) => string,
  getDetalhe?: (item: T) => string | null | undefined
): T[] {
  const q = paraBusca(query.trim());
  if (!q) return items;
  return items.filter(
    (i) =>
      paraBusca(getLabel(i)).includes(q) ||
      (getDetalhe ? paraBusca(getDetalhe(i)).includes(q) : false)
  );
}

function SeletorSimples<T>({
  items,
  value,
  onChange,
  getId,
  getLabel,
  renderItem,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  onCreateNew,
  createNewLabel,
  clearable,
  autoFocusSearch,
  suggestOnType,
  inline,
}: Required<
  Pick<
    Props<T>,
    | "items"
    | "value"
    | "onChange"
    | "getId"
    | "getLabel"
    | "placeholder"
    | "searchPlaceholder"
    | "emptyMessage"
    | "createNewLabel"
    | "clearable"
    | "autoFocusSearch"
    | "suggestOnType"
    | "inline"
  >
> &
  Pick<Props<T>, "renderItem" | "onCreateNew">) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = items.find((i) => getId(i) === value);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Por padrão o teclado NÃO sobe ao abrir a lista: ele cobriria os itens que
  // a pessoa acabou de mandar aparecer. Quem quiser buscar toca na busca.
  // Lista muito longa pode pedir autoFocusSearch para já abrir digitando.
  useEffect(() => {
    if (open && autoFocusSearch) {
      // small delay for the input to render
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [open, autoFocusSearch]);

  const hasQuery = query.trim().length > 0;
  // Com suggestOnType, a lista só aparece depois de digitar algo.
  const filtered = hasQuery
    ? filtrar(items, query, getLabel)
    : suggestOnType
    ? []
    : items;

  function selectItem(item: T) {
    onChange(getId(item));
    setOpen(false);
    setQuery("");
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
  }

  if (inline) {
    return (
      <div className="rounded-md border border-produmar-100 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
        <div className="relative border-b border-slate-100 dark:border-slate-700">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-transparent text-base pl-9 pr-3 py-3 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
        </div>
        <div className="max-h-[48vh] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-sm text-slate-400 dark:text-slate-500 text-center">
              {suggestOnType && !hasQuery ? "Digite para buscar…" : emptyMessage}
            </div>
          ) : (
            filtered.map((item) => {
              const id = getId(item);
              const isSelected = id === value;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onChange(isSelected && clearable ? "" : id)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-3 text-base text-left transition-colors",
                    "hover:bg-produmar-50 dark:hover:bg-slate-700",
                    isSelected && "bg-produmar-100/70 dark:bg-slate-700 font-semibold"
                  )}
                >
                  <div className="flex-1 min-w-0">{renderItem ? renderItem(item) : getLabel(item)}</div>
                  {isSelected && <Check className="w-5 h-5 text-produmar-600 dark:text-produmar-400 flex-shrink-0" />}
                </button>
              );
            })
          )}
        </div>
        {onCreateNew && (
          <button
            type="button"
            onClick={onCreateNew}
            className="w-full flex items-center gap-2 px-3 py-3 text-sm font-medium border-t border-slate-100 dark:border-slate-700 text-produmar-600 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-slate-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {createNewLabel}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group flex h-11 sm:h-10 w-full items-center justify-between gap-2 rounded-md border border-produmar-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-base sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-produmar-500 focus:border-produmar-500 transition-colors"
      >
        <span
          className={cn(
            "truncate flex-1 text-left min-w-0",
            !selected && "text-slate-400 dark:text-slate-500"
          )}
        >
          {selected
            ? (renderItem ? renderItem(selected) : getLabel(selected))
            : placeholder}
        </span>
        {clearable && selected && (
          <span
            role="button"
            tabIndex={0}
            onClick={clear}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            aria-label="Limpar seleção"
          >
            <X className="h-3.5 w-3.5" />
          </span>
        )}
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Search input */}
          <div className="relative border-b border-slate-100 dark:border-slate-700">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-base sm:text-sm pl-9 pr-3 py-2.5 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
            />
          </div>

          {/* Items list */}
          <div className="max-h-60 overflow-y-auto py-1">
            {suggestOnType && !hasQuery ? (
              <div className="px-3 py-4 text-xs text-slate-400 dark:text-slate-500 text-center">
                Digite para buscar…
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-slate-400 dark:text-slate-500 text-center">
                {emptyMessage}
              </div>
            ) : (
              filtered.map((item) => {
                const id = getId(item);
                const isSelected = id === value;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectItem(item)}
                    className={cn(
                      "w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left transition-colors",
                      "hover:bg-produmar-50 dark:hover:bg-slate-700",
                      isSelected && "bg-produmar-50/60 dark:bg-slate-700/60"
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      {renderItem ? renderItem(item) : getLabel(item)}
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-produmar-600 dark:text-produmar-400 flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Create new */}
          {onCreateNew && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setQuery("");
                onCreateNew();
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-t border-slate-100 dark:border-slate-700 text-produmar-600 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-slate-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              {createNewLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * O campo abre uma janela própria só para escolher. No celular ela ocupa a
 * faixa da tela que o teclado deixa livre (a mesma conta dos diálogos), então
 * a busca fica sempre à vista e a lista rola inteira dentro dela.
 * É um Dialog de verdade, empilhado por cima de quem estiver aberto: o
 * "voltar" do aparelho fecha só a escolha.
 */
function SeletorEmTela<T>({
  items,
  value,
  onChange,
  getId,
  getLabel,
  renderItem,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  onCreateNew,
  createNewLabel,
  clearable,
  suggestOnType,
  titulo,
  getDetalhe,
  recentes,
  lembrarRecentes,
}: Required<
  Pick<
    Props<T>,
    | "items"
    | "value"
    | "onChange"
    | "getId"
    | "getLabel"
    | "placeholder"
    | "searchPlaceholder"
    | "emptyMessage"
    | "createNewLabel"
    | "clearable"
    | "suggestOnType"
  >
> &
  Pick<
    Props<T>,
    "renderItem" | "onCreateNew" | "titulo" | "getDetalhe" | "recentes" | "lembrarRecentes"
  >) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [doAparelho, setDoAparelho] = useState<string[]>([]);

  const selected = items.find((i) => getId(i) === value);

  // As últimas escolhas deste aparelho: lidas ao abrir (só existem no navegador)
  useEffect(() => {
    if (open && lembrarRecentes) setDoAparelho(lerRecentesDoAparelho(lembrarRecentes));
  }, [open, lembrarRecentes]);

  const usadas = useMemo(() => {
    if (items.length < MIN_ITENS_PARA_RECENTES) return [];
    const porId = new Map<string, T>();
    for (const i of items) porId.set(getId(i), i);
    const lista: T[] = [];
    const vistos = new Set<string>();
    for (const id of [...(recentes ?? []), ...doAparelho]) {
      if (lista.length >= MAX_RECENTES) break;
      const item = porId.get(id);
      if (!item || vistos.has(id)) continue;
      vistos.add(id);
      lista.push(item);
    }
    return lista;
    // getId muda a cada render do pai; a lista e os ids é que importam
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, recentes, doAparelho]);

  const hasQuery = query.trim().length > 0;
  const filtered = hasQuery
    ? filtrar(items, query, getLabel, getDetalhe)
    : suggestOnType
    ? []
    : items;
  const mostrarUsadas = !hasQuery && usadas.length > 0;

  function fechar(o: boolean) {
    setOpen(o);
    if (!o) setQuery("");
  }

  function escolher(item: T) {
    const id = getId(item);
    onChange(id);
    if (lembrarRecentes) guardarRecenteNoAparelho(lembrarRecentes, id);
    fechar(false);
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
  }

  function linha(item: T, chave: string) {
    const id = getId(item);
    const isSelected = id === value;
    const detalhe = getDetalhe?.(item);
    return (
      <button
        key={chave}
        type="button"
        onClick={() => escolher(item)}
        className={cn(
          "w-full flex items-center gap-3 px-4 py-3.5 min-h-[3.25rem] text-left",
          "border-b border-slate-100 dark:border-slate-800",
          "hover:bg-produmar-50 active:bg-produmar-100 dark:hover:bg-slate-800 dark:active:bg-slate-700 transition-colors",
          isSelected && "bg-produmar-50 dark:bg-slate-800"
        )}
      >
        <div className="flex-1 min-w-0">
          {getDetalhe ? (
            <>
              <div
                className={cn(
                  "text-base leading-snug text-slate-900 dark:text-slate-100 break-words",
                  isSelected && "font-semibold"
                )}
              >
                {getLabel(item)}
              </div>
              {detalhe && (
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {detalhe}
                </div>
              )}
            </>
          ) : (
            <div className={cn("text-base", isSelected && "font-semibold")}>
              {renderItem ? renderItem(item) : getLabel(item)}
            </div>
          )}
        </div>
        {isSelected && (
          <Check className="w-5 h-5 text-produmar-600 dark:text-produmar-400 flex-shrink-0" />
        )}
      </button>
    );
  }

  const rotulo =
    "px-4 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-100 dark:border-slate-800";
  const detalheEscolhido = selected && getDetalhe ? getDetalhe(selected) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex min-h-11 sm:min-h-10 w-full items-center justify-between gap-2 rounded-md border border-produmar-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-base sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-produmar-500 focus:border-produmar-500 transition-colors"
      >
        <span
          className={cn(
            "block truncate flex-1 text-left min-w-0",
            !selected && "text-slate-400 dark:text-slate-500"
          )}
        >
          {selected ? (
            getDetalhe ? (
              <>
                {getLabel(selected)}
                {detalheEscolhido && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {" "}· {detalheEscolhido}
                  </span>
                )}
              </>
            ) : renderItem ? (
              renderItem(selected)
            ) : (
              getLabel(selected)
            )
          ) : (
            placeholder
          )}
        </span>
        {clearable && selected && (
          <span
            role="button"
            tabIndex={0}
            onClick={clear}
            className="-my-2 -mr-1 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            aria-label="Limpar seleção"
          >
            <X className="h-4 w-4" />
          </span>
        )}
        <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
      </button>

      <Dialog open={open} onOpenChange={fechar}>
        <DialogContent
          className={cn(
            "p-0 sm:p-0 overflow-hidden flex flex-col",
            // ocupa a faixa livre inteira (a mesma conta do max-height da
            // .dialog-visible-band): com o teclado aberto, encolhe junto
            "h-[calc(var(--dialog-free-h)_-_2.5rem)] sm:h-[80vh]"
          )}
        >
          <div className="flex-shrink-0 border-b border-slate-100 dark:border-slate-800">
            <DialogTitle className="px-4 pt-4 pb-2 pr-14">{titulo ?? placeholder}</DialogTitle>
            <div className="px-3 pb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  inputMode="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full h-11 rounded-lg bg-slate-100 dark:bg-slate-800 text-base pl-9 pr-10 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-produmar-500"
                />
                {hasQuery && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center text-slate-400"
                    aria-label="Limpar busca"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {mostrarUsadas && (
              <>
                <div className={rotulo}>Usadas por último</div>
                {usadas.map((item) => linha(item, `u-${getId(item)}`))}
                <div className={rotulo}>Todas ({items.length})</div>
              </>
            )}
            {filtered.length === 0 ? (
              <div className="px-4 py-8 text-sm text-slate-400 dark:text-slate-500 text-center">
                {suggestOnType && !hasQuery ? "Digite para buscar…" : emptyMessage}
              </div>
            ) : (
              filtered.map((item) => linha(item, getId(item)))
            )}
            {onCreateNew && (
              <button
                type="button"
                onClick={() => {
                  fechar(false);
                  onCreateNew();
                }}
                className="w-full flex items-center gap-2 px-4 py-4 text-base font-medium text-produmar-600 dark:text-produmar-400 hover:bg-produmar-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Plus className="w-5 h-5" />
                {createNewLabel}
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
