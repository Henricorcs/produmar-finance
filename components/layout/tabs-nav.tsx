"use client";

import { useEffect, useState } from "react";
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
  Boxes,
  MoreHorizontal,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/dashboard",     label: "Dashboard",     short: "Início",   icon: LayoutDashboard },
  { href: "/para-onde-foi", label: "Para onde foi", short: "Despesas", icon: GitFork },
  { href: "/contas",        label: "Contas",        short: "Contas",   icon: CalendarClock },
  { href: "/operacoes",     label: "Operações",     short: "OS",       icon: Truck },
  { href: "/estoque",       label: "Estoque",       short: "Estoque",  icon: Boxes },
  { href: "/emprestimos",   label: "Empréstimos",   short: "Empr.",    icon: HandCoins },
  { href: "/notas-fiscais", label: "Notas fiscais", short: "Notas",    icon: FileText },
  { href: "/relatorios",    label: "Relatórios",    short: "Relat.",   icon: BarChart3 },
  { href: "/configuracoes", label: "Config.",       short: "Config",   icon: Settings },
];

// No celular, só 4 destinos ficam na barra; o resto vai para a folha "Mais".
const PRIMARY_COUNT = 4;
const primaryTabs = tabs.slice(0, PRIMARY_COUNT);
const moreTabs = tabs.slice(PRIMARY_COUNT);

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function TabsNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // Fecha a folha "Mais" ao navegar para outra rota.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Trava o scroll do fundo e fecha no Esc enquanto a folha está aberta.
  useEffect(() => {
    if (!moreOpen) return;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  const moreActive = moreTabs.some((t) => isActive(pathname, t.href));

  return (
    <>
      {/* ── Desktop: sticky top tab bar ───────────────────────────── */}
      <nav className="hidden sm:block bg-white dark:bg-slate-900 border-b border-produmar-100 dark:border-slate-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-2 lg:px-4">
          <div className="flex gap-0 overflow-x-auto scrollbar-hide -mb-px">
            {tabs.map((tab) => {
              const active = isActive(pathname, tab.href);
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

      {/* ── Mobile: fixed bottom nav (4 itens + Mais) ─────────────── */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 pb-safe">
        <div className="flex items-stretch h-16">
          {primaryTabs.map((tab) => {
            const active = isActive(pathname, tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "relative flex-1 flex flex-col items-center justify-center gap-1 px-0.5 transition-colors",
                  active
                    ? "text-produmar-600 dark:text-produmar-400"
                    : "text-slate-400 dark:text-slate-500 active:text-produmar-500"
                )}
              >
                {active && (
                  <span className="absolute top-0 h-0.5 w-8 rounded-full bg-produmar-600 dark:bg-produmar-400" />
                )}
                <Icon className={cn("w-6 h-6 transition-transform", active && "-translate-y-px")} />
                <span className="text-[11px] font-medium leading-none">{tab.short}</span>
              </Link>
            );
          })}

          {/* Botão "Mais" — abre a folha com os demais destinos */}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="Mais opções"
            className={cn(
              "relative flex-1 flex flex-col items-center justify-center gap-1 px-0.5 transition-colors",
              moreActive
                ? "text-produmar-600 dark:text-produmar-400"
                : "text-slate-400 dark:text-slate-500 active:text-produmar-500"
            )}
          >
            {moreActive && (
              <span className="absolute top-0 h-0.5 w-8 rounded-full bg-produmar-600 dark:bg-produmar-400" />
            )}
            <MoreHorizontal className="w-6 h-6" />
            <span className="text-[11px] font-medium leading-none">Mais</span>
          </button>
        </div>
      </nav>

      {/* ── Folha "Mais" (só no mobile) ───────────────────────────────
          Folha própria (sem Radix/histórico): os <Link> navegam normalmente.
          A versão anterior usava o Dialog, cujo history.back() de limpeza
          cancelava o router.push dos links — por isso os itens não abriam. */}
      {moreOpen && (
        <div className="sm:hidden fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in-0 duration-200"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mais opções"
            className="absolute inset-x-0 bottom-0 bg-white dark:bg-slate-900 rounded-t-2xl shadow-xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] animate-in slide-in-from-bottom duration-200"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-produmar-800 dark:text-slate-100">Mais</h2>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Fechar"
                className="p-2 -mr-2 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1">
              {moreTabs.map((tab) => {
                const active = isActive(pathname, tab.href);
                const Icon = tab.icon;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 min-h-[52px] text-[15px] font-medium transition-colors",
                      active
                        ? "bg-produmar-50 dark:bg-produmar-950/40 text-produmar-700 dark:text-produmar-300"
                        : "text-slate-700 dark:text-slate-200 active:bg-slate-100 dark:active:bg-slate-800"
                    )}
                  >
                    <span
                      className={cn(
                        "flex items-center justify-center w-9 h-9 rounded-lg",
                        active
                          ? "bg-produmar-100 dark:bg-produmar-900/50 text-produmar-600 dark:text-produmar-300"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                      )}
                    >
                      <Icon className="w-5 h-5" />
                    </span>
                    {tab.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
