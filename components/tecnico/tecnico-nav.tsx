"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fence, PackageOpen, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const ABAS = [
  { href: "/tecnico", label: "Material", icon: PackageOpen },
  { href: "/tecnico/diaristas", label: "Colaborador", icon: Users },
  { href: "/tecnico/cerca", label: "Cerca", icon: Fence },
];

/**
 * As três coisas que o técnico avisa da rua: o material que gastou, quem veio
 * trabalhar e quantos metros de cerca andaram. Três telas, um toque para
 * trocar — sem menu, sem hub, sem nada mais no meio (o perfil dele é fechado
 * nestas rotas).
 */
export function TecnicoNav() {
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
