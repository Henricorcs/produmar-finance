import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn, formatBRL, formatBRLFull } from "@/lib/utils";

const TONES = {
  emerald: {
    box: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/50",
    soft: "text-emerald-600 dark:text-emerald-400",
    strong: "text-emerald-700 dark:text-emerald-400",
  },
  red: {
    box: "bg-red-50 dark:bg-red-950/40 border-red-100 dark:border-red-900/50",
    soft: "text-red-600 dark:text-red-400",
    strong: "text-red-700 dark:text-red-400",
  },
  amber: {
    box: "bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/50",
    soft: "text-amber-600 dark:text-amber-400",
    strong: "text-amber-700 dark:text-amber-400",
  },
  produmar: {
    box: "bg-produmar-50 dark:bg-produmar-950/40 border-produmar-100 dark:border-produmar-900/50",
    soft: "text-produmar-600 dark:text-produmar-400",
    strong: "text-produmar-700 dark:text-produmar-400",
  },
} as const;

interface SummaryStatCardProps {
  tone: keyof typeof TONES;
  icon: LucideIcon;
  label: string;
  /** Valor monetário: cheio sem centavos no mobile (formatBRLFull), com centavos no desktop. */
  amount?: number;
  /** Valor não-monetário (ex.: contagem). Usado quando `amount` não é passado. */
  value?: ReactNode;
}

/**
 * Card de resumo colorido (3-up) usado em Contas e Operações. Mantém uma única
 * fonte de verdade para o visual; o split mobile/desktop do valor monetário
 * fica encapsulado aqui.
 */
export function SummaryStatCard({ tone, icon: Icon, label, amount, value }: SummaryStatCardProps) {
  const t = TONES[tone];
  return (
    <div className={cn("rounded-xl p-3 sm:p-4 border min-w-0", t.box)}>
      <div className="flex items-center gap-1 sm:gap-1.5 mb-1">
        <Icon className={cn("w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0", t.soft)} />
        <p className={cn("text-[10px] sm:text-xs font-medium truncate", t.soft)}>{label}</p>
      </div>
      <p className={cn("text-sm sm:text-base font-semibold tabular-nums truncate", t.strong)}>
        {amount !== undefined ? (
          <>
            <span className="sm:hidden">{formatBRLFull(amount)}</span>
            <span className="hidden sm:inline">{formatBRL(amount)}</span>
          </>
        ) : (
          value
        )}
      </p>
    </div>
  );
}
