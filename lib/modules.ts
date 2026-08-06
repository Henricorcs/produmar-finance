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
  Beef,
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
    name: "Patrimônio",
    description: "Almoxarifados, empréstimos, saldo e valor do patrimônio",
    href: "/ferramentas",
    icon: Wrench,
    accentIcon:
      "bg-amber-50 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
    tabs: [{ href: "/ferramentas", label: "Patrimônio", short: "Patrim.", icon: Wrench }],
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
  {
    slug: "animais",
    name: "Animais",
    description: "Vacinação do rebanho, com ficha do animal para imprimir",
    href: "/animais",
    icon: Beef,
    accentIcon:
      "bg-rose-50 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400",
    tabs: [{ href: "/animais", label: "Animais", short: "Animais", icon: Beef }],
  },
];

/** Encontra o módulo dono da rota atual (para a nav contextual). */
export function findModuleByPath(pathname: string): AppModule | undefined {
  return APP_MODULES.find((m) =>
    m.tabs.some((t) => pathname === t.href || pathname.startsWith(t.href + "/"))
  );
}

/**
 * Módulos visíveis para um usuário conforme seu perfil.
 *  • admin → todos os módulos.
 *  • operador/visualizador → SÓ os módulos liberados explicitamente
 *    (vazio = nenhum; esses perfis são fechados por padrão e têm tela própria).
 *  • financeiro → vazio = todos (aberto por padrão); caso contrário os liberados.
 */
export function modulesForProfile(
  allowedModules: string[] | undefined,
  role?: string
): AppModule[] {
  if (role === "admin") return APP_MODULES;

  const allowed = allowedModules ?? [];

  if (role === "operador" || role === "visualizador") {
    if (allowed.length === 0) return [];
    return APP_MODULES.filter((m) => allowed.includes(m.slug));
  }

  // financeiro (e demais): aberto por padrão
  if (allowed.length === 0) return APP_MODULES;
  return APP_MODULES.filter((m) => allowed.includes(m.slug));
}
