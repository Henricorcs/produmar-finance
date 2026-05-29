import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { cn, formatBRL, formatDueLabel } from "@/lib/utils";
import type { Transaction } from "@/lib/types";

interface UpcomingBillsProps {
  bills: Array<Transaction & { contact_name?: string | null }>;
}

export function UpcomingBills({ bills }: UpcomingBillsProps) {
  return (
    <div className="rounded-xl border border-produmar-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div>
            <div className="text-sm font-medium text-produmar-800 dark:text-slate-100">Próximos vencimentos</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Contas a pagar nos próximos dias</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {bills.length > 0 && (
            <AlertTriangle className="w-4 h-4 text-amber-600" aria-hidden />
          )}
          <Link
            href="/contas"
            className="text-xs text-produmar-600 dark:text-produmar-400 hover:text-produmar-700 dark:hover:text-produmar-300 flex items-center gap-1"
          >
            Ver tudo <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {bills.length === 0 ? (
        <div className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
          Nada vencendo nos próximos dias. 🎉
        </div>
      ) : (
        <div className="divide-y divide-produmar-50 dark:divide-slate-800">
          {bills.map((bill) => {
            const due = formatDueLabel(bill.due_date);
            const variantClass = {
              danger: "text-red-600 dark:text-red-400",
              warning: "text-amber-600 dark:text-amber-400",
              muted: "text-slate-500 dark:text-slate-400"
            }[due.variant];

            return (
              <div key={bill.id} className="flex items-center justify-between py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-produmar-800 dark:text-slate-200 truncate">
                    {bill.description}
                  </div>
                  <div className={cn("text-xs font-medium", variantClass)}>{due.label}</div>
                </div>
                <div className="text-sm font-medium text-produmar-800 dark:text-slate-200 tabular-nums shrink-0 pl-3">
                  {formatBRL(bill.amount)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
