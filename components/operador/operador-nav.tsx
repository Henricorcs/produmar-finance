"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, PackageOpen, Printer } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * As coisas do painel de quem está na rua: a OS que mandaram para ele, o
 * material que ele levou para a obra e a leitura das impressoras alugadas. Um
 * toque para trocar — sem menu, porque o perfil do operador é fechado nestas
 * rotas. Material e Impressoras só aparecem para quem tem a permissão.
 */
export function OperadorNav({
  material = false,
  impressoras = false,
}: {
  material?: boolean;
  impressoras?: boolean;
}) {
  const pathname = usePathname();

  const abas = [
    { href: "/operador", label: "Serviços", icon: ClipboardList, mostra: true },
    { href: "/operador/material", label: "Material", icon: PackageOpen, mostra: material },
    { href: "/operador/impressoras", label: "Impressoras", icon: Printer, mostra: impressoras },
  ].filter((a) => a.mostra);

  return (
    <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 mb-4">
      {abas.map((aba) => {
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
