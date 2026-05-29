"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  GitFork,
  CalendarClock,
  FileText,
  BarChart3,
  Settings,
  Truck,
  HandCoins,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/dashboard",     label: "Dashboard",     short: "Início",   icon: LayoutDashboard },
  { href: "/para-onde-foi", label: "Para onde foi", short: "Despesas", icon: GitFork },
  { href: "/contas",        label: "Contas",        short: "Contas",   icon: CalendarClock },
  { href: "/operacoes",     label: "Operações",     short: "OS",       icon: Truck },
  { href: "/emprestimos",   label: "Empréstimos",   short: "Empr.",    icon: HandCoins },
  { href: "/notas-fiscais", label: "Notas fiscais", short: "Notas",    icon: FileText },
  { href: "/relatorios",    label: "Relatórios",    short: "Relat.",   icon: BarChart3 },
  { href: "/configuracoes", label: "Config.",       short: "Config",   icon: Settings },
];

export function TabsNav() {
  const pathname = usePathname();

  return (
    <>
      {/* ── Desktop: sticky top tab bar ───────────────────────────── */}
      <nav className="hidden sm:block bg-white dark:bg-slate-900 border-b border-produmar-100 dark:border-slate-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-2 lg:px-4">
          <div className="flex gap-0 overflow-x-auto scrollbar-hide -mb-px">
            {tabs.map((tab) => {
              const active =
                pathname === tab.href || pathname.startsWith(tab.href + "/");
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={cn(
                    "flex items-center gap-1.5 px-3 lg:px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2",
                    active
                      ? "text-produmar-700 dark:text-produmar-400 border-produmar-600 dark:border-produmar-500"
                      : "text-slate-500 dark:text-slate-400 border-transparent hover:text-produmar-600 dark:hover:text-produmar-400 hover:border-produmar-200 dark:hover:border-slate-600"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* ── Mobile: fixed bottom nav ──────────────────────────────── */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 pb-safe">
        <div className="flex items-stretch h-14">
          {tabs.map((tab) => {
            const active =
              pathname === tab.href || pathname.startsWith(tab.href + "/");
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "relative flex-1 flex flex-col items-center justify-center gap-0.5 px-0.5 transition-colors",
                  active
                    ? "text-produmar-600 dark:text-produmar-400"
                    : "text-slate-400 dark:text-slate-500 active:text-produmar-500"
                )}
              >
                {/* Indicador da aba ativa */}
                {active && (
                  <span className="absolute top-0 h-0.5 w-7 rounded-full bg-produmar-600 dark:bg-produmar-400" />
                )}
                <Icon className={cn("w-[22px] h-[22px] transition-transform", active && "-translate-y-px")} />
                <span className="text-[10px] font-medium leading-none whitespace-nowrap">
                  {tab.short}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
