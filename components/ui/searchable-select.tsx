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

  // Auto-focus search when opening
  useEffect(() => {
    if (open) {
      // small delay for the input to render
      const t = setTimeout(() => inputRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [open]);

  const filtered = query.trim()
    ? items.filter((i) =>
        getLabel(i).toLowerCase().includes(query.trim().toLowerCase())
      )
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

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group flex h-10 w-full items-center justify-between gap-2 rounded-md border border-produmar-100 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-produmar-500 focus:border-produmar-500 transition-colors"
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
              className="w-full bg-transparent text-sm pl-9 pr-3 py-2.5 text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
            />
          </div>

          {/* Items list */}
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
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
