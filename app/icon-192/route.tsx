import { brandIcon } from "@/lib/og-icon";

// Ícone 192x192 do manifest (PWA/Android). Servido em /icon-192.
// Edge: é como o @vercel/og (ImageResponse) renderiza de forma confiável.
export const runtime = "edge";

export function GET() {
  return brandIcon(192);
}
