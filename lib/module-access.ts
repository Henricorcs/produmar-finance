// ============================================================================
// Dados de acesso a módulos — SEM imports de ícones (seguro no middleware/edge).
// O source visual (nome, ícone, abas) fica em lib/modules.ts; aqui ficam só os
// slugs e as rotas que cada módulo "possui", para o controle de acesso.
// ============================================================================

/** Slugs dos módulos que podem ser liberados por usuário. */
export const ASSIGNABLE_MODULE_SLUGS = [
  "financas",
  "materiais-servicos",
  "ferramentas",
  "obras",
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
    "/emprestimos",
    "/notas-fiscais",
    "/relatorios",
    "/categorias",
    "/cost-centers",
  ],
  "materiais-servicos": ["/operacoes", "/estoque", "/cadastros-operacionais"],
  ferramentas: ["/ferramentas"],
  obras: ["/obras"],
};

/**
 * Rotas sempre acessíveis, independentemente dos módulos liberados
 * (hub de módulos + configurações pessoais do próprio usuário).
 */
export const MODULE_EXEMPT_PREFIXES = ["/inicio", "/configuracoes"];

function matchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

/** Retorna o slug do módulo dono da rota, ou null se a rota não pertence a nenhum. */
export function moduleSlugForPath(path: string): ModuleSlug | null {
  for (const slug of ASSIGNABLE_MODULE_SLUGS) {
    if (MODULE_ROUTE_PREFIXES[slug].some((p) => matchesPrefix(path, p))) return slug;
  }
  return null;
}

/**
 * true quando o path pertence a um módulo que o usuário NÃO tem liberado.
 * allowedModules vazio = sem restrição (acesso a tudo).
 */
export function isModuleBlocked(path: string, allowedModules: string[] | undefined): boolean {
  if (!allowedModules || allowedModules.length === 0) return false;
  if (MODULE_EXEMPT_PREFIXES.some((p) => matchesPrefix(path, p))) return false;
  const slug = moduleSlugForPath(path);
  if (!slug) return false; // rota fora de qualquer módulo → não bloqueia
  return !allowedModules.includes(slug);
}
