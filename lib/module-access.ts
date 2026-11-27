// ============================================================================
// Dados de acesso a módulos — SEM imports de ícones (seguro no middleware/edge).
// O source visual (nome, ícone, abas) fica em lib/modules.ts; aqui ficam só os
// slugs e as rotas que cada módulo "possui", para o controle de acesso.
// ============================================================================

/** Slugs dos módulos que podem ser liberados por usuário. */
export const ASSIGNABLE_MODULE_SLUGS = [
  "financas",
  "materiais-servicos",
  "frota",
  "ferramentas",
  "estoque",
  "diaristas",
  "obras",
  "animais",
  "alugueis",
  "devedores",
  "prefeitura",
  "medicoes",
  "chacaras",
] as const;

export type ModuleSlug = (typeof ASSIGNABLE_MODULE_SLUGS)[number];

/**
 * Prefixos de rota que pertencem a cada módulo. Usado para bloquear acesso
 * direto por URL a um módulo não liberado.
 */
export const MODULE_ROUTE_PREFIXES: Record<ModuleSlug, string[]> = {
  financas: [
    "/dashboard",
    "/para-onde-foi",
    "/contas",
    "/notas-fiscais",
    "/relatorios",
    "/categorias",
    "/cost-centers",
  ],
  "materiais-servicos": ["/operacoes", "/estoque", "/cadastros-operacionais"],
  // Frota: a ficha de cada máquina e veículo (migration 073)
  frota: ["/frota"],
  ferramentas: ["/ferramentas"],
  // Estoque de consumo — rota /almoxarifado (o /estoque é a tela de jazidas)
  estoque: ["/almoxarifado"],
  // Módulo próprio, mas o dado é atrelado ao Estoque (a diária cai numa obra
  // de supply_obras) — ver lib/modules.ts e a migration 060.
  // A Alimentação (quem comeu o bandeco) mora no mesmo módulo (154).
  diaristas: ["/diaristas", "/alimentacao"],
  obras: ["/obras", "/medir-cerca"],
  animais: ["/animais"],
  // Aluguéis: imóveis, contratos e o aluguel de cada mês (migration 078) — e
  // o aluguel de impressoras, com a leitura do contador (migration 096)
  alugueis: ["/alugueis", "/impressoras", "/assinar"],
  // Devedores: quem deve para a empresa. Era a aba /emprestimos dentro de
  // Finanças; virou módulo próprio, e a rota velha redireciona para cá.
  devedores: ["/devedores", "/emprestimos"],
  // Prefeitura: notas emitidas por secretaria e a baixa (migration 102)
  prefeitura: ["/prefeitura"],
  // Medições: o lote marcado pelo GPS, com mapa e área (migration 131), e o
  // Medir cerca. A cerca também fica em Obras, onde morava: quem tem só Obras
  // não perde a tela — a rota abre para quem tem QUALQUER um dos dois.
  medicoes: ["/medicoes", "/medir-cerca"],
  // Chácaras: a agenda dos aluguéis do Sítio Castro e da Chácara Thalles (142)
  chacaras: ["/chacaras"],
};

/**
 * Rotas sempre acessíveis, independentemente dos módulos liberados
 * (hub de módulos + configurações pessoais do próprio usuário).
 */
export const MODULE_EXEMPT_PREFIXES = ["/inicio", "/configuracoes"];

// ============================================================================
// PERMISSÕES AVULSAS
// ============================================================================
// Um módulo é uma tela inteira, com card no hub e nav própria. Isto aqui é
// outra coisa: libera UM PEDAÇO de uma tela que a pessoa já alcança.
//
// O caso que a criou: o operador já entra no painel dele todo dia para receber
// a OS. Nem todo operador precisa avisar material levado à obra — só quem
// descarrega. Dar um MÓDULO a ele o jogaria para o hub e a nav dos módulos, que
// é justamente o que o perfil de operador não deve ver.
//
// Por isso a permissão avulsa entra na mesma lista de allowed_modules (o
// admin marca no cadastro do usuário), mas NÃO vira card no hub e NÃO muda o
// layout de quem a recebe.
// ============================================================================

/** Avisar o material levado para a obra, na aba do painel do operador. */
export const AVISO_MATERIAL_SLUG = "aviso-material";

/**
 * Lançar a leitura dos contadores das impressoras alugadas, na aba do painel
 * do operador. Quem lê o contador é quem vai de impressora em impressora — e o
 * relatório em PDF sai dali mesmo (migration 097).
 */
export const LEITURA_IMPRESSORAS_SLUG = "leitura-impressoras";

export const EXTRA_PERMISSIONS = [
  {
    slug: AVISO_MATERIAL_SLUG,
    name: "Avisar material da obra",
    description: "Aba no painel do operador para informar o material que ele levou",
  },
  {
    slug: LEITURA_IMPRESSORAS_SLUG,
    name: "Leitura das impressoras",
    description: "Aba no painel do operador para lançar o contador e tirar o relatório em PDF",
  },
] as const;

const EXTRA_SLUGS: readonly string[] = EXTRA_PERMISSIONS.map((p) => p.slug);

/**
 * Tem MÓDULO de verdade (dos que viram card no hub)? Uma permissão avulsa
 * sozinha não conta: quem só a recebeu continua com a tela simples de sempre.
 */
export function hasHubModules(allowedModules: string[] | undefined): boolean {
  return (allowedModules ?? []).some((m) => !EXTRA_SLUGS.includes(m));
}

/**
 * Pode avisar o material que levou para a obra? O admin sempre (é ele quem
 * confere); operador e encarregado, só com a permissão marcada no cadastro.
 * Qualquer outro perfil, não — o técnico tem a tela dele.
 */
export function canAvisarMaterial(
  role: string | undefined,
  allowedModules: string[] | undefined
): boolean {
  if (role === "admin") return true;
  if (role !== "operador" && role !== "encarregado") return false;
  return (allowedModules ?? []).includes(AVISO_MATERIAL_SLUG);
}

// ============================================================================
// QUEM PODE RECEBER UMA OS
// ============================================================================
// A OS cai no painel de quem foi escolhido no campo "enviar para". Essa lista
// era só de operador e encarregado: o admin não aparecia nela, então não havia
// como passar um serviço para o outro dono do sistema — ele só ficava sabendo
// se alguém contasse.
//
// O admin entra na lista porque tem o mesmo caminho dos outros: o Painel de OS
// no hub, o aviso no celular e o iniciar/finalizar da própria OS (a policy da
// migration 075 vai pelo assigned_to, não pelo papel).
// ============================================================================

/** Papéis que aparecem no "enviar para" e têm painel de OS. */
export const PAPEIS_QUE_RECEBEM_OS = ["operador", "encarregado", "admin"] as const;

/** Este perfil recebe OS no painel dele? */
export function recebeOs(role: string | undefined): boolean {
  return (PAPEIS_QUE_RECEBEM_OS as readonly string[]).includes(role ?? "");
}

/**
 * O nome como ele aparece na lista do "enviar para". O admin leva a marca do
 * papel: numa lista onde antes só havia operador, saber que aquele nome é do
 * escritório evita mandar a OS para a pessoa errada.
 */
export function nomeComPapel(nome: string, role: string | undefined): string {
  return role === "admin" ? `${nome} · admin` : nome;
}

/** A rota da aba — o middleware confere a permissão antes de deixar entrar. */
export function isAvisoMaterialPath(path: string): boolean {
  return matchesPrefix(path, "/operador/material");
}

/**
 * Pode lançar a leitura das impressoras pelo painel? O admin sempre; operador e
 * encarregado, só com "Leitura das impressoras" marcada no cadastro.
 */
export function canLerImpressoras(
  role: string | undefined,
  allowedModules: string[] | undefined
): boolean {
  if (role === "admin") return true;
  if (role !== "operador" && role !== "encarregado") return false;
  return (allowedModules ?? []).includes(LEITURA_IMPRESSORAS_SLUG);
}

export function isLeituraImpressorasPath(path: string): boolean {
  return matchesPrefix(path, "/operador/impressoras");
}

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

/**
 * Todos os módulos que abrem esta rota. Quase sempre é um só; o Medir cerca é
 * de Obras e de Medições — basta ter um deles.
 */
export function moduleSlugsForPath(path: string): ModuleSlug[] {
  return ASSIGNABLE_MODULE_SLUGS.filter((slug) =>
    MODULE_ROUTE_PREFIXES[slug].some((p) => matchesPrefix(path, p))
  );
}

/**
 * true quando o path pertence a um módulo que o usuário NÃO tem liberado.
 * allowedModules vazio = sem restrição (acesso a tudo).
 */
export function isModuleBlocked(path: string, allowedModules: string[] | undefined): boolean {
  if (!allowedModules || allowedModules.length === 0) return false;
  if (MODULE_EXEMPT_PREFIXES.some((p) => matchesPrefix(path, p))) return false;
  const slugs = moduleSlugsForPath(path);
  if (slugs.length === 0) return false; // rota fora de qualquer módulo → não bloqueia
  return !slugs.some((s) => allowedModules.includes(s));
}
