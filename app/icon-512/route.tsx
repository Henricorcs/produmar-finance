import { brandIcon } from "@/lib/og-icon";

// Ícone 512x512 do manifest (PWA/Android). Servido em /icon-512.
// Edge: é como o @vercel/og (ImageResponse) renderiza de forma confiável.
export const runtime = "edge";

export function GET() {
  return brandIcon(512);
}
