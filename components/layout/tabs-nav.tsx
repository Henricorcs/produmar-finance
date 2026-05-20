"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  GitFork,
  CalendarClock,
  FileText,
  BarChart3,
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/para-onde-foi", label: "Para onde foi", icon: GitFork },
  { href: "/contas", label: "Contas", icon: CalendarClock },
  { href: "/notas-fiscais", label: "Notas fiscais", icon: FileText },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/configuracoes", label: "Config.", icon: Settings }
];

export function TabsNav() {
  const pathname = usePathname();

  return (
    <nav className="bg-white dark:bg-slate-900 border-b border-produmar-100 dark:border-slate-800 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-2 lg:px-4">
        <div className="flex gap-0 overflow-x-auto scrollbar-hide -mb-px">
          {tabs.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
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
  );
}
