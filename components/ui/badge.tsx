import * as React from "react";
import { cn } from "@/lib/utils";
import type { TransactionStatus } from "@/lib/types";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "danger" | "warning" | "muted" | "info";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variant === "default" && "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300",
        variant === "success" && "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/50",
        variant === "danger" && "bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-900/50",
        variant === "warning" && "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-100 dark:border-amber-900/50",
        variant === "muted" && "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
        variant === "info" && "bg-produmar-50 dark:bg-produmar-950/40 text-produmar-700 dark:text-produmar-400 border border-produmar-100 dark:border-produmar-900/50",
        className
      )}
      {...props}
    />
  );
}

const STATUS_VARIANT: Record<TransactionStatus, BadgeProps["variant"]> = {
  pendente: "warning",
  pago: "success",
  recebido: "success",
  vencido: "danger",
  cancelado: "muted",
};

const STATUS_LABEL: Record<TransactionStatus, string> = {
  pendente: "Pendente",
  pago: "Pago",
  recebido: "Recebido",
  vencido: "Vencido",
  cancelado: "Cancelado",
};

function StatusBadge({ status }: { status: TransactionStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}

export { Badge, StatusBadge };
