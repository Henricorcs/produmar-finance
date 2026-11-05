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
  PackageOpen,
  Users,
  Tractor,
  Building2,
  Printer,
  Landmark,
  PenLine,
  Ruler,
  LandPlot,
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
    description: "Dashboard, contas, notas e relatórios",
    href: "/dashboard",
    icon: Wallet,
    accentIcon:
      "bg-produmar-50 text-produmar-600 dark:bg-produmar-900/50 dark:text-produmar-300",
    tabs: [
      { href: "/dashboard",     label: "Dashboard",     short: "Início",   icon: LayoutDashboard },
      { href: "/para-onde-foi", label: "Para onde foi", short: "Despesas", icon: GitFork },
      { href: "/contas",        label: "Lançamentos",   short: "Lanç.",    icon: CalendarClock },
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
    // A ficha do VEÍCULO, que a OS não dava: a OS é do cliente, a ficha é da
    // máquina. Quem já manda em Materiais e Serviços também manda aqui — ver
    // a migration 073.
    slug: "frota",
    name: "Máquinas e Veículos",
    description: "A OS de cada veículo no calendário, com as despesas e as receitas",
    href: "/frota",
    icon: Tractor,
    accentIcon:
      "bg-teal-50 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400",
    tabs: [{ href: "/frota", label: "Máquinas e Veículos", short: "Frota", icon: Tractor }],
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
    slug: "estoque",
    name: "Estoque",
    description: "Material de consumo: cano, emenda, cola — entradas e saídas",
    href: "/almoxarifado",
    icon: PackageOpen,
    accentIcon:
      "bg-sky-50 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400",
    tabs: [{ href: "/almoxarifado", label: "Estoque", short: "Estoque", icon: PackageOpen }],
  },
  {
    // Módulo próprio, mas atrelado ao Estoque: o dia trabalhado é lançado numa
    // obra do Estoque (supply_obras), e quem manda no Estoque também manda
    // aqui. O acesso, porém, pode ser dado sozinho — ver a migration 060.
    // O slug continua "diaristas" de propósito: ele está gravado no
    // profiles.allowed_modules de quem já tem acesso, e trocar aqui tiraria a
    // permissão dessas pessoas. O que mudou foi o NOME da tela (migration 069).
    slug: "diaristas",
    name: "Colaboradores",
    description: "Diaristas, empreiteiros e CLT — dias, serviços, salários e o que se deve a cada um",
    href: "/diaristas",
    icon: Users,
    accentIcon:
      "bg-violet-50 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400",
    tabs: [
      { href: "/diaristas", label: "Colaboradores", short: "Colab.", icon: Users },
    ],
  },
  {
    // Duas listas de obra moram aqui: as do cadastro (public.obras, com número,
    // orçamento e OS) e as do Estoque (supply_obras, que recebem material e
    // metro de cerca). São cadastros diferentes, na mesma tela — ver a 065.
    slug: "obras",
    name: "Obras",
    description: "Cadastro, custos e material consumido por obra",
    href: "/obras",
    icon: HardHat,
    accentIcon:
      "bg-orange-50 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400",
    // O Medir cerca morava aqui; passou para Medições (pedido do dono, 05/11/2026).
    // Quem tem só Obras continua abrindo /medir-cerca — ver lib/module-access.ts.
    tabs: [{ href: "/obras", label: "Obras", short: "Obras", icon: HardHat }],
  },
  {
    // O lote medido pelo GPS: anda no terreno marcando os cantos e o sistema
    // desenha o mapa e dá a área em m² e hectares — ver a migration 131. O
    // Medir cerca (a metragem de uma cerca pelo GPS) mora aqui também.
    slug: "medicoes",
    name: "Medições",
    description: "Pelo GPS: o mapa do lote com m² e hectares, e a metragem da cerca",
    href: "/medicoes",
    icon: LandPlot,
    accentIcon:
      "bg-lime-50 text-lime-700 dark:bg-lime-900/40 dark:text-lime-400",
    tabs: [
      { href: "/medicoes", label: "Lotes", short: "Lotes", icon: LandPlot },
      // a conta é no celular, pelo GPS: começo e fim da cerca → metragem
      { href: "/medir-cerca", label: "Medir cerca", short: "Cerca", icon: Ruler },
    ],
  },
  {
    // Os imóveis alugados: cadastro com código, contrato preenchido e o
    // aluguel de cada mês dando baixa — ver a migration 078.
    slug: "alugueis",
    name: "Aluguéis",
    description: "Imóveis, impressoras, contratos e a cobrança de cada mês",
    href: "/alugueis",
    icon: Building2,
    accentIcon:
      "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400",
    tabs: [
      { href: "/alugueis", label: "Imóveis", short: "Imóveis", icon: Building2 },
      // o aluguel de impressoras: contador de cada mês e a fatura (migration 096)
      { href: "/impressoras", label: "Impressoras", short: "Impress.", icon: Printer },
      // qualquer PDF assinado com certificado A1, e o arquivo por certificado (124)
      { href: "/assinar", label: "Assinar digitalmente", short: "Assinar", icon: PenLine },
    ],
  },
  {
    // QUEM DEVE PARA A EMPRESA. Isto morava numa aba lá dentro de Finanças,
    // a três toques de distância — e cobrança é coisa de olhar todo dia, não
    // de caçar no meio do dashboard. Mesma tabela de sempre (`loans`): o que
    // mudou foi o caminho, então nada do que já estava lançado se perdeu.
    slug: "devedores",
    name: "Devedores",
    description: "Quem deve, quanto falta, quando vence e o que já foi pago",
    href: "/devedores",
    icon: HandCoins,
    accentIcon:
      "bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-400",
    tabs: [{ href: "/devedores", label: "Devedores", short: "Devedores", icon: HandCoins }],
  },
  {
    // As notas emitidas para a prefeitura, um controle por secretaria, com a
    // data da baixa do pagamento. Era uma planilha — ver a migration 102.
    slug: "prefeitura",
    name: "Prefeitura",
    description: "Notas emitidas para cada secretaria e o que já foi pago",
    href: "/prefeitura",
    icon: Landmark,
    accentIcon:
      "bg-cyan-50 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400",
    tabs: [{ href: "/prefeitura", label: "Prefeitura", short: "Prefeit.", icon: Landmark }],
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

/**
 * O módulo do jeito que ESTE papel enxerga. O operador não tem a aba de OS em
 * Materiais e Serviços: a página /operacoes manda ele para o Painel de OS, e a
 * aba só duplicava o painel que ele já tem no hub. Para ele o módulo abre
 * direto no Estoque.
 */
function moduloDoPapel(m: AppModule, role?: string): AppModule {
  if (role === "operador" && m.slug === "materiais-servicos") {
    const tabs = m.tabs.filter((t) => t.href !== "/operacoes");
    return { ...m, href: tabs[0]?.href ?? m.href, tabs };
  }
  return m;
}

/** Encontra o módulo dono da rota atual (para a nav contextual). */
export function findModuleByPath(pathname: string, role?: string): AppModule | undefined {
  const m = APP_MODULES.find((m) =>
    m.tabs.some((t) => pathname === t.href || pathname.startsWith(t.href + "/"))
  );
  return m ? moduloDoPapel(m, role) : undefined;
}

/**
 * Módulos visíveis para um usuário conforme seu perfil.
 *  • admin → todos os módulos.
 *  • operador/encarregado/visualizador → SÓ os módulos liberados explicitamente
 *    (vazio = nenhum; esses perfis são fechados por padrão e têm tela própria).
 *  • financeiro → vazio = todos (aberto por padrão); caso contrário os liberados.
 */
export function modulesForProfile(
  allowedModules: string[] | undefined,
  role?: string
): AppModule[] {
  if (role === "admin") return APP_MODULES;

  const allowed = allowedModules ?? [];

  if (role === "operador" || role === "encarregado" || role === "visualizador") {
    if (allowed.length === 0) return [];
    return APP_MODULES.filter((m) => allowed.includes(m.slug)).map((m) =>
      moduloDoPapel(m, role)
    );
  }

  // financeiro (e demais): aberto por padrão
  if (allowed.length === 0) return APP_MODULES;
  return APP_MODULES.filter((m) => allowed.includes(m.slug));
}
