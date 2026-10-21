"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Search, Plus, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
}: Props<T>) {
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
    ? items.filter((i) =>
        getLabel(i).toLowerCase().includes(query.trim().toLowerCase())
      )
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
