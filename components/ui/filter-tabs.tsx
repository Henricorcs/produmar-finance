/**
 * Faixa de abas de filtro rolável no mobile, compartilhada por Contas e
 * Operações. Genérica no valor para preservar a tipagem de cada página.
 */
export function FilterTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: ReadonlyArray<{ value: T; label: string }>;
  active: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 overflow-x-auto scrollbar-hide">
      {tabs.map((f) => (
        <button
          key={f.value}
          type="button"
          onClick={() => onChange(f.value)}
          className={`px-3.5 py-2.5 sm:px-3 sm:py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            active === f.value
              ? "bg-white dark:bg-slate-700 text-produmar-700 dark:text-produmar-400 shadow-sm"
              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}
