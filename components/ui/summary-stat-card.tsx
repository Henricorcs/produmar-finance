import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn, formatBRL } from "@/lib/utils";

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
  /** Valor monetário, sempre COM os centavos — inclusive no celular. */
  amount?: number;
  /** Valor não-monetário (ex.: contagem). Usado quando `amount` não é passado. */
  value?: ReactNode;
}

/**
 * Card de resumo colorido (3-up) usado em Contas e Operações.
 *
 * O valor vem COM os centavos, também no celular. Antes o mobile arredondava
 * para caber ("R$ 13.767"), e um resumo de dinheiro que esconde o centavo
 * levanta a dúvida de sempre: é 13.767 na conta ou é o número redondo? Para
 * caber, quem encolhe agora é a letra e a folga do cartão — não o valor.
 */
export function SummaryStatCard({ tone, icon: Icon, label, amount, value }: SummaryStatCardProps) {
  const t = TONES[tone];
  const dinheiro = amount !== undefined ? formatBRL(amount) : null;

  // No celular são três cartões numa tela de 375px: 87px de texto em cada um.
  // "R$ 13.767,45" não cabe a 13px e sairia cortado — pior que arredondado.
  // Então a letra cede conforme o número cresce; no computador sobra espaço e o
  // tamanho é sempre o mesmo.
  const tamanho = !dinheiro
    ? "text-[13px]"
    : dinheiro.length > 13
      ? "text-[10px]"
      : dinheiro.length > 11
        ? "text-[11px]"
        : "text-[13px]";

  return (
    <div className={cn("rounded-xl p-2.5 sm:p-4 border min-w-0", t.box)}>
      <div className="flex items-center gap-1 sm:gap-1.5 mb-1">
        <Icon className={cn("w-3 h-3 sm:w-3.5 sm:h-3.5 flex-shrink-0", t.soft)} />
        <p className={cn("text-[10px] sm:text-xs font-medium truncate", t.soft)}>{label}</p>
      </div>
      <p className={cn("font-semibold tabular-nums truncate sm:text-base", tamanho, t.strong)}>
        {dinheiro ?? value}
      </p>
    </div>
  );
}
