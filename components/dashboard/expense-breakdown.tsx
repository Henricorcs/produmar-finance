import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatBRL } from "@/lib/utils";
import type { ExpenseByCategory } from "@/lib/types";

export function ExpenseBreakdown({ data }: { data: ExpenseByCategory[] }) {
  const filtered = data.filter((d) => d.total > 0).slice(0, 5);
  const max = Math.max(...filtered.map((d) => d.total), 1);

  return (
    <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-medium text-produmar-800 dark:text-slate-100">Para onde foi o dinheiro</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">Top 5 categorias do mês</div>
        </div>
        <Link
          href="/para-onde-foi"
          className="text-xs text-produmar-600 dark:text-produmar-400 hover:text-produmar-700 dark:hover:text-produmar-300 flex items-center gap-1"
        >
          Ver tudo <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {filtered.length === 0 ? (
        <div className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
          Nenhuma despesa registrada ainda este mês.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((cat) => {
            const pct = (cat.total / max) * 100;
            return (
              <div key={cat.category_id}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-produmar-800 dark:text-slate-200 font-medium">{cat.category_name}</span>
                  <span className="text-slate-700 dark:text-slate-300 font-medium">{formatBRL(cat.total)}</span>
                </div>
                <div className="h-1.5 bg-produmar-50 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: cat.category_color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
