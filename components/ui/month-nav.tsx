import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Navegador de mês (‹ Mês Ano ›) compartilhado por Contas, Operações e
 * Para onde foi. Alvos de toque grandes no mobile (p-2.5) e densos no desktop.
 */
export function MonthNav({
  label,
  onPrev,
  onNext,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onPrev}
        aria-label="Mês anterior"
        className="p-2.5 sm:p-1.5 rounded-lg hover:bg-produmar-50 dark:hover:bg-slate-800 text-produmar-600 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm font-medium text-produmar-800 dark:text-slate-100 capitalize min-w-[150px] sm:min-w-[160px] text-center">
        {label}
      </span>
      <button
        type="button"
        onClick={onNext}
        aria-label="Próximo mês"
        className="p-2.5 sm:p-1.5 rounded-lg hover:bg-produmar-50 dark:hover:bg-slate-800 text-produmar-600 transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
