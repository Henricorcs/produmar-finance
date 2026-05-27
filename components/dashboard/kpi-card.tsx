import Link from "next/link";
import { TrendingUp, TrendingDown, LucideIcon, ArrowRight } from "lucide-react";
import { cn, formatBRL } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: number;
  caption?: string;
  trend?: { value: number; direction: "up" | "down" };
  variant?: "primary" | "success" | "danger" | "warning" | "info" | "neutral";
  icon?: LucideIcon;
  href?: string;
}

export function KpiCard({
  label,
  value,
  caption,
  trend,
  variant = "neutral",
  icon: Icon,
  href,
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

      <div className="mt-2 text-2xl font-medium tracking-tight">{formatBRL(value)}</div>

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
    "rounded-xl border p-4 transition-all hover:shadow-md hover:-translate-y-0.5",
    href && "group cursor-pointer",
    variantStyles[variant]
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
