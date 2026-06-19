import { brandIcon } from "@/lib/og-icon";

// Ícone da tela inicial no iOS ("Adicionar à Tela de Início" / app web).
// O iOS usa o apple-touch-icon (PNG) — não o favicon SVG.
// Edge: é como o @vercel/og (ImageResponse) renderiza de forma confiável.
export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return brandIcon(180);
}
