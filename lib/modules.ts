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
  Wallet,
  Wrench,
  HardHat,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";

export type ModuleTab = {
  href: string;
  label: string;
  short: string;
  icon: LucideIcon;
};

export type AppModule = {
  slug: string;
  name: string;
  description: string;
  href: string;
  icon: LucideIcon;
  /** Classes do quadrado do ícone no hub de módulos */
  accentIcon: string;
  /** Fase futura — o card mostra o selo "Em breve" */
  comingSoon?: string;
  tabs: ModuleTab[];
};

export const APP_MODULES: AppModule[] = [
  {
    slug: "financas",
    name: "Finanças",
    description: "Dashboard, contas, empréstimos, notas e relatórios",
    href: "/dashboard",
    icon: Wallet,
    accentIcon:
      "bg-produmar-50 text-produmar-600 dark:bg-produmar-900/50 dark:text-produmar-300",
    tabs: [
      { href: "/dashboard",     label: "Dashboard",     short: "Início",   icon: LayoutDashboard },
      { href: "/para-onde-foi", label: "Para onde foi", short: "Despesas", icon: GitFork },
      { href: "/contas",        label: "Contas",        short: "Contas",   icon: CalendarClock },
      { href: "/emprestimos",   label: "Empréstimos",   short: "Empr.",    icon: HandCoins },
      { href: "/notas-fiscais", label: "Notas fiscais", short: "Notas",    icon: FileText },
      { href: "/relatorios",    label: "Relatórios",    short: "Relat.",   icon: BarChart3 },
      { href: "/configuracoes", label: "Config.",       short: "Config",   icon: Settings },
    ],
  },
  {
    slug: "materiais-servicos",
    name: "Materiais e Serviços",
    description: "Ordens de serviço, estoque e cadastros",
    href: "/operacoes",
    icon: Truck,
    accentIcon:
      "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400",
    tabs: [
      { href: "/operacoes",              label: "Operações", short: "OS",        icon: Truck },
      { href: "/estoque",                label: "Estoque",   short: "Estoque",   icon: Boxes },
      { href: "/cadastros-operacionais", label: "Cadastros", short: "Cadastros", icon: ClipboardList },
    ],
  },
  {
    slug: "ferramentas",
    name: "Ferramentas",
    description: "Cadastro, retiradas e manutenção de ferramentas",
    href: "/ferramentas",
    icon: Wrench,
    accentIcon:
      "bg-amber-50 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
    tabs: [{ href: "/ferramentas", label: "Ferramentas", short: "Ferram.", icon: Wrench }],
  },
  {
    slug: "obras",
    name: "Obras",
    description: "Gestão e acompanhamento de obras",
    href: "/obras",
    icon: HardHat,
    accentIcon:
      "bg-orange-50 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400",
    tabs: [{ href: "/obras", label: "Obras", short: "Obras", icon: HardHat }],
  },
];

/** Encontra o módulo dono da rota atual (para a nav contextual). */
export function findModuleByPath(pathname: string): AppModule | undefined {
  return APP_MODULES.find((m) =>
    m.tabs.some((t) => pathname === t.href || pathname.startsWith(t.href + "/"))
  );
}
