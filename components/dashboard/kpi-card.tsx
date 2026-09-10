import Link from "next/link";
import { TrendingUp, TrendingDown, LucideIcon, ArrowRight } from "lucide-react";
import { Money } from "@/components/ui/money";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: number;
  caption?: string;
  trend?: { value: number; direction: "up" | "down" };
  variant?: "primary" | "success" | "danger" | "warning" | "info" | "neutral";
  icon?: LucideIcon;
  href?: string;
  /** Classe extra no contêiner (ex.: col-span no grid). */
  className?: string;
  /** Card em destaque: mostra o valor cheio mesmo no mobile e fonte maior. */
  wide?: boolean;
}

export function KpiCard({
  label,
  value,
  caption,
  trend,
  variant = "neutral",
  icon: Icon,
  href,
  className,
  wide = false,
}: KpiCardProps) {
  const isPrimary = variant === "primary";

  const variantStyles: Record<string, string> = {
    primary: "bg-gradient-to-br from-produmar-600 to-produmar-700 text-white border-transparent",
    success: "bg-white dark:bg-slate-900 border-produmar-100 dark:border-slate-800 text-emerald-700 dark:text-emerald-400",
    danger:  "bg-white dark:bg-slate-900 border-produmar-100 dark:border-slate-800 text-red-700 dark:text-red-400",
    warning: "bg-white dark:bg-slate-900 border-produmar-100 dark:border-slate-800 text-amber-700 dark:text-amber-400",
    info:    "bg-white dark:bg-slate-900 border-produmar-100 dark:border-slate-800 text-cyan-700 dark:text-cyan-400",
    neutral: "bg-white dark:bg-slate-900 border-produmar-100 dark:border-slate-800 text-produmar-800 dark:text-slate-100",
  };

  const labelColor   = isPrimary ? "text-produmar-100" : "text-slate-500 dark:text-slate-400";
  const captionColor = isPrimary ? "text-produmar-100" : "text-slate-500 dark:text-slate-400";
  const arrowColor   = isPrimary ? "text-produmar-200" : "text-slate-300 dark:text-slate-600";

  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className={cn("text-xs font-medium", labelColor)}>{label}</div>
        {Icon && (
          <Icon
            className={cn(
              "w-4 h-4",
              isPrimary ? "text-produmar-200" : "text-slate-400 dark:text-slate-500"
            )}
          />
        )}
      </div>

      <div
        className={cn(
          "mt-2 font-medium tracking-tight",
          // wide: maior enquanto ocupa a largura toda; volta ao normal quando vira 1 de 5 colunas (lg)
          wide ? "text-3xl lg:text-2xl" : "text-2xl"
        )}
      >
        {/* Valor cheio em qualquer tela: os centavos entram menores, sem empurrar o número */}
        <Money value={value} centsClassName={isPrimary ? "opacity-80" : undefined} />
      </div>

      <div className={cn("mt-1.5 flex items-center justify-between gap-1 text-xs", captionColor)}>
        <span className="flex items-center gap-1">
          {trend &&
            (trend.direction === "up" ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            ))}
          {trend && <span>{trend.value.toFixed(1).replace(".", ",")}%</span>}
          {caption && <span>{trend ? " · " : ""}{caption}</span>}
        </span>

        {href && (
          <ArrowRight className={cn("w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity", arrowColor)} />
        )}
      </div>
    </>
  );

  const base = cn(
    "rounded-xl border p-4 transition-all hover:shadow-md hover:-translate-y-0.5 min-w-0",
    href && "group cursor-pointer",
    variantStyles[variant],
    className
  );

  if (href) {
    return (
      <Link href={href} className={base}>
        {inner}
      </Link>
    );
  }

  return <div className={base}>{inner}</div>;
}
