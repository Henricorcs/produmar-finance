"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, PackageOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const ABAS = [
  { href: "/operador", label: "Serviços", icon: ClipboardList },
  { href: "/operador/material", label: "Material", icon: PackageOpen },
];

/**
 * As duas coisas do painel de quem está na rua: a OS que mandaram para ele e o
 * material que ele levou para a obra. Um toque para trocar — sem menu, porque
 * o perfil do operador é fechado nestas rotas.
 */
export function OperadorNav() {
  const pathname = usePathname();

  return (
    <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 mb-4">
      {ABAS.map((aba) => {
        const Icon = aba.icon;
        const active = pathname === aba.href;
        return (
          <Link
            key={aba.href}
            href={aba.href}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 min-h-[48px] px-1 rounded-lg text-[13px] sm:text-sm font-semibold transition-colors",
              active
                ? "bg-white dark:bg-slate-700 text-produmar-700 dark:text-produmar-300 shadow-sm"
                : "text-slate-500 dark:text-slate-400"
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{aba.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
